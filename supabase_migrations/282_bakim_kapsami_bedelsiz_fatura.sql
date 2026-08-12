-- 282 — Bakım anlaşması kapsamındaki servisler BEDELSİZ kapatılabilsin
--
-- Sorun: servisten açılan proforma tutarsız (0 TL) açılıyor, `faturayiKaydet`
-- ise 0 TL faturayı reddediyor (06.08 "0 TL ciro asla" kuralı). Bakım
-- anlaşmalı işlerde bedel zaten alınmıyor → proforma kuyruğa giriyor ama
-- KAPATILAMIYOR. Canlıda 20 bekleyen proformanın 12'si bu durumda; hepsinin
-- kaynak servisi `yukumluluk='bakim'`.
--
-- Çözüm (kullanıcı kararı 12.08.2026):
--   • Bedelsiz proforma fatura NUMARASI İSTEMEDEN kapanır.
--   • `satislar` kaydı OLUŞMAZ — ciro rakamları bozulmaz.
--   • "Bedelsiz" kararı servisin `yukumluluk='bakim'` alanından OTOMATİK
--     gelir; fatura yetkilisi kesim anında kaldırabilir.
--
-- ⚠️ Neden sözleşme tablosu kullanılmadı: `sozlesmeler`'de yalnızca 1 aktif
-- bakım sözleşmesi var (Başakşehir Belediyesi). Bakım servisi verilen diğer
-- firmalar (BAŞAK A.Ş, Başakkent, Bayrampaşa) orada kayıtlı değil — sözleşmeye
-- dayalı kural bu işleri kaçırırdı. Sözleşmeler eksiksiz girildiğinde kural
-- oraya taşınabilir.

alter table public.fatura_talepleri
  add column if not exists bedelsiz boolean not null default false,
  add column if not exists bedelsiz_sebep text;

comment on column public.fatura_talepleri.bedelsiz is
  'Bakım anlaşması vb. kapsamında bedel alınmayan iş. true ise fatura no/PDF zorunlu değildir ve satislar kaydı OLUŞMAZ.';
comment on column public.fatura_talepleri.bedelsiz_sebep is
  'Bedelsiz kapatma gerekçesi (varsayılan: "Bakım anlaşması kapsamında").';

-- Bekleyen listesinde bedelsizleri ayırmak için
create index if not exists fatura_talepleri_bedelsiz_idx
  on public.fatura_talepleri (durum, bedelsiz);

-- ── Geriye dönük: kuyrukta ASILI KALAN bakım proformaları işaretle ──
-- Yalnızca: hâlâ bekleyen + tutarsız + kaynak servisi 'bakim' yükümlülüğünde.
-- Tutarı girilmiş veya kapanmış hiçbir kayda dokunulmaz.
update public.fatura_talepleri f
set bedelsiz = true,
    bedelsiz_sebep = 'Bakım anlaşması kapsamında'
from public.servis_talepleri s
where s.id = f.servis_talep_id
  and f.durum = 'bekliyor'
  and coalesce(f.genel_toplam, 0) = 0
  and f.bedelsiz = false
  and s.yukumluluk = 'bakim';
