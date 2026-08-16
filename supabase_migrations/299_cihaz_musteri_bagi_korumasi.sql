-- 299 — Cihaz servise/teknisyene alınırken MÜŞTERİ BAĞI KORUNUR
--
-- KARAR (16.08, kullanıcı): "musteri_id korunsun". Müşterinin cihazı arızalanıp
-- geri alındığında bağ kopmamalı — müşteri portalda "Arızalı — serviste"
-- görebilmeli, ve cihazın geçmişi sorgulanabilmeli.
--
-- ÖNCE ÖLÇÜLDÜ (16.08) — sorun sandığımdan KÜÇÜK:
--   teknisyende     45 kalem · takilma_tarihi 0  → hiç müşteriye takılmamış,
--                                                   depo malzemesi (DOĞRU davranış)
--   arizali_depoda   1 kalem · takilma_tarihi VAR, musteri_id NULL → GERÇEK KOPUK
--   stok_ariza_kayitlari 6 kayıt, 1'inde geldigi_musteri_id dolu → onarım kaynağı
--
--   ⚠️ Bağı koparan AKTİF KOD YOLU BULUNAMADI: `sn_ariza_isaretle_atomik`
--   yalnız `durum` günceller, musteri_id'ye dokunmaz; `sokulme_tarihi` yazan
--   kod da yok. Kopukluk tarihsel. Bu yüzden koruma UYGULAMA KATMANINDA DEĞİL,
--   VERİTABANINDA kuruluyor — hangi yoldan (web/mobil/elle SQL) gelirse gelsin
--   bağ kopmaz.
--
-- KURAL:
--   sahada         → musteri_id dolu (müşteride çalışıyor)
--   teknisyende    → KORUNUR (müşterinin cihazı tamirde)
--   arizali_depoda → KORUNUR (müşterinin arızalı cihazı serviste)
--   depoda         → TEMİZLENİR (stoğa döndü, artık müşterinin değil)

begin;

-- ── 1) Koruma trigger'ı ───────────────────────────────────────────────────
create or replace function public.stok_kalem_musteri_bagi_koru_fn()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Müşteriye TAKILMIŞ bir cihazın bağı, servis/teknisyen durumlarında
  -- silinmek istenirse geri yazılır. 'depoda' bilinçli iadedir — dokunulmaz.
  if new.musteri_id is null
     and old.musteri_id is not null
     and old.takilma_tarihi is not null
     and coalesce(new.durum, '') in ('teknisyende', 'arizali_depoda', 'arizada', 'sahada')
  then
    new.musteri_id = old.musteri_id;
    -- Lokasyon da cihazla birlikte korunur; aksi hâlde geri takıldığında
    -- "lokasyon girilmemiş" görünür (lokasyon verisi zaten çok zayıf: 6/166).
    if new.musteri_lokasyon_id is null then
      new.musteri_lokasyon_id = old.musteri_lokasyon_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stok_kalem_musteri_bagi_koru on public.stok_kalemleri;
create trigger stok_kalem_musteri_bagi_koru
  before update on public.stok_kalemleri
  for each row execute function public.stok_kalem_musteri_bagi_koru_fn();

-- ── 2) Arıza kaydı müşteriyi KENDİ bulsun ─────────────────────────────────
-- Çağıran `in_musteri_id` göndermezse kalemin kendi müşterisi yazılır; böylece
-- "geldiği müşteri" alanı arayüz değişmeden dolmaya başlar.
create or replace function public.sn_ariza_isaretle_atomik(
  in_kalem_id bigint, in_yeni_durum text, in_sebep text,
  in_sebep_ad text default null, in_aciklama text default null,
  in_teknisyen_id bigint default null, in_musteri_id bigint default null,
  in_olusturan_id bigint default null)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_kalem stok_kalemleri%rowtype;
  v_kayit stok_ariza_kayitlari%rowtype;
  v_musteri bigint;
begin
  -- ⚠️ Müşteri, durum güncellenmeden ÖNCE okunmalı
  select musteri_id into v_musteri from stok_kalemleri where id = in_kalem_id;
  v_musteri := coalesce(in_musteri_id, v_musteri);

  update stok_kalemleri set durum = in_yeni_durum
   where id = in_kalem_id
   returning * into v_kalem;
  if not found then
    raise exception 'Stok kalemi bulunamadı: %', in_kalem_id;
  end if;

  insert into stok_ariza_kayitlari
    (stok_kalem_id, sebep, aciklama, geldigi_teknisyen_id, geldigi_musteri_id, olusturan_id)
  values
    (in_kalem_id, in_sebep, nullif(in_aciklama, ''), in_teknisyen_id, v_musteri, in_olusturan_id)
  returning * into v_kayit;

  insert into stok_hareketleri (stok_kodu, stok_adi, hareket_tipi, miktar, aciklama, tarih, kullanici_id)
  values (
    v_kalem.stok_kodu,
    coalesce(v_kalem.marka, v_kalem.model),
    'ariza', 1,
    'SN arızalı: ' || coalesce(v_kalem.seri_no, '?') || ' — ' || coalesce(in_sebep_ad, in_sebep),
    now(), in_olusturan_id
  );

  return jsonb_build_object('kalem', to_jsonb(v_kalem), 'kayit', to_jsonb(v_kayit));
end $$;

-- ── 3) Mevcut kopuk kaydı onar ────────────────────────────────────────────
-- Yalnız: müşteriye takılmış + bağı kopmuş + arıza kaydında müşterisi bilinen.
-- ⚠️ İdempotent (musteri_id is null koşulu) ve dar kapsamlı.
update public.stok_kalemleri k
   set musteri_id = a.geldigi_musteri_id
  from (
    select distinct on (stok_kalem_id) stok_kalem_id, geldigi_musteri_id
      from public.stok_ariza_kayitlari
     where geldigi_musteri_id is not null
     order by stok_kalem_id, olusturuldu desc
  ) a
 where a.stok_kalem_id = k.id
   and k.musteri_id is null
   and k.takilma_tarihi is not null
   and coalesce(k.silindi, false) = false
   and coalesce(k.durum, '') in ('teknisyende', 'arizali_depoda', 'arizada');

commit;
