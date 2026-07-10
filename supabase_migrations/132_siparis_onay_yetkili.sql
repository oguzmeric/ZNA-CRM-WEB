-- Sipariş Onayı yetkilisi bayrağı. ILIKE Türkçe karakter eşleşme sorunu
-- yerine kalıcı flag ile hangi kullanıcıların bildirim + SMS alacağını
-- DB seviyesinde belirliyoruz.
--
-- Şu an 3 yetkili: Ahmet Agün, Ali Uğur Aktepe, Oğuz Meriç.

alter table kullanicilar
  add column if not exists siparis_onay_yetkili boolean not null default false;

-- Mevcut yetkilileri işaretle. Türkçe karakter için translate ile normalize.
update kullanicilar
set siparis_onay_yetkili = true
where translate(lower(ad), 'ığüşöçİĞÜŞÖÇ', 'igusociigusoc') ilike any(array[
  '%ahmet%agun%',
  '%ali%ugur%aktepe%',
  '%oguz%meri%c%'
]);

notify pgrst, 'reload schema';
