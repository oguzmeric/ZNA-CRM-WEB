-- 187: Görüşme sonucu alanı — görüşme neticesi ayrı yazılabilsin
-- (UI: "Notlar" → "Görüşme Açıklaması" olarak yeniden adlandırıldı, kolon adı değişmedi)
alter table gorusmeler add column if not exists gorusme_sonucu text;
