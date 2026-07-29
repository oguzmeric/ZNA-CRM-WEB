-- 244 — Sohbet dosyaları base64'ten Storage'a
--
-- Mevcut durum: dosya, mesajın İÇİNDE base64 data URI olarak duruyor
-- (`mesajlar.icerik` JSON, alan `dosyaData`). Sonuçları:
--   * 344 mesajın içeriği 1,65 MB; tek mesaj 619 KB. Sohbet her açıldığında
--     TAMAMI iniyor — mobil sohbette bu kabul edilemez.
--   * base64 dosyayı %33 şişirir, üstelik ucuz depolama yerine DB'de tutar.
--   * 5 MB'lık sınır fiilen tavan; büyütmek DB'yi şişirir.
--
-- Çözüm: `sohbet-dosyalari` bucket'ı. Yol deseni: `<sohbet_id>/<dosya>`.
--
-- GÜVENLİK: diğer bucket'lardaki `is_staff()` kalıbı burada YETERSİZ — her
-- personel başkasının özel yazışmasındaki dosyayı indirebilirdi (mig 241'de
-- kapatılan açığın dosya versiyonu). Bu yüzden yolun ilk klasörü sohbet_id
-- ve politika KATILIMCILIK arıyor.
--
-- Not: klasör adı sayı değilse substring null döner, cast patlamaz ve
-- sohbet_katilimcisi_mi(null) false verir — bozuk yol sessizce reddedilir.

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('sohbet-dosyalari', 'sohbet-dosyalari', false, 26214400)   -- 25 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists sohbet_dosya_katilimci_read   on storage.objects;
drop policy if exists sohbet_dosya_katilimci_insert on storage.objects;
drop policy if exists sohbet_dosya_katilimci_delete on storage.objects;

create policy sohbet_dosya_katilimci_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sohbet-dosyalari'
    and (select public.sohbet_katilimcisi_mi(
          nullif(substring(name from '^[0-9]+'), '')::bigint))
  );

create policy sohbet_dosya_katilimci_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sohbet-dosyalari'
    and (select public.sohbet_katilimcisi_mi(
          nullif(substring(name from '^[0-9]+'), '')::bigint))
  );

-- Mesaj silinince dosyası da silinebilsin (istemci mesajla birlikte siler)
create policy sohbet_dosya_katilimci_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sohbet-dosyalari'
    and (select public.sohbet_katilimcisi_mi(
          nullif(substring(name from '^[0-9]+'), '')::bigint))
  );

commit;
