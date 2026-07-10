-- 127: Teklif spec durumu kolonu — spec'teki 10 durum için.
--
-- Neden ayrı kolon?
-- Mevcut onay_durumu 4 değer alıyor (takipte/kabul/revizyon/vazgecildi).
-- Spec 10 durum istiyor — eski kolona sığmaz + bilgi kaybı olur.
-- Ek kolon ile eski kod çalışmaya devam eder (onay_durumu okumaya devam),
-- yeni sistem spek_durum'u kullanır.
--
-- İdempotent. Default değer verilmez — mapper eski değerlerden çevirir.

alter table teklifler
  add column if not exists spek_durum text;

-- İleride index gerekebilir; şimdilik kayıt sayısı düşük, atlayalım.

notify pgrst, 'reload schema';
