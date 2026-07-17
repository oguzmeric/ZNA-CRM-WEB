-- 191: Proforma/fatura kaydına İRSALİYE dosyası — muhasebeci fatura PDF'inin yanına
-- irsaliye da yükleyebilsin (fatura-belge private bucket'ında saklanır).
alter table fatura_talepleri add column if not exists irsaliye_yol text;
alter table fatura_talepleri add column if not exists irsaliye_ad text;
