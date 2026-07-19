-- ============================================================================
-- 195 — Kişi Bazlı Görev ve Alt Görev Yönetimi: DB temeli (F1)
-- Spek: 44 maddelik görev modülü (2026-07-19).
-- Bu migration idempotenttir; yeniden koşulabilir.
--
-- Kapsam:
--   1) gorev_kategoriler tablosu + 21 kategori seed (madde 5)
--   2) gorevler'e hiyerarşi/onay/gizlilik/ilerleme kolonları (madde 3-7, 13-16, 20)
--   3) gorev_ayarlar (max alt görev seviyesi, madde 8)
--   4) GRV-YYYY-NNNNNN + alt görev -NN numaralama trigger'ı (madde 21, mig 159 deseni)
--   5) olusturan_id doldurma trigger'ı (tarihi eksik: tabloda sadece olusturan_ad vardı)
--   6) Backfill: mevcut 66 göreve numara + olusturan_id + kabul/ilerleme varsayılanları
--   7) gorev_hareketleri append-only geçmiş + otomatik log trigger'ları (madde 23)
--   8) gorev_kontrol_listesi (madde 18)
--   9) RLS: gizlilik seviyeli select, taslak-dışı silme yasağı (madde 20, 37, kural 9)
--  10) kullanicilar.gorev_yetki (madde 9)
--
-- Bilinçli kararlar:
--   * durum kolonuna CHECK KONMADI — mevcut web/mobil 'bekliyor/devam/tamamlandi/iptal'
--     yazar; yeni durumlar (taslak/beklemede/bilgi_bekleniyor/onay_bekliyor/revize/
--     reddedildi) servis katmanında yönetilir. 'Süresi Geçti' ve 'Başka Göreve Bağlı'
--     HESAPLANAN durumlardır (son_tarih/bagimli_gorev_id'den), kolonda tutulmaz.
--   * gorevler_admin_all policy'si DOKUNULMADI — admin her görevi görür ('ozel' gizlilik
--     personel için katılımcı-kilitlidir; süper admin görünürlüğü bilinçli).
--   * Cihaz/IP hareket kaydı alınmadı (PostgREST katmanında güvenilir erişim yok).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Görev kategorileri (madde 5)
-- ---------------------------------------------------------------------------
create table if not exists gorev_kategoriler (
  id bigserial primary key,
  ad text not null unique,
  ikon text,
  sira int not null default 0,
  aktif boolean not null default true,
  olusturma_tarih timestamptz not null default now()
);

alter table gorev_kategoriler enable row level security;

drop policy if exists gorev_kategoriler_select on gorev_kategoriler;
create policy gorev_kategoriler_select on gorev_kategoriler
  for select using (is_staff());

drop policy if exists gorev_kategoriler_admin on gorev_kategoriler;
create policy gorev_kategoriler_admin on gorev_kategoriler
  for all using (is_admin()) with check (is_admin());

insert into gorev_kategoriler (ad, sira) values
  ('Yönetim', 1), ('Satış', 2), ('Teklif', 3), ('Satın Alma', 4), ('Finans', 5),
  ('Muhasebe', 6), ('İnsan Kaynakları', 7), ('Bayi Yönetimi', 8),
  ('Müşteri İlişkileri', 9), ('Proje', 10), ('Pazarlama', 11), ('Sosyal Medya', 12),
  ('Hukuk', 13), ('Sözleşme', 14), ('Operasyon', 15), ('İdari İşler', 16),
  ('Bilgi Teknolojileri', 17), ('Ürün Yönetimi', 18), ('Eğitim', 19),
  ('Organizasyon', 20), ('Diğer', 21)
on conflict (ad) do nothing;

-- ---------------------------------------------------------------------------
-- 2) gorevler yeni kolonlar
-- ---------------------------------------------------------------------------
alter table gorevler add column if not exists gorev_no text;
alter table gorevler add column if not exists ust_gorev_id bigint references gorevler(id) on delete cascade;
alter table gorevler add column if not exists seviye int not null default 0;
alter table gorevler add column if not exists olusturan_id bigint references kullanicilar(id) on delete set null;
alter table gorevler add column if not exists kategori_id bigint references gorev_kategoriler(id) on delete set null;
alter table gorevler add column if not exists ilerleme int not null default 0;
alter table gorevler add column if not exists ilerleme_modu text not null default 'manuel';
alter table gorevler add column if not exists kabul_durumu text not null default 'atandi';
alter table gorevler add column if not exists red_sebebi text;
alter table gorevler add column if not exists onay_gerekli boolean not null default false;
alter table gorevler add column if not exists onaylayici_id bigint references kullanicilar(id) on delete set null;
alter table gorevler add column if not exists onay_durumu text;
alter table gorevler add column if not exists onay_notu text;
alter table gorevler add column if not exists onay_tarih timestamptz;
alter table gorevler add column if not exists gizlilik text not null default 'standart';
alter table gorevler add column if not exists gozlemciler bigint[] not null default '{}';
alter table gorevler add column if not exists beklenen_cikti text;
alter table gorevler add column if not exists zorunlu boolean not null default true;
alter table gorevler add column if not exists tamamlama_kurali text not null default 'zorunlular';
alter table gorevler add column if not exists bagimli_gorev_id bigint references gorevler(id) on delete set null;
alter table gorevler add column if not exists bagimlilik_turu text;
alter table gorevler add column if not exists etiketler text[] not null default '{}';
alter table gorevler add column if not exists teklif_id bigint references teklifler(id) on delete set null;
alter table gorevler add column if not exists siparis_id bigint references siparisler(id) on delete set null;
alter table gorevler add column if not exists kesif_id bigint references kesifler(id) on delete set null;
alter table gorevler add column if not exists atama_turu text not null default 'tek';
alter table gorevler add column if not exists devreden_id bigint references kullanicilar(id) on delete set null;
alter table gorevler add column if not exists devir_sebebi text;
alter table gorevler add column if not exists devir_tarih timestamptz;
alter table gorevler add column if not exists durum_sebebi text;
alter table gorevler add column if not exists bitis_saat time;
alter table gorevler add column if not exists hatirlatmalar jsonb not null default '[]';
alter table gorevler add column if not exists tarih_revize jsonb;
alter table gorevler add column if not exists sablon_id bigint;
alter table gorevler add column if not exists tekrar_id bigint;

-- CHECK'ler (null geçer; idempotent DO blokları)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_ilerleme') then
    alter table gorevler add constraint chk_gorev_ilerleme check (ilerleme between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_ilerleme_modu') then
    alter table gorevler add constraint chk_gorev_ilerleme_modu check (ilerleme_modu in ('manuel', 'otomatik'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_kabul_durumu') then
    alter table gorevler add constraint chk_gorev_kabul_durumu check (kabul_durumu in ('atandi', 'goruldu', 'kabul_edildi', 'reddedildi'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_onay_durumu') then
    alter table gorevler add constraint chk_gorev_onay_durumu check (onay_durumu is null or onay_durumu in ('bekliyor', 'onaylandi', 'revize', 'reddedildi'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_gizlilik') then
    alter table gorevler add constraint chk_gorev_gizlilik check (gizlilik in ('standart', 'katilimcilar', 'yonetici_katilimcilar', 'ozel'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_tamamlama_kurali') then
    alter table gorevler add constraint chk_gorev_tamamlama_kurali check (tamamlama_kurali in ('hepsi', 'zorunlular', 'serbest'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_atama_turu') then
    alter table gorevler add constraint chk_gorev_atama_turu check (atama_turu in ('tek', 'ortak', 'ana_katilimci'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_bagimlilik_turu') then
    alter table gorevler add constraint chk_gorev_bagimlilik_turu check (bagimlilik_turu is null or bagimlilik_turu in ('once_tamamlanmali', 'sonra_baslayabilir', 'birlikte', 'tamamlaninca_olustur'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_gorev_ust_kendisi') then
    alter table gorevler add constraint chk_gorev_ust_kendisi check (ust_gorev_id is null or ust_gorev_id <> id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Görev modülü ayarları (madde 8 — max alt görev seviyesi)
-- ---------------------------------------------------------------------------
create table if not exists gorev_ayarlar (
  id int primary key default 1 check (id = 1),
  max_alt_seviye int not null default 5,
  guncelleyen_id bigint references kullanicilar(id) on delete set null,
  guncelleme_tarih timestamptz not null default now()
);

insert into gorev_ayarlar (id) values (1) on conflict (id) do nothing;

alter table gorev_ayarlar enable row level security;

drop policy if exists gorev_ayarlar_select on gorev_ayarlar;
create policy gorev_ayarlar_select on gorev_ayarlar for select using (is_staff());

drop policy if exists gorev_ayarlar_admin on gorev_ayarlar;
create policy gorev_ayarlar_admin on gorev_ayarlar
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 4) GRV numara + seviye trigger'ı (madde 8, 21 — advisory lock, mig 159 dersi)
--    Ana görev : GRV-YYYY-NNNNNN
--    Alt görev : <üst_no>-NN  (kardeş sırası, 2 hane; -NN-NN... zincirlenir)
-- ---------------------------------------------------------------------------
create or replace function public.gorev_no_ata() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_yil text;
  v_son int;
  v_ust record;
  v_max int;
begin
  if new.ust_gorev_id is not null then
    select id, gorev_no, seviye into v_ust from gorevler where id = new.ust_gorev_id;
    if v_ust.id is null then
      raise exception 'Üst görev bulunamadı (id=%)', new.ust_gorev_id;
    end if;
    new.seviye := coalesce(v_ust.seviye, 0) + 1;
    select coalesce(max_alt_seviye, 5) into v_max from gorev_ayarlar where id = 1;
    if new.seviye > coalesce(v_max, 5) then
      raise exception 'Maksimum alt görev seviyesi aşıldı (en fazla % seviye)', coalesce(v_max, 5);
    end if;
    if new.gorev_no is null or btrim(new.gorev_no) = '' then
      perform pg_advisory_xact_lock(hashtext('gorev_no_alt_' || new.ust_gorev_id::text));
      select coalesce(max((substring(gorev_no from '([0-9]+)$'))::int), 0) + 1 into v_son
      from gorevler
      where ust_gorev_id = new.ust_gorev_id and gorev_no is not null;
      new.gorev_no := coalesce(v_ust.gorev_no, 'GRV-?') || '-' || lpad(v_son::text, 2, '0');
    end if;
  else
    new.seviye := 0;
    if new.gorev_no is null or btrim(new.gorev_no) = '' then
      perform pg_advisory_xact_lock(hashtext('gorev_no_ana'));
      v_yil := to_char(coalesce(new.olusturma_tarih, now()) at time zone 'Europe/Istanbul', 'YYYY');
      select coalesce(max((substring(gorev_no from '^GRV-[0-9]{4}-([0-9]{6})$'))::int), 0) + 1 into v_son
      from gorevler
      where gorev_no ~ ('^GRV-' || v_yil || '-[0-9]{6}$');
      new.gorev_no := 'GRV-' || v_yil || '-' || lpad(v_son::text, 6, '0');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_gorev_no_ata on gorevler;
create trigger trg_gorev_no_ata before insert on gorevler
  for each row execute function gorev_no_ata();

-- ---------------------------------------------------------------------------
-- 5) olusturan_id doldurma (tarihi eksik: sadece olusturan_ad vardı)
--    Sıra: gelen olusturan_id > olusturan_ad eşleşmesi > auth.uid()
-- ---------------------------------------------------------------------------
create or replace function public.gorev_olusturan_ata() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_ad text;
begin
  if new.olusturan_id is null and new.olusturan_ad is not null and btrim(new.olusturan_ad) <> '' then
    select id into v_id from kullanicilar
    where ad = new.olusturan_ad or kullanici_adi = new.olusturan_ad
    limit 1;
    -- TR-duyarsız yedek (İ/I tuzağı: lower() Türkçede İ→i yapmaz)
    if v_id is null then
      select id into v_id from kullanicilar
      where lower(translate(ad, 'İIŞĞÜÖÇışğüöç', 'iisguocisguoc'))
          = lower(translate(new.olusturan_ad, 'İIŞĞÜÖÇışğüöç', 'iisguocisguoc'))
      limit 1;
    end if;
    new.olusturan_id := v_id;
  end if;
  if new.olusturan_id is null then
    select id, ad into v_id, v_ad from kullanicilar where auth_id = auth.uid() limit 1;
    new.olusturan_id := v_id;
    if new.olusturan_ad is null or btrim(new.olusturan_ad) = '' then
      new.olusturan_ad := v_ad;
    end if;
  end if;
  if (new.olusturan_ad is null or btrim(new.olusturan_ad) = '') and new.olusturan_id is not null then
    select ad into new.olusturan_ad from kullanicilar where id = new.olusturan_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_gorev_olusturan_ata on gorevler;
create trigger trg_gorev_olusturan_ata before insert on gorevler
  for each row execute function gorev_olusturan_ata();

-- ---------------------------------------------------------------------------
-- 6) Backfill — HAREKET TRIGGER'LARINDAN ÖNCE (log gürültüsü olmasın)
-- ---------------------------------------------------------------------------
-- 6a) Mevcut görevlere GRV numarası (yıl bazlı, oluşturma sırasına göre)
with sirali as (
  select id,
         to_char(coalesce(olusturma_tarih, now()) at time zone 'Europe/Istanbul', 'YYYY') as yil,
         row_number() over (
           partition by to_char(coalesce(olusturma_tarih, now()) at time zone 'Europe/Istanbul', 'YYYY')
           order by olusturma_tarih nulls last, id
         ) as rn
  from gorevler
  where gorev_no is null and ust_gorev_id is null
)
update gorevler g
set gorev_no = 'GRV-' || s.yil || '-' || lpad(s.rn::text, 6, '0')
from sirali s
where g.id = s.id;

-- 6b) olusturan_id'yi addan eşle
update gorevler g
set olusturan_id = k.id
from kullanicilar k
where g.olusturan_id is null
  and g.olusturan_ad is not null
  and (k.ad = g.olusturan_ad or k.kullanici_adi = g.olusturan_ad);

-- 6c) Mevcut görevler zaten yürüyen işler — kabul edilmiş sayılır
update gorevler set kabul_durumu = 'kabul_edildi' where kabul_durumu = 'atandi';

-- 6d) Tamamlanmışlar %100
update gorevler set ilerleme = 100 where durum = 'tamamlandi' and ilerleme <> 100;

-- ---------------------------------------------------------------------------
-- 7) Hareket geçmişi — append-only (madde 23, kural 8)
-- ---------------------------------------------------------------------------
create table if not exists gorev_hareketleri (
  id bigserial primary key,
  gorev_id bigint not null references gorevler(id) on delete cascade,
  islem text not null,
  yapan_id bigint references kullanicilar(id) on delete set null,
  yapan_ad text,
  detay jsonb not null default '{}'::jsonb,
  olusturma_tarih timestamptz not null default now()
);

alter table gorev_hareketleri enable row level security;

-- Sadece SELECT policy: UPDATE/DELETE policy YOK → kimse değiştiremez/silemez.
-- INSERT yalnız SECURITY DEFINER trigger fonksiyonundan (RLS'i baypas eder).
-- Görünürlük üst görevin RLS'ine bağlı (gizli görevin hareketi de gizli kalır).
drop policy if exists gorev_hareketleri_select on gorev_hareketleri;
create policy gorev_hareketleri_select on gorev_hareketleri
  for select using (
    exists (select 1 from gorevler g where g.id = gorev_hareketleri.gorev_id)
  );

create or replace function public.gorev_hareket_logla() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kid bigint;
  v_kad text;
  v_d jsonb := '[]'::jsonb;
begin
  select id, ad into v_kid, v_kad from kullanicilar where auth_id = auth.uid() limit 1;

  if tg_op = 'INSERT' then
    insert into gorev_hareketleri (gorev_id, islem, yapan_id, yapan_ad, detay)
    values (new.id, 'olusturuldu', v_kid, coalesce(v_kad, new.olusturan_ad, 'sistem'),
            jsonb_build_object(
              'gorev_no', new.gorev_no, 'baslik', new.baslik,
              'atanan', new.atanan_ad, 'son_tarih', new.son_tarih,
              'ust_gorev_id', new.ust_gorev_id));
    return new;
  end if;

  if new.durum is distinct from old.durum then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'durum', 'eski', old.durum, 'yeni', new.durum));
  end if;
  if new.atanan_id is distinct from old.atanan_id then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'atanan', 'eski', old.atanan_ad, 'yeni', new.atanan_ad));
  end if;
  if new.son_tarih is distinct from old.son_tarih then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'son_tarih', 'eski', old.son_tarih, 'yeni', new.son_tarih));
  end if;
  if new.oncelik is distinct from old.oncelik then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'oncelik', 'eski', old.oncelik, 'yeni', new.oncelik));
  end if;
  if new.ilerleme is distinct from old.ilerleme then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'ilerleme', 'eski', old.ilerleme, 'yeni', new.ilerleme));
  end if;
  if new.kabul_durumu is distinct from old.kabul_durumu then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'kabul_durumu', 'eski', old.kabul_durumu, 'yeni', new.kabul_durumu, 'sebep', new.red_sebebi));
  end if;
  if new.onay_durumu is distinct from old.onay_durumu then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'onay_durumu', 'eski', old.onay_durumu, 'yeni', new.onay_durumu, 'not', new.onay_notu));
  end if;
  if new.onaylayici_id is distinct from old.onaylayici_id then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'onaylayici', 'eski', old.onaylayici_id, 'yeni', new.onaylayici_id));
  end if;
  if new.baslik is distinct from old.baslik then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'baslik', 'eski', old.baslik, 'yeni', new.baslik));
  end if;
  if new.gizlilik is distinct from old.gizlilik then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'gizlilik', 'eski', old.gizlilik, 'yeni', new.gizlilik));
  end if;
  if new.devreden_id is distinct from old.devreden_id and new.devreden_id is not null then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'devir', 'eski', old.atanan_ad, 'yeni', new.atanan_ad, 'sebep', new.devir_sebebi));
  end if;
  if new.durum_sebebi is distinct from old.durum_sebebi and new.durum_sebebi is not null then
    v_d := v_d || jsonb_build_array(jsonb_build_object('alan', 'durum_sebebi', 'yeni', new.durum_sebebi));
  end if;

  if jsonb_array_length(v_d) > 0 then
    insert into gorev_hareketleri (gorev_id, islem, yapan_id, yapan_ad, detay)
    values (new.id, 'guncellendi', v_kid, coalesce(v_kad, 'sistem'), v_d);
  end if;
  return new;
end $$;

drop trigger if exists trg_gorev_hareket_ins on gorevler;
create trigger trg_gorev_hareket_ins after insert on gorevler
  for each row execute function gorev_hareket_logla();

drop trigger if exists trg_gorev_hareket_upd on gorevler;
create trigger trg_gorev_hareket_upd after update on gorevler
  for each row execute function gorev_hareket_logla();

-- ---------------------------------------------------------------------------
-- 8) Kontrol listesi (madde 18 — alt görevden ayrı, basit adımlar)
-- ---------------------------------------------------------------------------
create table if not exists gorev_kontrol_listesi (
  id bigserial primary key,
  gorev_id bigint not null references gorevler(id) on delete cascade,
  baslik text not null,
  sorumlu_id bigint references kullanicilar(id) on delete set null,
  son_tarih date,
  zorunlu boolean not null default false,
  tamamlandi boolean not null default false,
  tamamlayan_id bigint references kullanicilar(id) on delete set null,
  tamamlayan_ad text,
  tamamlanma_tarih timestamptz,
  sira int not null default 0,
  olusturan_id bigint references kullanicilar(id) on delete set null,
  olusturma_tarih timestamptz not null default now()
);

alter table gorev_kontrol_listesi enable row level security;

drop policy if exists gorev_kontrol_admin on gorev_kontrol_listesi;
create policy gorev_kontrol_admin on gorev_kontrol_listesi
  for all using (is_admin()) with check (is_admin());

-- Görünürlük + yazma: üst görevi görebilen personel (gizlilik RLS'i devralınır)
drop policy if exists gorev_kontrol_select on gorev_kontrol_listesi;
create policy gorev_kontrol_select on gorev_kontrol_listesi
  for select using (
    is_staff() and exists (select 1 from gorevler g where g.id = gorev_kontrol_listesi.gorev_id)
  );

drop policy if exists gorev_kontrol_insert on gorev_kontrol_listesi;
create policy gorev_kontrol_insert on gorev_kontrol_listesi
  for insert with check (
    is_staff() and exists (select 1 from gorevler g where g.id = gorev_kontrol_listesi.gorev_id)
  );

drop policy if exists gorev_kontrol_update on gorev_kontrol_listesi;
create policy gorev_kontrol_update on gorev_kontrol_listesi
  for update using (
    is_staff() and exists (select 1 from gorevler g where g.id = gorev_kontrol_listesi.gorev_id)
  );

drop policy if exists gorev_kontrol_delete on gorev_kontrol_listesi;
create policy gorev_kontrol_delete on gorev_kontrol_listesi
  for delete using (
    is_staff() and exists (select 1 from gorevler g where g.id = gorev_kontrol_listesi.gorev_id)
  );

-- ---------------------------------------------------------------------------
-- 9) gorevler RLS güncellemeleri
-- ---------------------------------------------------------------------------
-- 9a) SELECT: gizlilik seviyeli (madde 20). standart = tüm personel (mig 174 davranışı).
--     Katılımcı = oluşturan/atanan/ekip/gözlemci/onaylayıcı.
drop policy if exists gorevler_personel_select on gorevler;
create policy gorevler_personel_select on gorevler
  for select using (
    is_staff() and (
      coalesce(gizlilik, 'standart') = 'standart'
      or exists (
        select 1 from kullanicilar k
        where k.auth_id = auth.uid()
          and (k.id = gorevler.atanan_id
            or k.id = gorevler.olusturan_id
            or k.id = gorevler.onaylayici_id
            or k.id = any(gorevler.ekip)
            or k.id = any(gorevler.gozlemciler)
            or k.ad = gorevler.olusturan_ad
            or k.kullanici_adi = gorevler.olusturan_ad)
      )
      or (coalesce(gizlilik, 'standart') = 'yonetici_katilimcilar' and is_admin())
    )
  );

-- 9b) INSERT: olusturan_id eşleşmesi de sayılsın
drop policy if exists gorevler_personel_insert on gorevler;
create policy gorevler_personel_insert on gorevler
  for insert with check (
    is_staff() and exists (
      select 1 from kullanicilar k
      where k.auth_id = auth.uid()
        and (k.id = gorevler.atanan_id
          or k.id = gorevler.olusturan_id
          or k.id = any(gorevler.ekip)
          or k.ad = gorevler.olusturan_ad
          or k.kullanici_adi = gorevler.olusturan_ad)
    )
  );

-- 9c) UPDATE: onaylayıcı da güncelleyebilmeli (onay verirken); gözlemci GÜNCELLEYEMEZ
drop policy if exists gorevler_personel_update on gorevler;
create policy gorevler_personel_update on gorevler
  for update using (
    is_staff() and exists (
      select 1 from kullanicilar k
      where k.auth_id = auth.uid()
        and (k.id = gorevler.atanan_id
          or k.id = gorevler.olusturan_id
          or k.id = gorevler.onaylayici_id
          or k.id = any(gorevler.ekip)
          or k.ad = gorevler.olusturan_ad
          or k.kullanici_adi = gorevler.olusturan_ad)
    )
  ) with check (
    is_staff() and exists (
      select 1 from kullanicilar k
      where k.auth_id = auth.uid()
        and (k.id = gorevler.atanan_id
          or k.id = gorevler.olusturan_id
          or k.id = gorevler.onaylayici_id
          or k.id = any(gorevler.ekip)
          or k.ad = gorevler.olusturan_ad
          or k.kullanici_adi = gorevler.olusturan_ad)
    )
  );

-- 9d) DELETE: personel yalnız kendi TASLAK görevini silebilir (kural 9 — atanmış
--     görev silinmez, İPTAL edilir). Admin, gorevler_admin_all ile silebilir.
drop policy if exists gorevler_personel_delete on gorevler;
create policy gorevler_personel_delete on gorevler
  for delete using (
    is_staff() and coalesce(durum, '') = 'taslak' and exists (
      select 1 from kullanicilar k
      where k.auth_id = auth.uid()
        and (k.id = gorevler.olusturan_id
          or k.ad = gorevler.olusturan_ad
          or k.kullanici_adi = gorevler.olusturan_ad)
    )
  );

-- ---------------------------------------------------------------------------
-- 10) Kişi bazlı alt görev yetkileri (madde 9) — varsayılan serbest, admin kısar
-- ---------------------------------------------------------------------------
alter table kullanicilar add column if not exists gorev_yetki jsonb not null
  default '{"altGorev": "herkes", "devir": true, "cokluAtama": true, "sureDegistir": true, "altIptal": true}'::jsonb;

-- ---------------------------------------------------------------------------
-- 11) İndeksler
-- ---------------------------------------------------------------------------
create unique index if not exists uq_gorevler_gorev_no on gorevler(gorev_no) where gorev_no is not null;
create index if not exists idx_gorevler_ust on gorevler(ust_gorev_id) where ust_gorev_id is not null;
create index if not exists idx_gorevler_kategori on gorevler(kategori_id) where kategori_id is not null;
create index if not exists idx_gorevler_onaylayici on gorevler(onaylayici_id) where onaylayici_id is not null;
create index if not exists idx_gorev_hareket_gorev on gorev_hareketleri(gorev_id, olusturma_tarih desc);
create index if not exists idx_gorev_kontrol_gorev on gorev_kontrol_listesi(gorev_id, sira);

-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
select 'MIG 195 OK — gorev hiyerarsi temeli kuruldu' as sonuc;
