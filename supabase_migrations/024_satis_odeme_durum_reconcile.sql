-- Migration 024: satislar.durum reconcile (tahsilatlara göre)
--
-- ARKA PLAN
-- ─────────
-- satisService.tahsilatEkle/Sil fonksiyonu içinde .single() error destructure
-- edilmiyordu. RLS engeli, silinmiş kayıt veya geçici hata durumunda
-- satis=undefined kalıp Number(undefined)=NaN üretiliyor, NaN >= n her zaman
-- false → durum 'gonderildi' olarak yazılıyordu. Tahsilat eklemiş olsa bile
-- bazı satışlar 'odendi' durumuna geçemedi. Aynı şekilde odenen_toplam alanı
-- da güncellenmemiş olabilir.
--
-- BU MIGRATION
-- ────────────
-- Tüm satışları gerçek tahsilat toplamlarına göre yeniden hesaplar:
--   - odenen_toplam: ilgili tahsilatların toplamı
--   - durum: odenen_toplam >= genel_toplam ise 'odendi', değilse 'gonderildi'
--
-- KAPSAM
-- ──────
-- Manuel 'iptal'/'taslak'/'gonderildi' (henüz fatura kesilmemiş) gibi
-- durumlar bozulmasın diye SADECE 'gonderildi' veya 'odendi' olanlar
-- güncellenir. genel_toplam=0 olan kayıtlara dokunulmaz (bölme/karşılaştırma
-- anlamsız).
--
-- IDEMPOTENT
-- ──────────
-- Birden fazla çalıştırılabilir; her seferinde aynı sonucu üretir.

WITH tahsilat_toplam AS (
  SELECT satis_id, COALESCE(SUM(tutar), 0) AS toplam
  FROM tahsilatlar
  GROUP BY satis_id
)
UPDATE satislar s
SET
  odenen_toplam = COALESCE(tt.toplam, 0),
  durum = CASE
    WHEN COALESCE(tt.toplam, 0) >= s.genel_toplam THEN 'odendi'
    ELSE 'gonderildi'
  END,
  updated_at = NOW()
FROM (
  SELECT id FROM satislar WHERE durum IN ('gonderildi', 'odendi') AND genel_toplam > 0
) etkilenen
LEFT JOIN tahsilat_toplam tt ON tt.satis_id = etkilenen.id
WHERE s.id = etkilenen.id
  AND (
    s.odenen_toplam IS DISTINCT FROM COALESCE(tt.toplam, 0)
    OR s.durum IS DISTINCT FROM CASE
      WHEN COALESCE(tt.toplam, 0) >= s.genel_toplam THEN 'odendi'
      ELSE 'gonderildi'
    END
  );

-- Schema cache reload (Supabase PostgREST)
NOTIFY pgrst, 'reload schema';
