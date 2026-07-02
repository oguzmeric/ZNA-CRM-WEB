-- Görev gecikme SMS cron altyapısı — GitHub Actions üzerinden tetikleniyor,
-- burada sadece manuel tetik için bir RPC var (test/admin butonuyla çalıştırabilmek için).

-- Edge function'ı SECURITY DEFINER RPC ile çağır (ama net.http_post gerekiyor, RPC değil).
-- Bu migration şimdilik sadece açıklama tutuyor — tetikleme GitHub Actions'ta:
-- .github/workflows/gorev-gecikme-sms.yml (cron '0 6 * * *' UTC = 09:00 TR)

comment on table gorevler is 'Görev tablosu — atama_sms/gecikme_sms flag''leri SMS''in tekrarını önler. Gecikme SMS''i .github/workflows/gorev-gecikme-sms.yml cron''undan tetiklenir.';

notify pgrst, 'reload schema';
