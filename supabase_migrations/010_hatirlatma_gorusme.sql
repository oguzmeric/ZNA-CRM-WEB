-- =====================================================================
-- Hatırlatma tablosu: görüşme + generic tip desteği
-- =====================================================================
-- Şimdiye kadar hatirlatmalar sadece teklif için kullanılıyordu
-- (teklif_id FK). Şimdi görüşmeler için de hatırlatma oluşturmak
-- istiyoruz. Aynı tabloyu tip ayrımıyla genişletiyoruz.
-- =====================================================================

alter table hatirlatmalar
  add column if not exists tip text default 'teklif',
  add column if not exists gorusme_id bigint references gorusmeler(id) on delete cascade,
  add column if not exists musteri_ad text,
  add column if not exists aciklama text;

-- Geriye dönük: eski kayıtların tip'ini teklif olarak işaretle
update hatirlatmalar set tip = 'teklif' where tip is null;

create index if not exists idx_hatirlatmalar_gorusme on hatirlatmalar(gorusme_id);
create index if not exists idx_hatirlatmalar_tip on hatirlatmalar(tip);

-- RLS: mevcut policy'ler tabloyu kapsıyor (hatirlatmalar_staff_all).
-- Yeni kolonlar için ek policy gerekmez.

notify pgrst, 'reload schema';
