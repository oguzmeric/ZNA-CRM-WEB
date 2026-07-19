-- 200: Keşif fotoğrafları — alt bilgi + çizim (KEŞİF MODÜLÜ DÜZENLEME dokümanı, 2026-07-19)
-- Her fotoğrafa başlık/açıklama/montaj notu/mahal/kat + etiket + keşif kalemi ilişkisi.
-- Çizim: orijinal dosya bozulmaz; çizimli PNG ayrı yolda (cizim_yolu), vektör verisi
-- cizim_veri'de tutulur ki yeniden düzenlenebilsin. Değişiklik geçmişi cizim_gecmisi'nde.

alter table kesif_fotolari add column if not exists baslik         text;
alter table kesif_fotolari add column if not exists montaj_notu    text;
alter table kesif_fotolari add column if not exists mahal          text;   -- bulunduğu alan
alter table kesif_fotolari add column if not exists kat_bolum      text;
alter table kesif_fotolari add column if not exists etiket         text
  check (etiket is null or etiket in (
    'mevcut_durum','ariza_noktasi','montaj_noktasi','kablo_guzergahi',
    'elektrik_noktasi','network_noktasi','riskli_alan'));
alter table kesif_fotolari add column if not exists kalem_id       bigint references kesif_kalemleri(id) on delete set null;
alter table kesif_fotolari add column if not exists cizim_yolu     text;   -- çizimli PNG storage path
alter table kesif_fotolari add column if not exists cizim_veri     jsonb;  -- vektör şekiller (yeniden düzenleme için)
alter table kesif_fotolari add column if not exists olusturan_id   bigint;
alter table kesif_fotolari add column if not exists cizim_gecmisi  jsonb not null default '[]'::jsonb; -- [{ad, tarih, islem}]
alter table kesif_fotolari add column if not exists guncelleme_tarih timestamptz;

create index if not exists kesif_foto_kalem_idx on kesif_fotolari(kalem_id);

-- Yetki (doküman madde 10): düzenleme = ekleyen + admin; silme = ekleyen + admin.
-- olusturan_id NULL olan eski kayıtlar staff'a açık kalır.
drop policy if exists kesif_foto_staff_all on kesif_fotolari;

drop policy if exists kesif_foto_sel on kesif_fotolari;
create policy kesif_foto_sel on kesif_fotolari
  for select using (is_staff());

drop policy if exists kesif_foto_ins on kesif_fotolari;
create policy kesif_foto_ins on kesif_fotolari
  for insert with check (is_staff());

drop policy if exists kesif_foto_upd on kesif_fotolari;
create policy kesif_foto_upd on kesif_fotolari
  for update using (
    is_admin()
    or olusturan_id is null
    or olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid() limit 1)
  ) with check (is_staff());

drop policy if exists kesif_foto_del on kesif_fotolari;
create policy kesif_foto_del on kesif_fotolari
  for delete using (
    is_admin()
    or olusturan_id is null
    or olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid() limit 1)
  );

select 'MIG 200 OK' as sonuc;
