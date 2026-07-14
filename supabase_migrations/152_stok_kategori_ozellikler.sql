-- 152: Stok v2 Faz 2 — Kategori-bazlı dinamik teknik özellikler (EAV)
-- Spec: "IP Kamera seçildiğinde çözünürlük/lens/tip alanları otomatik açılmalı,
-- özellik alanları yönetici tarafından kategori bazlı oluşturulabilmeli."
-- Miras: bir özellik hangi kategoriye tanımlıysa o dalın TÜM alt dallarında da
-- geçerlidir (client tarafında ata zinciri gezilerek toplanır).

-- ==================== ÖZELLİK TANIMLARI ====================
create table if not exists stok_kategori_ozellikler (
  id bigint generated always as identity primary key,
  kategori_id bigint not null references stok_kategoriler(id) on delete cascade,
  ad text not null,                       -- "Çözünürlük", "Lens ölçüsü"...
  tip text not null default 'secim'
    check (tip in ('secim','metin','sayi','evet_hayir')),
  secenekler jsonb,                       -- secim için: ["2 MP","4 MP",...]
  birim text,                             -- sayi için: "adet", "W", "m"...
  sira int not null default 0,
  aktif boolean not null default true,
  olusturma_tarih timestamptz not null default now()
);

create unique index if not exists ux_stok_kat_ozellik_ad
  on stok_kategori_ozellikler (kategori_id, lower(trim(ad)));
create index if not exists ix_stok_kat_ozellik_kat on stok_kategori_ozellikler (kategori_id);

-- ==================== ÜRÜN DEĞERLERİ ====================
create table if not exists stok_urun_ozellikler (
  id bigint generated always as identity primary key,
  urun_id bigint not null references stok_urunler(id) on delete cascade,
  ozellik_id bigint not null references stok_kategori_ozellikler(id) on delete cascade,
  deger text not null,
  guncelleme_tarih timestamptz not null default now()
);

create unique index if not exists ux_stok_urun_ozellik
  on stok_urun_ozellikler (urun_id, ozellik_id);
create index if not exists ix_stok_urun_ozellik_urun on stok_urun_ozellikler (urun_id);
create index if not exists ix_stok_urun_ozellik_ozellik on stok_urun_ozellikler (ozellik_id);

-- ==================== RLS ====================
alter table stok_kategori_ozellikler enable row level security;
alter table stok_urun_ozellikler enable row level security;

-- Tanımlar: okuma personel, yazma admin (kategorilerle aynı kural)
drop policy if exists stok_kat_ozellik_sel on stok_kategori_ozellikler;
create policy stok_kat_ozellik_sel on stok_kategori_ozellikler
  for select using (is_staff());
drop policy if exists stok_kat_ozellik_ins on stok_kategori_ozellikler;
create policy stok_kat_ozellik_ins on stok_kategori_ozellikler
  for insert with check (is_admin());
drop policy if exists stok_kat_ozellik_upd on stok_kategori_ozellikler;
create policy stok_kat_ozellik_upd on stok_kategori_ozellikler
  for update using (is_admin()) with check (is_admin());
drop policy if exists stok_kat_ozellik_del on stok_kategori_ozellikler;
create policy stok_kat_ozellik_del on stok_kategori_ozellikler
  for delete using (is_admin());

-- Ürün değerleri: ürün kartını düzenleyen herkes yazabilir (staff)
drop policy if exists stok_urun_ozellik_all on stok_urun_ozellikler;
create policy stok_urun_ozellik_all on stok_urun_ozellikler
  for all using (is_staff()) with check (is_staff());

-- ==================== SEED (spec) — idempotent ====================
do $$
declare
  v_kat bigint;
begin
  if exists (select 1 from stok_kategori_ozellikler limit 1) then
    return;
  end if;

  -- ---- IP Kamera ----
  select id into v_kat from stok_kategoriler where ad = 'IP Kamera' limit 1;
  if v_kat is not null then
    insert into stok_kategori_ozellikler (kategori_id, ad, tip, secenekler, sira) values
      (v_kat, 'Çözünürlük',            'secim', '["2 MP","4 MP","5 MP","8 MP"]', 1),
      (v_kat, 'Lens tipi',             'secim', '["Sabit lens","Motorize lens","Varifocal lens"]', 2),
      (v_kat, 'Lens ölçüsü',           'secim', '["2.8 mm","3.6 mm","4 mm","2.8–12 mm"]', 3),
      (v_kat, 'Kamera tipi',           'secim', '["Bullet","Dome","Turret","PTZ","Fisheye"]', 4),
      (v_kat, 'Ortam',                 'secim', '["İç ortam","Dış ortam","İç/Dış"]', 5);
    insert into stok_kategori_ozellikler (kategori_id, ad, tip, birim, sira) values
      (v_kat, 'Gece görüş mesafesi',   'sayi', 'm', 6);
    insert into stok_kategori_ozellikler (kategori_id, ad, tip, sira) values
      (v_kat, 'Ses desteği',           'evet_hayir', 7),
      (v_kat, 'Mikrofon',              'evet_hayir', 8),
      (v_kat, 'SD kart desteği',       'evet_hayir', 9),
      (v_kat, 'WDR',                   'evet_hayir', 10),
      (v_kat, 'Yapay zekâ desteği',    'evet_hayir', 11),
      (v_kat, 'İnsan algılama',        'evet_hayir', 12),
      (v_kat, 'Araç algılama',         'evet_hayir', 13),
      (v_kat, 'Yüz tanıma desteği',    'evet_hayir', 14),
      (v_kat, 'Plaka tanıma desteği',  'evet_hayir', 15),
      (v_kat, 'ONVIF desteği',         'evet_hayir', 16),
      (v_kat, 'PoE desteği',           'evet_hayir', 17);
    insert into stok_kategori_ozellikler (kategori_id, ad, tip, sira) values
      (v_kat, 'IP koruma sınıfı',      'metin', 18),
      (v_kat, 'IK dayanıklılık sınıfı','metin', 19);
  end if;

  -- ---- Network Switch + PoE Switch (aynı set) ----
  for v_kat in
    select id from stok_kategoriler where ad in ('Network Switch','PoE Switch')
  loop
    insert into stok_kategori_ozellikler (kategori_id, ad, tip, birim, sira) values
      (v_kat, 'Port sayısı',     'sayi', 'port', 1),
      (v_kat, 'PoE port sayısı', 'sayi', 'port', 2),
      (v_kat, 'PoE bütçesi',     'sayi', 'W', 3);
    insert into stok_kategori_ozellikler (kategori_id, ad, tip, sira) values
      (v_kat, 'Uplink portu',    'metin', 4),
      (v_kat, 'SFP portu',       'metin', 5);
    insert into stok_kategori_ozellikler (kategori_id, ad, tip, secenekler, sira) values
      (v_kat, 'Yönetim',         'secim', '["Yönetilebilir","Yönetilemez"]', 6),
      (v_kat, 'Katman seviyesi', 'secim', '["Layer 2","Layer 3"]', 7),
      (v_kat, 'Rack tipi',       'secim', '["Rack tip","Masaüstü"]', 9);
    insert into stok_kategori_ozellikler (kategori_id, ad, tip, sira) values
      (v_kat, 'Gigabit desteği', 'evet_hayir', 8);
  end loop;
end $$;

notify pgrst, 'reload schema';
