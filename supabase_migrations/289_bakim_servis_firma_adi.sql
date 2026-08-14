-- 289_bakim_servis_firma_adi.sql
--
-- SORUN (14.08, sahadan bildirildi): Mobilde Servisler > Tümü listesinde bazı
-- talepler firma adı yerine "—" gösteriyordu.
--
-- KÖK NEDEN: Toplu bakımda arıza tespit edilince otomatik servis talebi açan
-- trigger (mig 234, toplu_bakim_ariza_servis) INSERT'ünde `firma_adi` KOLONUNU
-- YAZMIYORDU:
--     insert into servis_talepleri (musteri_id, konu, aciklama, durum, kaynak, lokasyon)
-- Firma adı aslında elde: fonksiyon zaten `m.firma`yı v_tb.firma olarak çekip
-- BİLDİRİM metninde kullanıyor. Sadece talebe yazılmamış.
--
-- Etki: musteri_id dolu ama firma_adi boş 19 talep (ölçüldü). Listede kimin
-- talebi olduğu görünmüyor; sahadaki teknisyen kartı açmadan anlayamıyor.
--
-- BU MIGRATION:
--   1) Trigger fonksiyonunu firma_adi yazacak şekilde günceller
--   2) Mevcut boş kayıtları musteriler.firma ile doldurur (backfill)

begin;

create or replace function public.toplu_bakim_ariza_servis()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tb record;
  v_talep_id bigint;
  v_kalem_ad text;
begin
  select tb.*, m.firma into v_tb
    from toplu_bakimlar tb
    left join musteriler m on m.id = tb.musteri_id
   where tb.id = new.toplu_bakim_id;
  if v_tb.id is null then return new; end if;

  v_kalem_ad := case new.kalem_tip
    when 'cctv' then 'CCTV / IP Kamera'
    when 'turnike' then 'Turnike / PDKS'
    when 'ekran_led' then 'Ekran / LED'
    when 'fiber' then 'Fiber'
    when 'hirsiz_alarm' then 'Hırsız Alarm'
    when 'sistem_odasi' then 'Sistem Odası'
    else new.kalem_tip end;

  -- ⚠️ firma_adi EKLENDİ (mig 289). Listeler bu kolonu gösteriyor; yazılmazsa
  -- kart başlığı "—" kalıyor.
  insert into servis_talepleri (musteri_id, firma_adi, konu, aciklama, durum, kaynak, lokasyon)
  values (
    v_tb.musteri_id,
    v_tb.firma,
    v_kalem_ad || ' arızası — Toplu bakım ' || coalesce(v_tb.tb_no, '') ,
    'Toplu bakım sırasında arıza tespit edildi.' || chr(10) ||
    'Toplu Bakım No: ' || coalesce(v_tb.tb_no, '-') || ' · Form: ' || coalesce(new.alt_no, '-') || chr(10) ||
    'Lokasyon: ' || coalesce(v_tb.lokasyon_adi, '-') || chr(10) || chr(10) ||
    'Otomatik bakım sonucu:' || chr(10) || coalesce(new.sonuc_metni, '-'),
    'acik',
    'personel',   -- kaynak check constraint yalnız personel|musteri kabul eder
    v_tb.lokasyon_adi
  )
  returning id into v_talep_id;

  -- Kaleme geri yaz (WHEN koşulu sayesinde tekrar tetiklemez)
  update toplu_bakim_kalemleri set servis_talep_id = v_talep_id where id = new.id;

  -- Saha sorumlusuna bildirim → DB trigger'ı push'u da gönderir
  if v_tb.olusturan_id is not null then
    insert into bildirimler (alici_id, baslik, mesaj, tip, link)
    values (
      v_tb.olusturan_id,
      '🛠 Bakımda arıza — servis talebi oluştu',
      coalesce(v_tb.firma, '') || ' / ' || coalesce(v_tb.lokasyon_adi, '') ||
        ' — ' || v_kalem_ad || ' (' || coalesce(v_tb.tb_no, '') || ')',
      'uyari',
      '/servis-talepleri/' || v_talep_id
    );
  end if;

  return new;
end;
$$;
revoke all on function public.toplu_bakim_ariza_servis() from public;
revoke all on function public.toplu_bakim_ariza_servis() from anon;

-- Trigger tanımı mig 234'teki gibi kalıyor (fonksiyon yerinde değişti),
-- yine de idempotent olsun diye yeniden kuruluyor.
drop trigger if exists tr_tb_kalem_ariza_servis on public.toplu_bakim_kalemleri;
create trigger tr_tb_kalem_ariza_servis
  after update on public.toplu_bakim_kalemleri
  for each row
  when (new.ariza_var = true and new.servis_talep_id is null and new.durum = 'ariza_tespit')
  execute function public.toplu_bakim_ariza_servis();

-- ── BACKFILL ───────────────────────────────────────────────────────────────
-- Yalnız firma_adi BOŞ + musteri_id DOLU satırlar. Dolu bir firma_adi'na
-- DOKUNULMAZ (elle düzeltilmiş olabilir).
update servis_talepleri st
   set firma_adi = m.firma
  from musteriler m
 where m.id = st.musteri_id
   and (st.firma_adi is null or st.firma_adi = '')
   and m.firma is not null and m.firma <> '';

commit;
