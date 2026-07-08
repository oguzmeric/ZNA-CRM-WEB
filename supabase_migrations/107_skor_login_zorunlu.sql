-- 107: /skor artık login zorunlu — anon erişim kaldırılıyor.
-- Migration 104'te kiosk için anon'a verilen skor_liderlik execute yetkisi geri alınır.
-- Sadece authenticated kullanıcılar leaderboard'u çekebilir.

revoke execute on function skor_liderlik(date, date) from anon;

notify pgrst, 'reload schema';
