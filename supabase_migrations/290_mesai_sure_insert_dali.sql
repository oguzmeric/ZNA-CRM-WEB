-- 290 — Mesai süresi INSERT'te de hesaplansın + ters kayıt kapısı
--
-- SORUN (15.08.2026, elle veri düzeltmesi sırasında ölçüldü):
-- `mesai_sure_hesapla` trigger'ı yalnızca **BEFORE UPDATE** olarak kuruluydu
-- (mig 083'ten beri). Doğrudan `insert` edilen — yani QR akışından geçmeyen —
-- bir mesai kaydında `sure_dakika` BOŞ kalıyordu.
--
-- Vaka: Alp Aslan (id 54) 13.08 Perşembe QR ile mesai başlatamamış; gündüz
-- mesaisi 08:30–18:00 elle eklendi. Kayıt listede göründü ama süresi boştu;
-- bordroya 0 dakika olarak yansıyacaktı. Geçici çözüm olarak kayıt bir kez
-- UPDATE edilip trigger tetiklendi (570 dk) — bu migration kalıcı düzeltmesi.
--
-- ⚠️ Fonksiyonun kendisi zaten INSERT'e HAZIR: mig 281 `old.cikis_zamani is null`
-- kapısını kaldırdığı için gövdede `old` referansı KALMADI. (Bir plpgsql
-- trigger fonksiyonu INSERT'te `old`a dokunursa hata verir — burada dokunmuyor.)
-- Yani tek eksik trigger'ın olay listesiydi.
--
-- BU MIGRATION:
--   1) Trigger'ı BEFORE INSERT OR UPDATE'e genişletir
--   2) Ters kayıt (çıkış < giriş) için CHECK constraint ekler
--   3) Geride kalmış boş süreleri onarır (idempotent)

begin;

-- ── 1) Fonksiyon: gövde mig 281 ile aynı, yalnız INSERT notu eklendi ──────────
create or replace function public.mesai_sure_hesapla_fn()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at = now();
  -- ⚠️ `old` KULLANILMAZ — trigger hem INSERT hem UPDATE'te çalışıyor (mig 290).
  -- Kapı bilerek yok: giriş veya çıkış sonradan düzeltilirse süre de düzelsin.
  if new.cikis_zamani is not null then
    new.sure_dakika = extract(epoch from (new.cikis_zamani - new.giris_zamani))::int / 60;
  end if;
  return new;
end;
$$;

-- ── 2) Trigger: INSERT dalı eklendi ──────────────────────────────────────────
drop trigger if exists mesai_sure_hesapla on public.mesai_kayitlari;
create trigger mesai_sure_hesapla
  before insert or update on public.mesai_kayitlari
  for each row execute function public.mesai_sure_hesapla_fn();

-- ── 3) Ters kayıt kapısı ─────────────────────────────────────────────────────
-- Çıkış girişten önce olamaz. Elle veri girişinde saatleri ters yazmak süreyi
-- NEGATİF yapardı ve kimse fark etmezdi. Mevcut 146 kaydın tamamı bu kuralı
-- sağlıyor (ölçüldü: 0 ters kayıt), o yüzden ekleme canlı akışı etkilemez.
-- Eşitliğe izin var: aynı saniyede açılıp kapanan kayıt 0 dakikadır.
alter table public.mesai_kayitlari
  drop constraint if exists mesai_cikis_giristen_sonra;
alter table public.mesai_kayitlari
  add constraint mesai_cikis_giristen_sonra
  check (cikis_zamani is null or cikis_zamani >= giris_zamani);

-- ── 4) Geride kalmış boş süreler ─────────────────────────────────────────────
-- Yalnız "çıkışı dolu ama süresi boş" satırlar. Trigger BEFORE UPDATE olduğu
-- için bu no-op UPDATE hesabı tetikler.
-- ⚠️ Süresi DOLU ama 1 dk sapan 4 tarihsel kayda BİLEREK DOKUNULMUYOR —
-- mig 281'deki karar: bordroya girmiş sayıları 1 dakika için değiştirme.
update public.mesai_kayitlari
   set giris_zamani = giris_zamani
 where cikis_zamani is not null
   and sure_dakika is null;

commit;
