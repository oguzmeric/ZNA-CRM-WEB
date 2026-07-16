-- 174 — Görev görünürlüğü herkese açılır + yorumlar ayrı tabloya taşınır
--
-- İSTEK: "Açılan görevleri herkes birbirininkini görebilmeli ve yorum yapabilmeli."
-- KARAR (kullanıcı): herkes GÖRSÜN + YORUM yapsın; ama görevi DÜZENLEME/atama/
-- tamamlama yalnız sahibi (atanan) + ekibi + admin'de kalsın (skor/performans
-- 'kim ne yaptı' bütünlüğü korunsun).
--
-- Yorumlar bugüne kadar gorevler.yorumlar JSONB kolonundaydı; yorum yazmak =
-- görev satırını UPDATE etmek. Herkes yorum yapabilsin ama herkes görevi
-- düzenleyemesin dendiği için yorumlar AYRI TABLOYA taşınıyor: yorum INSERT'i
-- tüm personele açık, görev UPDATE'i eskisi gibi kısıtlı kalıyor.

begin;

-- 1) GÖRÜNÜRLÜK: personel SELECT policy'sini tüm staff'a aç
drop policy if exists gorevler_personel_select on gorevler;
create policy gorevler_personel_select on gorevler
  for select using (is_staff());

-- 2) YORUM TABLOSU
create table if not exists gorev_yorumlari (
  id              uuid primary key default gen_random_uuid(),
  gorev_id        bigint not null references gorevler(id) on delete cascade,
  kullanici_id    bigint references kullanicilar(id) on delete set null,
  yazar_ad        text not null,
  icerik          text not null,
  zaman_metin     text,                                  -- eski JSON'daki orijinal tr-TR gösterim metni (varsa)
  duzenlendi      boolean not null default false,
  olusturma_tarih timestamptz not null default now(),
  guncelleme_tarih timestamptz
);
create index if not exists idx_gorev_yorumlari_gorev on gorev_yorumlari (gorev_id, olusturma_tarih);

alter table gorev_yorumlari enable row level security;

-- RLS: admin her şey; tüm personel okur + yorum ekler; kendi yorumunu düzenler/siler
drop policy if exists gorev_yorumlari_admin      on gorev_yorumlari;
drop policy if exists gorev_yorumlari_select     on gorev_yorumlari;
drop policy if exists gorev_yorumlari_insert     on gorev_yorumlari;
drop policy if exists gorev_yorumlari_update_own on gorev_yorumlari;
drop policy if exists gorev_yorumlari_delete_own on gorev_yorumlari;

create policy gorev_yorumlari_admin on gorev_yorumlari
  for all using (is_admin()) with check (is_admin());

create policy gorev_yorumlari_select on gorev_yorumlari
  for select using (is_staff());

-- INSERT: yorumu yalnız KENDİ adına ekleyebilirsin (impersonation önlenir)
create policy gorev_yorumlari_insert on gorev_yorumlari
  for insert with check (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

create policy gorev_yorumlari_update_own on gorev_yorumlari
  for update using (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

create policy gorev_yorumlari_delete_own on gorev_yorumlari
  for delete using (
    is_staff()
    and kullanici_id = (select id from kullanicilar where auth_id = auth.uid() limit 1)
  );

-- 3) MEVCUT JSON YORUMLARI TABLOYA GÖÇ (yalnız tablo boşsa — idempotent)
insert into gorev_yorumlari (gorev_id, kullanici_id, yazar_ad, icerik, zaman_metin, olusturma_tarih)
select g.id,
       case when (y->>'yazarId') ~ '^\d+$' then (y->>'yazarId')::bigint else null end,
       coalesce(nullif(y->>'yazar',''), '—'),
       coalesce(y->>'icerik', ''),
       y->>'tarih',
       coalesce(
         case when (y->>'tarih') ~ '^\d{2}\.\d{2}\.\d{4}'
              then to_timestamp(y->>'tarih', 'DD.MM.YYYY HH24:MI:SS')
              else null end,
         g.olusturma_tarih,
         now()
       )
from gorevler g
cross join lateral jsonb_array_elements(g.yorumlar) as y
where g.yorumlar is not null
  and jsonb_typeof(g.yorumlar) = 'array'
  and jsonb_array_length(g.yorumlar) > 0
  and not exists (select 1 from gorev_yorumlari);

-- gorevler.yorumlar kolonu BİLEREK bırakılıyor (rollback güvenliği + mobil
-- eski okuma yolu kırılmasın); web artık yeni tabloyu kullanır, o kolona yazmaz.

commit;

notify pgrst, 'reload schema';
