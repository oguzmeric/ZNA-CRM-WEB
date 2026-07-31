-- Kullanılan Malzemeler: fatura durumunun YANINA bağımsız TESLİM DURUMU.
-- Ali Uğur talebi (01.08.2026): "fatura durumu + teslim durumu iki ayrı durum".
-- Şimdiye kadar teslim bilgisi serbest açıklama metnine ("TESLİM EDİLDİ")
-- yazılıyordu; filtrelenemiyor, sayılamıyor, raporlanamıyordu.
--
-- null = henüz işaretlenmemiş (bilinmiyor). "teslim edilmedi" AYRI bir bilgidir:
-- alis_fiyat'ın `not null default 0` yüzünden "girilmedi"yi "sıfır"dan ayıramama
-- hatasını burada tekrarlamıyoruz — kolon nullable.

alter table public.malzeme_hareketleri
  add column if not exists teslim_durumu text;

alter table public.malzeme_hareketleri
  drop constraint if exists malzeme_hareketleri_teslim_durumu_check;

alter table public.malzeme_hareketleri
  add constraint malzeme_hareketleri_teslim_durumu_check
  check (teslim_durumu is null or teslim_durumu in ('teslim_edildi', 'teslim_edilmedi'));

-- Filtre/sayım için kısmi indeks (işaretli kayıtlar azınlıkta)
create index if not exists idx_malzeme_hareketleri_teslim_durumu
  on public.malzeme_hareketleri (teslim_durumu)
  where teslim_durumu is not null;

-- Geçmiş veri: açıklamasına elle "TESLİM EDİLDİ" yazılmış kayıtları işaretle.
-- translate() ile Türkçe harfler ASCII'ye indiriliyor — ilike tek başına İ'yi
-- YAKALAMAZ (lower('İ') = 'i' + birleşik nokta, düz 'i' değil).
update public.malzeme_hareketleri
   set teslim_durumu = 'teslim_edildi'
 where teslim_durumu is null
   and translate(coalesce(aciklama, ''), 'İıŞşĞğÜüÖöÇçÂâÎî', 'IiSsGgUuOoCcAaIi')
       ilike '%teslim edildi%';

notify pgrst, 'reload schema';
