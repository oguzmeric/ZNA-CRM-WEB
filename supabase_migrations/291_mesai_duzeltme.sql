-- 291 — Mesai kaydı düzeltme: denetim defteri + üç kapılı RPC
--
-- İHTİYAÇ: `mesai_kayitlari` üzerinde SADECE bir SELECT politikası var;
-- INSERT/UPDATE/DELETE politikası YOK. Yani tabloya yazan tek yol edge fn'ler
-- (service_role) ve elle SQL. Yönetici her düzeltme için geliştiriciye SQL
-- yazdırıyordu — Alp Aslan'ın üç günü (13-15.08) böyle düzeltildi.
--
-- TASARIM KARARI — tabloyu RLS ile AÇMIYORUZ:
-- Alternatif "authenticated'a INSERT/UPDATE/DELETE politikası ver" olurdu.
-- Seçilmedi, çünkü bordroya giren veride her değişiklik SEBEP + İZ ister ve
-- politika bunu zorlayamaz (istemci sebep göndermeyi unutabilir, log yazmayı
-- atlayabilir). Bunun yerine tablo KAPALI kalıyor; tek giriş noktası aşağıdaki
-- üç SECURITY DEFINER fonksiyonu. Yetki kapısı, sebep zorunluluğu ve denetim
-- satırı fonksiyonun İÇİNDE — atlanamaz.
-- (Aynı ders: stok defterini DB trigger'ı yazar, istemci yazmaz.)
--
-- YETKİ: ik_yetkili() = 'ik_yonetim' modülü olanlar → Ali (1), Oğuz (2),
-- Abdullah (44). ⚠️ admin BYPASS EDEMEZ (20.07 kullanıcı kararı, mig 205).
-- Ferdi mesai raporunu GÖRÜR ama düzeltemez — görüntüleme yetkisi daha geniş.

begin;

-- ── 1) DENETİM DEFTERİ ───────────────────────────────────────────────────────
create table if not exists public.mesai_duzeltmeleri (
  id                bigserial primary key,
  -- ⚠️ mesai_id'ye FK KOYULMADI (bilerek): kayıt silinince izi de silinmemeli.
  -- Silme işleminin denetim satırı, artık var olmayan bir id'yi gösterir.
  mesai_id          uuid,
  kullanici_id      bigint,          -- mesainin SAHİBİ (kimin puantajı etkilendi)
  islem             text not null check (islem in ('ekle', 'guncelle', 'sil')),
  eski              jsonb,           -- guncelle/sil öncesi tam satır
  yeni              jsonb,           -- ekle/guncelle sonrası tam satır
  sebep             text not null,
  yapan_id          bigint,          -- düzeltmeyi yapan yönetici
  yapan_ad          text,            -- o günkü adı (kişi sonradan silinse de okunur)
  olusturma_tarihi  timestamptz not null default now()
);

create index if not exists mesai_duzeltme_mesai   on public.mesai_duzeltmeleri(mesai_id);
create index if not exists mesai_duzeltme_kisi    on public.mesai_duzeltmeleri(kullanici_id, olusturma_tarihi desc);
create index if not exists mesai_duzeltme_zaman   on public.mesai_duzeltmeleri(olusturma_tarihi desc);

alter table public.mesai_duzeltmeleri enable row level security;

-- Okuma: İK yetkilileri + admin. Yazma politikası YOK — yalnız SECURITY DEFINER
-- fonksiyonlar yazar, onlar da RLS'i bypass eder.
drop policy if exists mesai_duzeltme_okur on public.mesai_duzeltmeleri;
create policy mesai_duzeltme_okur on public.mesai_duzeltmeleri
  for select using ((select ik_yetkili()) or (select is_admin()));

revoke all on public.mesai_duzeltmeleri from anon;

-- ── 2) ORTAK YARDIMCILAR ─────────────────────────────────────────────────────
-- Çağıranın kullanicilar satırı. SECURITY DEFINER fonksiyonlar içinde auth.uid()
-- yine ÇAĞIRANI gösterir (definer'ı değil) — kimlik güvenle buradan okunur.
create or replace function public.mesai_duzeltme_yapan()
returns table (id bigint, ad text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select k.id, k.ad from kullanicilar k where k.auth_id = auth.uid() limit 1;
$$;

-- Denetim defterine ve mesai satırına aynı sözlükle bakalım: tek yerde tanımlı
-- alan seti, üç fonksiyon da bunu kullanır.
create or replace function public.mesai_satir_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select to_jsonb(x) from (
    select id, kullanici_id, giris_zamani, cikis_zamani, sure_dakika, tip, not_,
           giris_lat, giris_lng, giris_mesafe_m, cikis_lat, cikis_lng
      from mesai_kayitlari where id = p_id
  ) x;
$$;

-- ── 3) EKLE ──────────────────────────────────────────────────────────────────
create or replace function public.mesai_kaydi_ekle(
  p_kullanici_id bigint,
  p_giris        timestamptz,
  p_cikis        timestamptz,
  p_tip          text,
  p_not          text,
  p_sebep        text
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_yapan record;
  v_id    uuid;
begin
  if not ik_yetkili() then
    raise exception 'Mesai kaydı ekleme yetkiniz yok.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_sebep), '') = '' then
    raise exception 'Düzeltme sebebi zorunludur.' using errcode = '22023';
  end if;
  if p_giris is null then
    raise exception 'Giriş zamanı zorunludur.' using errcode = '22023';
  end if;
  if p_cikis is not null and p_cikis < p_giris then
    raise exception 'Çıkış zamanı girişten önce olamaz.' using errcode = '22023';
  end if;
  if not exists (select 1 from kullanicilar where id = p_kullanici_id) then
    raise exception 'Personel bulunamadı.' using errcode = '23503';
  end if;

  select * into v_yapan from mesai_duzeltme_yapan();

  -- ⚠️ Açık kayıt (çıkışsız) eklerken mesai_aktif_tek unique index'i devreye
  -- girer: kişi başına AYNI ANDA tek açık kayıt. Ham Postgres hatası kullanıcıya
  -- bir şey anlatmaz, anlamlı mesaja çeviriyoruz.
  if p_cikis is null and exists (
       select 1 from mesai_kayitlari
        where kullanici_id = p_kullanici_id and cikis_zamani is null
     ) then
    raise exception 'Bu personelin zaten açık (devam eden) bir mesai kaydı var. Önce onu kapatın.'
      using errcode = '23505';
  end if;

  -- sure_dakika BİLEREK yazılmıyor — mig 290 trigger'ı INSERT'te hesaplıyor.
  insert into mesai_kayitlari (kullanici_id, giris_zamani, cikis_zamani, tip, not_)
  values (p_kullanici_id, p_giris, p_cikis, coalesce(nullif(btrim(p_tip), ''), 'normal'), nullif(btrim(p_not), ''))
  returning id into v_id;

  insert into mesai_duzeltmeleri (mesai_id, kullanici_id, islem, eski, yeni, sebep, yapan_id, yapan_ad)
  values (v_id, p_kullanici_id, 'ekle', null, mesai_satir_json(v_id), btrim(p_sebep), v_yapan.id, v_yapan.ad);

  return v_id;
end;
$$;

-- ── 4) DÜZELT ────────────────────────────────────────────────────────────────
create or replace function public.mesai_kaydi_duzelt(
  p_id     uuid,
  p_giris  timestamptz,
  p_cikis  timestamptz,
  p_tip    text,
  p_not    text,
  p_sebep  text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_yapan record;
  v_eski  jsonb;
  v_kisi  bigint;
begin
  if not ik_yetkili() then
    raise exception 'Mesai kaydı düzeltme yetkiniz yok.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_sebep), '') = '' then
    raise exception 'Düzeltme sebebi zorunludur.' using errcode = '22023';
  end if;
  if p_giris is null then
    raise exception 'Giriş zamanı zorunludur.' using errcode = '22023';
  end if;
  if p_cikis is not null and p_cikis < p_giris then
    raise exception 'Çıkış zamanı girişten önce olamaz.' using errcode = '22023';
  end if;

  v_eski := mesai_satir_json(p_id);
  if v_eski is null then
    raise exception 'Mesai kaydı bulunamadı.' using errcode = 'P0002';
  end if;
  v_kisi := (v_eski ->> 'kullanici_id')::bigint;

  -- Açık kayda çeviriyorsak (çıkış siliniyorsa) unique index kontrolü
  if p_cikis is null and exists (
       select 1 from mesai_kayitlari
        where kullanici_id = v_kisi and cikis_zamani is null and id <> p_id
     ) then
    raise exception 'Bu personelin başka bir açık mesai kaydı var; iki kayıt aynı anda açık olamaz.'
      using errcode = '23505';
  end if;

  -- sure_dakika'ya DOKUNULMUYOR — mig 281/290 trigger'ı her UPDATE'te yeniden
  -- hesaplar. Elle yazmak iki kaynak yaratırdı.
  update mesai_kayitlari
     set giris_zamani = p_giris,
         cikis_zamani = p_cikis,
         tip          = coalesce(nullif(btrim(p_tip), ''), 'normal'),
         not_         = nullif(btrim(p_not), '')
   where id = p_id;

  select * into v_yapan from mesai_duzeltme_yapan();

  insert into mesai_duzeltmeleri (mesai_id, kullanici_id, islem, eski, yeni, sebep, yapan_id, yapan_ad)
  values (p_id, v_kisi, 'guncelle', v_eski, mesai_satir_json(p_id), btrim(p_sebep), v_yapan.id, v_yapan.ad);
end;
$$;

-- ── 5) SİL ───────────────────────────────────────────────────────────────────
-- Silme AÇILDI çünkü gerçek ihtiyaç var: çift dokunmadan doğan 19-20 saniyelik
-- artık kayıtlar (Emin 12.08 / Irmak 06.08). Sebep zorunlu, iz kalıcı — denetim
-- satırı silinen satırın TAMAMINI `eski` alanında saklar, geri yazılabilir.
create or replace function public.mesai_kaydi_sil(p_id uuid, p_sebep text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_yapan record;
  v_eski  jsonb;
begin
  if not ik_yetkili() then
    raise exception 'Mesai kaydı silme yetkiniz yok.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_sebep), '') = '' then
    raise exception 'Silme sebebi zorunludur.' using errcode = '22023';
  end if;

  v_eski := mesai_satir_json(p_id);
  if v_eski is null then
    raise exception 'Mesai kaydı bulunamadı.' using errcode = 'P0002';
  end if;

  select * into v_yapan from mesai_duzeltme_yapan();

  delete from mesai_kayitlari where id = p_id;

  insert into mesai_duzeltmeleri (mesai_id, kullanici_id, islem, eski, yeni, sebep, yapan_id, yapan_ad)
  values (p_id, (v_eski ->> 'kullanici_id')::bigint, 'sil', v_eski, null, btrim(p_sebep), v_yapan.id, v_yapan.ad);
end;
$$;

-- ── 6) YETKİ DARALTMA ────────────────────────────────────────────────────────
-- Güvenlik 3. dalgası dersi: SECURITY DEFINER fonksiyon public/anon'a açık
-- kalmamalı. authenticated'a veriyoruz; asıl kapı fonksiyonun içindeki
-- ik_yetkili() kontrolü.
revoke all on function public.mesai_duzeltme_yapan()                                     from public, anon;
revoke all on function public.mesai_satir_json(uuid)                                     from public, anon;
revoke all on function public.mesai_kaydi_ekle(bigint, timestamptz, timestamptz, text, text, text) from public, anon;
revoke all on function public.mesai_kaydi_duzelt(uuid, timestamptz, timestamptz, text, text, text)  from public, anon;
revoke all on function public.mesai_kaydi_sil(uuid, text)                                from public, anon;

grant execute on function public.mesai_kaydi_ekle(bigint, timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.mesai_kaydi_duzelt(uuid, timestamptz, timestamptz, text, text, text)  to authenticated;
grant execute on function public.mesai_kaydi_sil(uuid, text)                             to authenticated;

commit;

notify pgrst, 'reload schema';
