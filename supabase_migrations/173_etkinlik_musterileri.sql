-- Takvim toplantısını MÜŞTERİye bağla: "müşteri seçilirse geçmişinde yapılan
-- toplantı görünmeli" (2026-07-15).
--
-- Neden ayrı tablo: modalda BİRDEN FAZLA müşteri seçilebiliyor, dolayısıyla
-- harici_etkinlikler'e tek bir musteri_id kolonu yetmez.
--
-- Not: harici_etkinlikler satırını google-takvim-etkinlik-olustur edge fn'i
-- oluşturuyor ve yerel id'yi (etkinlikId) döndürüyor — bağ o id ile kurulur.

create table if not exists etkinlik_musterileri (
  id              bigserial primary key,
  etkinlik_id     bigint not null references harici_etkinlikler(id) on delete cascade,
  musteri_id      bigint not null references musteriler(id) on delete cascade,
  olusturan_id    bigint,
  olusturma_tarih timestamptz not null default now(),
  unique (etkinlik_id, musteri_id)
);

create index if not exists idx_etkinlik_musterileri_musteri on etkinlik_musterileri (musteri_id);
create index if not exists idx_etkinlik_musterileri_etkinlik on etkinlik_musterileri (etkinlik_id);

alter table etkinlik_musterileri enable row level security;

-- Personel görebilsin/yazabilsin. Müşteri portalı kullanıcıları bu tabloyu
-- görmemeli — iç toplantı takvimi müşteriye açılmaz.
drop policy if exists staff_all_etkinlik_musterileri on etkinlik_musterileri;
create policy staff_all_etkinlik_musterileri on etkinlik_musterileri
  for all to authenticated
  using (is_staff()) with check (is_staff());

comment on table etkinlik_musterileri is
  'Takvim etkinliği (harici_etkinlikler) ↔ müşteri bağı. Bir toplantıya birden fazla müşteri bağlanabilir; Firma Geçmişi zaman çizelgesi buradan besleniyor (mig 173).';

notify pgrst, 'reload schema';
