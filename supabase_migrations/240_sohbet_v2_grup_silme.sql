-- 240 — Sohbet v2: grup sohbeti + sohbeti silip yeniden başlatabilme
--
-- Mevcut durum: `mesajlar` tablosu birebir (gonderici_id → alici_id). Grup
-- kurulamıyor; silme ise arayüzde HİÇ yok (DB'de yalnız admin silebiliyordu).
--
-- Kullanıcı isteği (29.07):
--   "Kişilerle olan sohbetleri silebilsin, istersen o kişiye tıklayıp tekrar
--    sohbet başlatabilsin. Ayrıca 1-2 kişiyi ekleyerek toplu konuşma."
--   Silme kuralı: kendi mesajını herkes siler.
--
-- Tasarım kararları:
--  1) Sohbet artık ayrı bir varlık (sohbetler + sohbet_katilimcilar). Birebir
--     sohbet de bir "sohbet" — böylece grup ile tek kod yolu paylaşılır.
--  2) "Sohbeti sil" KARŞI TARAFI SİLMEZ: katılımcı satırına `gizlendi_tarih`
--     damgası basılır, o tarihe kadarki mesajlar o kişiden gizlenir. Yeni mesaj
--     gelince/yazınca sohbet kendiliğinden geri döner — "tekrar başlatabilsin"
--     isteğinin karşılığı bu. Karşı tarafın geçmişi bozulmaz (denetim izi korunur).
--  3) TEK mesaj silme gerçek DELETE ama yalnız kendi mesajın (veya admin).

begin;

-- ── Sohbetler ──────────────────────────────────────────────────────────────
create table if not exists public.sohbetler (
  id               bigserial primary key,
  tip              text not null default 'birebir' check (tip in ('birebir', 'grup')),
  ad               text,                       -- grup adı; birebirde null
  olusturan_id     bigint references public.kullanicilar(id) on delete set null,
  olusturma_tarih  timestamptz not null default now(),
  son_mesaj_tarih  timestamptz                 -- liste sıralaması (trigger doldurur)
);

create table if not exists public.sohbet_katilimcilar (
  sohbet_id       bigint not null references public.sohbetler(id) on delete cascade,
  kullanici_id    bigint not null references public.kullanicilar(id) on delete cascade,
  katilma_tarih   timestamptz not null default now(),
  gizlendi_tarih  timestamptz,                 -- "sohbeti sil" damgası
  ayrildi         boolean not null default false,
  primary key (sohbet_id, kullanici_id)
);

create index if not exists ix_sohbet_kat_kullanici on public.sohbet_katilimcilar(kullanici_id);

alter table public.mesajlar
  add column if not exists sohbet_id bigint references public.sohbetler(id) on delete cascade;

create index if not exists ix_mesajlar_sohbet on public.mesajlar(sohbet_id, tarih);

-- ── Mevcut birebir mesajları sohbetlere taşı ───────────────────────────────
-- Her (küçük_id, büyük_id) çifti için TEK sohbet; yön farkı gözetilmez.
-- Çift başına tek tek ilerliyoruz: toplu INSERT ... RETURNING ile eşleştirmek
-- kırılgan olurdu (aynı ilk/son zaman damgasına sahip iki çift karışabilir).
do $$
declare
  c record;
  v_sohbet_id bigint;
begin
  for c in
    select least(gonderici_id, alici_id)    as a_id,
           greatest(gonderici_id, alici_id) as b_id,
           min(tarih) as ilk, max(tarih) as son
      from public.mesajlar
     where sohbet_id is null
       and gonderici_id is not null and alici_id is not null
       and gonderici_id <> alici_id
     group by 1, 2
  loop
    insert into public.sohbetler (tip, olusturma_tarih, son_mesaj_tarih)
    values ('birebir', c.ilk, c.son)
    returning id into v_sohbet_id;

    insert into public.sohbet_katilimcilar (sohbet_id, kullanici_id)
    values (v_sohbet_id, c.a_id), (v_sohbet_id, c.b_id)
    on conflict do nothing;

    update public.mesajlar
       set sohbet_id = v_sohbet_id
     where sohbet_id is null
       and least(gonderici_id, alici_id) = c.a_id
       and greatest(gonderici_id, alici_id) = c.b_id;
  end loop;
end $$;

-- ── son_mesaj_tarih'i güncel tut ───────────────────────────────────────────
create or replace function public.sohbet_son_mesaj_guncelle()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.sohbet_id is not null then
    update public.sohbetler set son_mesaj_tarih = new.tarih where id = new.sohbet_id;
  end if;
  return new;
end $$;

drop trigger if exists tr_sohbet_son_mesaj on public.mesajlar;
create trigger tr_sohbet_son_mesaj after insert on public.mesajlar
for each row execute function public.sohbet_son_mesaj_guncelle();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.sohbetler          enable row level security;
alter table public.sohbet_katilimcilar enable row level security;

-- Katılımcı mıyım? (politikalarda tekrar tekrar kullanılıyor)
create or replace function public.sohbet_katilimcisi_mi(p_sohbet_id bigint)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from sohbet_katilimcilar k
      join kullanicilar u on u.id = k.kullanici_id
     where k.sohbet_id = p_sohbet_id
       and u.auth_id = auth.uid()
       and k.ayrildi = false
  );
$$;
revoke execute on function public.sohbet_katilimcisi_mi(bigint) from anon;
grant execute on function public.sohbet_katilimcisi_mi(bigint) to authenticated;

drop policy if exists sohbetler_katilimci_select on public.sohbetler;
create policy sohbetler_katilimci_select on public.sohbetler
  for select to authenticated using ((select public.sohbet_katilimcisi_mi(id)));

drop policy if exists sohbetler_staff_insert on public.sohbetler;
create policy sohbetler_staff_insert on public.sohbetler
  for insert to authenticated with check ((select public.is_staff()));

-- Grup adını değiştirme: katılımcı yeter
drop policy if exists sohbetler_katilimci_update on public.sohbetler;
create policy sohbetler_katilimci_update on public.sohbetler
  for update to authenticated
  using ((select public.sohbet_katilimcisi_mi(id)))
  with check ((select public.sohbet_katilimcisi_mi(id)));

drop policy if exists sohbet_kat_select on public.sohbet_katilimcilar;
create policy sohbet_kat_select on public.sohbet_katilimcilar
  for select to authenticated using ((select public.sohbet_katilimcisi_mi(sohbet_id)));

-- Katılımcı ekleme: kendisi katılımcıysa (grup kurarken ilk satır RPC'den yazılır)
drop policy if exists sohbet_kat_insert on public.sohbet_katilimcilar;
create policy sohbet_kat_insert on public.sohbet_katilimcilar
  for insert to authenticated with check ((select public.is_staff()));

-- Kendi katılımcı satırını güncelleme (gizlendi_tarih / ayrildi)
drop policy if exists sohbet_kat_update_self on public.sohbet_katilimcilar;
create policy sohbet_kat_update_self on public.sohbet_katilimcilar
  for update to authenticated
  using (kullanici_id in (select id from kullanicilar where auth_id = auth.uid()))
  with check (kullanici_id in (select id from kullanicilar where auth_id = auth.uid()));

-- ── mesajlar politikaları: sohbet tabanlı + gizleme damgası ────────────────
drop policy if exists mesajlar_select_self on public.mesajlar;
create policy mesajlar_select_self on public.mesajlar
  for select to authenticated
  using (
    -- Sohbete bağlı mesaj: katılımcı ol + kendi gizleme damgandan sonra olsun
    (sohbet_id is not null
      and (select public.sohbet_katilimcisi_mi(sohbet_id))
      and not exists (
        select 1 from sohbet_katilimcilar k
          join kullanicilar u on u.id = k.kullanici_id
         where k.sohbet_id = mesajlar.sohbet_id
           and u.auth_id = auth.uid()
           and k.gizlendi_tarih is not null
           and mesajlar.tarih <= k.gizlendi_tarih
      ))
    -- Sohbetsiz eski kayıt kalırsa eski davranış (güvenli geri düşüş)
    or (sohbet_id is null and (gonderici_id in (select id from kullanicilar where auth_id = auth.uid())
                            or alici_id   in (select id from kullanicilar where auth_id = auth.uid())))
  );

-- Kendi mesajını herkes siler; admin hepsini
drop policy if exists mesajlar_delete_admin on public.mesajlar;
create policy mesajlar_delete_own on public.mesajlar
  for delete to authenticated
  using (
    gonderici_id in (select id from kullanicilar where auth_id = auth.uid())
    or (select public.is_admin())
  );

commit;
