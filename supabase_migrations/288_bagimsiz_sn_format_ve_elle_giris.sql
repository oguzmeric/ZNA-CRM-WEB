-- 288 — Bağımsız SN: tiresiz format + ELLE seri no girişi (yeniden basım)
--
-- KULLANICI KARARI (14.08.2026):
--   1) Etiket çıktısı sadeleşiyor: "SN:" + CODE128 barkod + numara. Numara artık
--      TİRESİZ: ZNA-00000001 → ZNA00000001.
--   2) Sahada seri numarası SİLİNMİŞ/okunmaz hâle gelmiş cihazların kendi seri
--      numaraları da ELLE girilip etiketi yeniden bastırılabilmeli.
--
-- CANLI ÖLÇÜM (uygulanmadan önce):
--   • bagimsiz_snler tablosu BOŞ (0 kayıt) → format değişimi geçmiş veriyi
--     etkilemiyor, geriye dönük dönüşüm gerekmiyor.
--   • Sequence 107'de; tiresiz ZNA formatında hiçbir kayıt yok (musteri_cihazlari
--     ve stok_kalemleri'nde 0). Tek ZNA kaydı 'ZNA-00000107' (tireli, test
--     müşterisinde) → yeni tiresiz formatla ÇAKIŞMAZ.
--   • Sequence 1'e döndürülüyor: numaralar ZNA00000001'den başlasın.

begin;

-- ── 1) Kaynak ayrımı ────────────────────────────────────────────────────────
-- 'uretilen' : ZNA sayacından biz ürettik (SN'siz ürün)
-- 'elle'     : cihazın KENDİ seri numarası elle girildi (etiketi silinmişti)
alter table bagimsiz_snler
  add column if not exists kaynak text not null default 'uretilen';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bagimsiz_snler_kaynak_chk') then
    alter table bagimsiz_snler
      add constraint bagimsiz_snler_kaynak_chk check (kaynak in ('uretilen', 'elle'));
  end if;
end $$;

comment on column bagimsiz_snler.kaynak is
  'uretilen = ZNA sayacından üretildi | elle = cihazın kendi SN''si elle girildi (etiket yeniden basımı)';

-- ── 2) Üretim formatı: tiresiz ──────────────────────────────────────────────
create or replace function bagimsiz_sn_uret(
  p_urun_adi        text   default null,
  p_stok_kodu       text   default null,
  p_musteri_id      bigint default null,
  p_servis_talep_id bigint default null,
  p_olusturan_id    bigint default null,
  p_olusturan_ad    text   default null
) returns bagimsiz_snler
language plpgsql security definer set search_path = public as $$
declare
  v_sn  text;
  v_row bagimsiz_snler;
begin
  if not is_staff() then
    raise exception 'yetkisiz';
  end if;
  -- TİRESİZ (mig 288): ZNA00000001. Sayaç DB'de — istemci sayacı yarış üretirdi.
  v_sn := 'ZNA' || lpad(nextval('bagimsiz_sn_seq')::text, 8, '0');
  insert into bagimsiz_snler (seri_no, urun_adi, stok_kodu, musteri_id, servis_talep_id, olusturan_id, olusturan_ad, kaynak)
  values (v_sn, nullif(trim(p_urun_adi), ''), nullif(trim(p_stok_kodu), ''), p_musteri_id, p_servis_talep_id, p_olusturan_id, nullif(trim(p_olusturan_ad), ''), 'uretilen')
  returning * into v_row;
  return v_row;
end $$;

revoke all on function bagimsiz_sn_uret(text, text, bigint, bigint, bigint, text) from anon, public;
grant execute on function bagimsiz_sn_uret(text, text, bigint, bigint, bigint, text) to authenticated;

-- ── 3) ELLE seri no girişi (yeniden basım) ──────────────────────────────────
-- Cihazın kendi SN'si girilir; kuyruğa 'elle' kaynağıyla düşer ve etiketi basılır.
-- AYNI SN İKİNCİ KEZ girilirse hata vermez: kayıt korunur, yalnız etiket_basildi
-- sıfırlanır → yeniden basım kuyruğuna girer. (Etiket ikinci kez silinebilir;
-- kullanıcıyı "zaten var" hatasıyla durdurmak işi yapmasını engellerdi.)
create or replace function bagimsiz_sn_elle_ekle(
  p_seri_no         text,
  p_urun_adi        text   default null,
  p_stok_kodu       text   default null,
  p_musteri_id      bigint default null,
  p_servis_talep_id bigint default null,
  p_olusturan_id    bigint default null,
  p_olusturan_ad    text   default null
) returns bagimsiz_snler
language plpgsql security definer set search_path = public as $$
declare
  v_sn  text;
  v_row bagimsiz_snler;
begin
  if not is_staff() then
    raise exception 'yetkisiz';
  end if;

  v_sn := nullif(trim(p_seri_no), '');
  if v_sn is null then
    raise exception 'Seri numarası boş olamaz';
  end if;
  if length(v_sn) > 64 then
    raise exception 'Seri numarası çok uzun (en fazla 64 karakter)';
  end if;

  insert into bagimsiz_snler (seri_no, urun_adi, stok_kodu, musteri_id, servis_talep_id, olusturan_id, olusturan_ad, kaynak)
  values (v_sn, nullif(trim(p_urun_adi), ''), nullif(trim(p_stok_kodu), ''), p_musteri_id, p_servis_talep_id, p_olusturan_id, nullif(trim(p_olusturan_ad), ''), 'elle')
  on conflict (seri_no) do update
    set etiket_basildi = false,
        etiket_basim_tarih = null,
        -- yeni bilgi geldiyse güncelle, gelmediyse eskisini koru
        urun_adi  = coalesce(nullif(trim(excluded.urun_adi), ''),  bagimsiz_snler.urun_adi),
        stok_kodu = coalesce(nullif(trim(excluded.stok_kodu), ''), bagimsiz_snler.stok_kodu)
  returning * into v_row;

  return v_row;
end $$;

revoke all on function bagimsiz_sn_elle_ekle(text, text, text, bigint, bigint, bigint, text) from anon, public;
grant execute on function bagimsiz_sn_elle_ekle(text, text, text, bigint, bigint, bigint, text) to authenticated;

commit;

-- ── 4) Sayacı 1'e döndür ────────────────────────────────────────────────────
-- Tablo boş ve tiresiz formatta hiç kayıt yok; ZNA00000001'den başlasın.
-- (setval transaction dışında da güvenli — geri alınmaz, o yüzden en sonda.)
select setval('bagimsiz_sn_seq', 1, false);

notify pgrst, 'reload schema';
