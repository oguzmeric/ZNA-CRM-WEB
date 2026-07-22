-- 222 — Destek talebi SOHBETİ (thread).
--
-- Sorun: destek_talepleri.cevap TEK kolondu; her yanıt öncekini EZİYORDU
-- ("yanıt verdiğimde bir önceki yazdığım siliniyor", 2026-07-22).
-- Artık mesajlar ayrı tabloda birikir. Talebin kendi 'mesaj' alanı sohbetin
-- AÇILIŞ mesajı olarak kalır; 'cevap' kolonu geriye uyum için korunur
-- (son yanıtın özeti — eski istemciler/rozetler kırılmasın).

create table if not exists destek_mesajlari (
  id              bigint generated always as identity primary key,
  talep_id        uuid not null references destek_talepleri(id) on delete cascade,
  yazar_id        bigint,
  yazar_ad        text,
  mesaj           text not null,
  foto_url        text,
  olusturma_tarih timestamptz not null default now()
);

create index if not exists ix_destek_mesaj_talep on destek_mesajlari (talep_id, olusturma_tarih);

alter table destek_mesajlari enable row level security;

-- Görme: kendi talebimin mesajları ya da personel (talep select politikasıyla aynı)
drop policy if exists destek_mesajlari_select on destek_mesajlari;
create policy destek_mesajlari_select on destek_mesajlari for select using (
  exists (
    select 1 from destek_talepleri t
    where t.id = destek_mesajlari.talep_id
      and (t.kullanici_id = (select k.id from kullanicilar k where k.auth_id = auth.uid())
           or is_staff())
  )
);

-- Yazma: kendi talebime YA DA destek yöneticisi (id 2) — mig 189/190'daki
-- "cevap yalnız Oğuz" kuralıyla tutarlı; talep sahibi kendi konusunda yazabilir.
drop policy if exists destek_mesajlari_insert on destek_mesajlari;
create policy destek_mesajlari_insert on destek_mesajlari for insert with check (
  exists (
    select 1 from destek_talepleri t
    where t.id = destek_mesajlari.talep_id
      and (t.kullanici_id = (select k.id from kullanicilar k where k.auth_id = auth.uid())
           or exists (select 1 from kullanicilar k2 where k2.auth_id = auth.uid() and k2.id = 2))
  )
);

-- Mevcut TEK cevapları sohbete taşı (veri kaybı olmasın)
insert into destek_mesajlari (talep_id, yazar_id, yazar_ad, mesaj, olusturma_tarih)
select t.id, 2, 'Destek', t.cevap, coalesce(t.cevap_tarihi, t.olusturma_tarih)
from destek_talepleri t
where coalesce(trim(t.cevap), '') <> ''
  and not exists (select 1 from destek_mesajlari m where m.talep_id = t.id);

notify pgrst, 'reload schema';
