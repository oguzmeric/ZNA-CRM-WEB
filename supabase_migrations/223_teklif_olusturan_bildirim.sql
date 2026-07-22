-- 223_teklif_olusturan_bildirim.sql
-- Teklifi OLUŞTURAN kişi, teklifi hakkında verilen HER kararda bildirim alsın.
--
-- Sorun: onay/red/müşteri kararı yalnızca YETKİLİLERE bildirim üretiyordu
-- (teklifOnayaDustuBildir / siparisOnayinaGeldiBildir). Teklifi hazırlayan kişi
-- hiçbir aşamada haber almıyordu — "teklifim onaylandı mı?" diye listeye bakmak
-- zorundaydı.
--
-- İkinci sorun: "oluşturan" bilgisi yalnız serbest metin `hazirlayan` alanındaydı
-- (1123 teklifin 1038'inde BOŞ, ayrıca formdan elle değiştirilebiliyor). Güvenilir
-- bir alıcı anahtarı yoktu.
--
-- Çözüm:
--   1) teklifler.olusturan_id (gerçek FK) + olusturan_ad
--   2) BEFORE INSERT trigger — auth.uid()'den otomatik damga (web + mobil + gelecek istemciler)
--   3) Geriye dönük backfill: teklif_onayi.gonderen_id → hazirlayan adı → temsilci adı
--   4) AFTER UPDATE trigger — karar anında bildirimler'e INSERT
--
-- Neden DB trigger (istemci kodu değil): karar web'den, mobilden, edge fn'den ya da
-- doğrudan DB'den gelebilir. "Her koşulda bildirim alsın" ancak sunucu tarafında
-- garanti edilir. Ayrıca bildirimler INSERT → tr_bildirim_push → Expo push zinciri
-- sayesinde mobil push'u da bedavaya geliyor.

begin;

-- ── 1) Kolonlar ────────────────────────────────────────────────────────────
alter table public.teklifler
  add column if not exists olusturan_id bigint references public.kullanicilar(id) on delete set null,
  add column if not exists olusturan_ad text;

create index if not exists idx_teklifler_olusturan_id on public.teklifler(olusturan_id);

comment on column public.teklifler.olusturan_id is
  'Teklifi oluşturan personel (kullanicilar.id). Karar bildirimlerinin alıcısı. BEFORE INSERT trigger auth.uid()''den damgalar.';

-- ── 2) Alıcı çözümleyici — TEK KAYNAK ──────────────────────────────────────
-- Eski kayıtlarda olusturan_id boş kalabilir (backfill hiçbir eşleşme bulamazsa).
-- Fallback zinciri sayesinde bildirim yine de doğru kişiye gider.
create or replace function public.teklif_olusturan_bul(p_teklif public.teklifler)
returns bigint
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id bigint;
begin
  -- a) Gerçek FK
  if p_teklif.olusturan_id is not null then
    return p_teklif.olusturan_id;
  end if;

  -- b) Onaya gönderen — onay akışından geçmiş her teklifte dolu
  if coalesce(p_teklif.teklif_onayi->>'gonderen_id', '') ~ '^[0-9]+$' then
    v_id := (p_teklif.teklif_onayi->>'gonderen_id')::bigint;
    if exists (select 1 from public.kullanicilar k where k.id = v_id) then
      return v_id;
    end if;
  end if;

  -- c) hazirlayan serbest metnini isimle eşle (tr_kucuk — İ/I tuzağı)
  if coalesce(p_teklif.hazirlayan, '') <> '' then
    select k.id into v_id
      from public.kullanicilar k
     where tr_kucuk(k.ad) = tr_kucuk(p_teklif.hazirlayan)
       and coalesce(k.hesap_silindi, false) = false
     order by k.id
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- d) Müşteri temsilcisi
  if coalesce(p_teklif.musteri_temsilcisi, '') <> '' then
    select k.id into v_id
      from public.kullanicilar k
     where tr_kucuk(k.ad) = tr_kucuk(p_teklif.musteri_temsilcisi)
       and coalesce(k.hesap_silindi, false) = false
     order by k.id
     limit 1;
  end if;

  return v_id;
end;
$$;

revoke all on function public.teklif_olusturan_bul(public.teklifler) from anon;
grant execute on function public.teklif_olusturan_bul(public.teklifler) to authenticated;

-- ── 3) BEFORE INSERT — oluşturan damgası ───────────────────────────────────
create or replace function public.teklif_olusturan_damgala()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id bigint;
  v_ad text;
begin
  if new.olusturan_id is null then
    select k.id, k.ad into v_id, v_ad
      from public.kullanicilar k
     where k.auth_id = auth.uid()
     limit 1;
    if v_id is not null then
      new.olusturan_id := v_id;
      new.olusturan_ad := coalesce(nullif(new.olusturan_ad, ''), v_ad);
    end if;
  end if;
  -- Oturum yoksa (edge fn / içe aktarım) en azından adı taşı
  if coalesce(new.olusturan_ad, '') = '' then
    new.olusturan_ad := nullif(new.hazirlayan, '');
  end if;
  return new;
exception when others then
  raise warning '[teklif_olusturan_damgala] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists tr_teklif_olusturan_damgala on public.teklifler;
create trigger tr_teklif_olusturan_damgala
  before insert on public.teklifler
  for each row execute function public.teklif_olusturan_damgala();

-- ── 4) Backfill — mevcut 1100+ teklif ──────────────────────────────────────
-- a) teklif_onayi.gonderen_id (en güvenilir)
update public.teklifler t
   set olusturan_id = k.id,
       olusturan_ad = coalesce(nullif(t.olusturan_ad, ''), k.ad)
  from public.kullanicilar k
 where t.olusturan_id is null
   and coalesce(t.teklif_onayi->>'gonderen_id', '') ~ '^[0-9]+$'
   and k.id = (t.teklif_onayi->>'gonderen_id')::bigint;

-- b) hazirlayan adı eşleşmesi
update public.teklifler t
   set olusturan_id = k.id,
       olusturan_ad = coalesce(nullif(t.olusturan_ad, ''), k.ad)
  from public.kullanicilar k
 where t.olusturan_id is null
   and coalesce(t.hazirlayan, '') <> ''
   and tr_kucuk(k.ad) = tr_kucuk(t.hazirlayan)
   and coalesce(k.hesap_silindi, false) = false;

-- c) müşteri temsilcisi adı eşleşmesi
update public.teklifler t
   set olusturan_id = k.id,
       olusturan_ad = coalesce(nullif(t.olusturan_ad, ''), k.ad)
  from public.kullanicilar k
 where t.olusturan_id is null
   and coalesce(t.musteri_temsilcisi, '') <> ''
   and tr_kucuk(k.ad) = tr_kucuk(t.musteri_temsilcisi)
   and coalesce(k.hesap_silindi, false) = false;

-- ── 5) AFTER UPDATE — karar bildirimi ──────────────────────────────────────
-- Tetiklenen kararlar:
--   teklif_onayi.durum  → onayli / reddedildi        (yönetici kararı)
--   siparis_onayi.durum → onayli / reddedildi        (sipariş onayı)
--   onay_durumu/spek_durum → kabul / vazgecildi      (müşteri kararı)
-- NOT: Kararı veren kişi teklifin sahibiyse de bildirim gider — kullanıcı talebi
-- "her koşulda bildirim alsın". Yetkili bildirimlerindeki "gönderen hariç" filtresi
-- burada BİLİNÇLİ olarak yok.
create or replace function public.teklif_karar_bildirim()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_alici    bigint;
  v_gonderen bigint;
  v_no       text;
  v_firma    text;
  v_link     text;
  v_kim      text;
  v_eski_t   text;
  v_yeni_t   text;
  v_eski_s   text;
  v_yeni_s   text;
  v_olaylar  jsonb := '[]'::jsonb;
  v_olay     jsonb;
  v_musteri_kabul  boolean;
  v_musteri_red    boolean;
begin
  v_alici := public.teklif_olusturan_bul(new);
  if v_alici is null then
    return new;   -- alıcı çözülemedi (çok eski / artık kayıt) — sessiz geç
  end if;

  v_no    := coalesce(nullif(new.teklif_no, ''), '#' || new.id::text);
  v_firma := coalesce(nullif(new.firma_adi, ''), 'Müşteri —');
  v_link  := '/teklifler/' || new.id::text;

  v_eski_t := old.teklif_onayi->>'durum';
  v_yeni_t := new.teklif_onayi->>'durum';
  v_eski_s := old.siparis_onayi->>'durum';
  v_yeni_s := new.siparis_onayi->>'durum';

  -- 1) Yönetici teklif onayı
  if v_yeni_t is distinct from v_eski_t then
    v_kim := coalesce(nullif(new.teklif_onayi->>'onaylayan_ad', ''), 'Yönetim');
    if v_yeni_t = 'onayli' then
      v_olaylar := v_olaylar || jsonb_build_object(
        'baslik', 'Teklifiniz Onaylandı',
        'mesaj', v_firma || ' — "' || v_no || '" teklifiniz ' || v_kim ||
                 ' tarafından onaylandı. Artık müşteriye gönderebilirsiniz.',
        'tip', 'teklif');
    elsif v_yeni_t = 'reddedildi' then
      v_olaylar := v_olaylar || jsonb_build_object(
        'baslik', 'Teklifiniz Reddedildi — Revizyon İstendi',
        'mesaj', v_firma || ' — "' || v_no || '" teklifiniz ' || v_kim ||
                 ' tarafından reddedildi. Gerekçe: ' ||
                 coalesce(nullif(new.teklif_onayi->>'red_nedeni', ''), 'Belirtilmedi'),
        'tip', 'teklif');
    end if;
  end if;

  -- 2) Sipariş onayı
  if v_yeni_s is distinct from v_eski_s then
    v_kim := coalesce(nullif(new.siparis_onayi->>'onaylayan_ad', ''), 'Yönetim');
    if v_yeni_s = 'onayli' then
      v_olaylar := v_olaylar || jsonb_build_object(
        'baslik', 'Teklifiniz Siparişe Dönüştü',
        'mesaj', v_firma || ' — "' || v_no || '" teklifiniz ' || v_kim ||
                 ' tarafından sipariş onayından geçti.',
        'tip', 'siparis');
    elsif v_yeni_s = 'reddedildi' then
      v_olaylar := v_olaylar || jsonb_build_object(
        'baslik', 'Sipariş Onayı Reddedildi',
        'mesaj', v_firma || ' — "' || v_no || '" teklifinizin sipariş onayı ' || v_kim ||
                 ' tarafından reddedildi. Gerekçe: ' ||
                 coalesce(nullif(new.siparis_onayi->>'red_nedeni', ''), 'Belirtilmedi'),
        'tip', 'siparis');
    end if;
  end if;

  -- 3) Müşteri kararı — onay_durumu ve spek_durum aynı UPDATE'te birlikte yazılır
  --    (durumdanDbAlanlar), tek boolean ile mükerrer bildirim engellenir.
  v_musteri_kabul :=
       (new.onay_durumu is distinct from old.onay_durumu and new.onay_durumu = 'kabul')
    or (new.spek_durum  is distinct from old.spek_durum  and new.spek_durum  = 'musteri_onayladi');
  v_musteri_red :=
       (new.onay_durumu is distinct from old.onay_durumu and new.onay_durumu = 'vazgecildi')
    or (new.spek_durum  is distinct from old.spek_durum  and new.spek_durum  = 'musteri_reddetti');

  if v_musteri_kabul then
    v_olaylar := v_olaylar || jsonb_build_object(
      'baslik', 'Müşteri Teklifinizi Kabul Etti',
      'mesaj', v_firma || ' — "' || v_no || '" teklifiniz müşteri tarafından kabul edildi.',
      'tip', 'teklif');
  elsif v_musteri_red then
    v_olaylar := v_olaylar || jsonb_build_object(
      'baslik', 'Müşteri Teklifinizi Reddetti',
      'mesaj', v_firma || ' — "' || v_no || '" teklifiniz müşteri tarafından reddedildi.',
      'tip', 'teklif');
  end if;

  if jsonb_array_length(v_olaylar) = 0 then
    return new;
  end if;

  select k.id into v_gonderen
    from public.kullanicilar k
   where k.auth_id = auth.uid()
   limit 1;

  for v_olay in select value from jsonb_array_elements(v_olaylar) loop
    insert into public.bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link, meta)
    values (
      v_alici,
      v_gonderen,
      v_olay->>'baslik',
      v_olay->>'mesaj',
      v_olay->>'tip',
      v_link,
      jsonb_build_object('teklifId', new.id, 'teklifNo', v_no)
    );
  end loop;

  return new;
exception when others then
  -- Bildirim asla teklif güncellemesini bozmasın
  raise warning '[teklif_karar_bildirim] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists tr_teklif_karar_bildirim on public.teklifler;
create trigger tr_teklif_karar_bildirim
  after update on public.teklifler
  for each row execute function public.teklif_karar_bildirim();

commit;
