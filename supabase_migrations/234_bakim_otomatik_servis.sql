-- 234_bakim_otomatik_servis.sql — Toplu Bakım F5 (spec 17-19)
-- Bakım kaleminde ARIZA tespit edilince otomatik servis talebi:
--  * Aynı sistemdeki arızalar TEK talep (kalem başına zaten tek kayıt var;
--    servis_talep_id doluysa ikinci kez AÇILMAZ)
--  * Farklı sistemler = ayrı talep (her kalem kendi talebini üretir)
--  * Talep teknik personele ATANMAZ; merkezdeki saha sorumlusuna bildirim düşer
-- DB trigger'ı: web + mobil hangi taraftan yazılırsa yazılsın çalışır.

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

  insert into servis_talepleri (musteri_id, konu, aciklama, durum, kaynak, lokasyon)
  values (
    v_tb.musteri_id,
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

drop trigger if exists tr_tb_kalem_ariza_servis on public.toplu_bakim_kalemleri;
create trigger tr_tb_kalem_ariza_servis
  after update on public.toplu_bakim_kalemleri
  for each row
  when (new.ariza_var = true and new.servis_talep_id is null and new.durum = 'ariza_tespit')
  execute function public.toplu_bakim_ariza_servis();

commit;
