-- 255 — Maaş avans talebi (İzin & Bordro modülünün üçüncü ayağı)
--
-- Akış: personel tutar + taksit sayısı ile talep açar → İK yetkilisi onaylar
-- → muhasebe ödemeyi yapınca "Ödendi" işaretler → O AN taksit planı üretilir
-- → her ay bordro kesilince taksit "kesildi" işaretlenir.
--
-- Ödeme ayrı adım: "onaylandı" ≠ "para verildi". Taksit takvimi ödeme
-- tarihinden başlamalı, onay tarihinden değil — arada gün/hafta geçebiliyor.

create table if not exists public.avans_talepleri (
  id                  bigserial primary key,
  kullanici_id        bigint not null references public.kullanicilar(id),
  tutar               numeric(12,2) not null check (tutar > 0),
  taksit_sayisi       int not null default 1 check (taksit_sayisi between 1 and 12),
  gerekce             text,
  durum               text not null default 'bekliyor'
                        check (durum in ('bekliyor','onaylandi','reddedildi','iptal')),
  -- Karar
  onaylayan_id        bigint references public.kullanicilar(id),
  onay_tarihi         timestamptz,
  karar_notu          text,
  -- Ödeme (null = henüz ödenmedi; boolean yerine tarih — "ne zaman" bilgisi de lazım)
  odeme_tarihi        timestamptz,
  odeyen_id           bigint references public.kullanicilar(id),
  -- İlk kesintinin yapılacağı ay (ayın 1'i). Boş bırakılırsa ödeme ayının
  -- ERTESİ ayı kabul edilir — ay ortasında alınan avans o ayın bordrosuna
  -- çoğunlukla yetişmiyor.
  ilk_kesinti_donemi  date,
  olusturma_tarih     timestamptz not null default now()
);

create index if not exists idx_avans_kullanici on public.avans_talepleri(kullanici_id);
create index if not exists idx_avans_durum on public.avans_talepleri(durum);

-- Taksitler: plan ÖDEME anında üretilir (aşağıdaki trigger)
create table if not exists public.avans_taksitleri (
  id              bigserial primary key,
  avans_id        bigint not null references public.avans_talepleri(id) on delete cascade,
  sira            int not null,
  donem           date not null,               -- kesintinin yapılacağı ayın 1'i
  tutar           numeric(12,2) not null,
  kesinti_tarihi  timestamptz,                 -- null = henüz kesilmedi
  kesen_id        bigint references public.kullanicilar(id),
  olusturma_tarih timestamptz not null default now(),
  unique (avans_id, sira)
);

create index if not exists idx_avans_taksit_avans on public.avans_taksitleri(avans_id);
create index if not exists idx_avans_taksit_donem on public.avans_taksitleri(donem);

-- ── RLS — izin_talepleri ile BİREBİR aynı kural ──────────────────────────
alter table public.avans_talepleri enable row level security;
alter table public.avans_taksitleri enable row level security;

drop policy if exists avans_sel on public.avans_talepleri;
create policy avans_sel on public.avans_talepleri for select
  using (kullanici_id = (select ik_kendi_id()) or (select ik_yetkili()));

drop policy if exists avans_ins on public.avans_talepleri;
create policy avans_ins on public.avans_talepleri for insert
  with check (kullanici_id = (select ik_kendi_id()) or (select ik_yetkili()));

-- Personel YALNIZ bekleyen talebini düzenler/iptal eder; onaylanmışa dokunamaz
drop policy if exists avans_upd on public.avans_talepleri;
create policy avans_upd on public.avans_talepleri for update
  using ((select ik_yetkili())
         or (kullanici_id = (select ik_kendi_id()) and durum = 'bekliyor'));

drop policy if exists avans_del on public.avans_talepleri;
create policy avans_del on public.avans_talepleri for delete
  using ((select ik_yetkili()));

-- Taksitler: kendi avansının taksitlerini görür, yalnız İK yetkilisi işler
drop policy if exists avans_taksit_sel on public.avans_taksitleri;
create policy avans_taksit_sel on public.avans_taksitleri for select
  using (exists (
    select 1 from public.avans_talepleri a
    where a.id = avans_id
      and (a.kullanici_id = (select ik_kendi_id()) or (select ik_yetkili()))
  ));

drop policy if exists avans_taksit_yaz on public.avans_taksitleri;
create policy avans_taksit_yaz on public.avans_taksitleri for all
  using ((select ik_yetkili())) with check ((select ik_yetkili()));

-- ── Ödeme işaretlenince taksit planını üret ──────────────────────────────
create or replace function public.avans_taksit_plani_uret()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ilk      date;
  v_birim    numeric(12,2);
  v_toplam   numeric(12,2) := 0;
  v_tutar    numeric(12,2);
  i          int;
begin
  -- Yalnız ödeme YENİ işaretlendiğinde çalış (tekrar kaydetmeler plan üretmesin)
  if new.odeme_tarihi is null or (tg_op = 'UPDATE' and old.odeme_tarihi is not null) then
    return new;
  end if;
  -- Elle plan girilmişse dokunma
  if exists (select 1 from avans_taksitleri where avans_id = new.id) then
    return new;
  end if;

  v_ilk := coalesce(
    date_trunc('month', new.ilk_kesinti_donemi)::date,
    (date_trunc('month', new.odeme_tarihi at time zone 'Europe/Istanbul') + interval '1 month')::date
  );
  new.ilk_kesinti_donemi := v_ilk;

  -- Kuruş artığı SON taksite biner: 10.000/3 → 3.333,33 + 3.333,33 + 3.333,34
  v_birim := round(new.tutar / new.taksit_sayisi, 2);
  for i in 1..new.taksit_sayisi loop
    if i = new.taksit_sayisi then
      v_tutar := new.tutar - v_toplam;
    else
      v_tutar := v_birim;
      v_toplam := v_toplam + v_birim;
    end if;
    insert into avans_taksitleri (avans_id, sira, donem, tutar)
    values (new.id, i, (v_ilk + ((i - 1) || ' month')::interval)::date, v_tutar);
  end loop;
  return new;
end $$;

drop trigger if exists tr_avans_taksit_plani on public.avans_talepleri;
create trigger tr_avans_taksit_plani
  before update on public.avans_talepleri
  for each row execute function public.avans_taksit_plani_uret();

-- ── Bildirimler ──────────────────────────────────────────────────────────
-- Bakım modülünde öğrenilen ders: bildirim yoksa kimse haberdar olmuyor.
-- bildirimler'e INSERT zaten tr_bildirim_push'u tetikler → telefona da gider.
create or replace function public.avans_bildir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ad     text;
  v_tutar  text;
  v_alici  bigint;
begin
  select ad into v_ad from kullanicilar where id = new.kullanici_id;
  v_tutar := trim(to_char(new.tutar, 'FM999G999G999D00')) || ' ₺';

  if tg_op = 'INSERT' then
    -- Yeni talep → İK yetkililerine
    for v_alici in
      select id from kullanicilar
      where moduller @> array['ik_yonetim'] and id <> new.kullanici_id
    loop
      insert into bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
      values (v_alici, new.kullanici_id, '💰 Yeni avans talebi',
              coalesce(v_ad, 'Personel') || ' · ' || v_tutar
                || ' · ' || new.taksit_sayisi || ' taksit',
              'bilgi', '/ik-yonetim');
    end loop;
    return new;
  end if;

  -- Karar → talep sahibine
  if new.durum is distinct from old.durum
     and new.durum in ('onaylandi', 'reddedildi') then
    insert into bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
    values (new.kullanici_id, new.onaylayan_id,
            case when new.durum = 'onaylandi' then '✅ Avans talebiniz onaylandı'
                 else '❌ Avans talebiniz reddedildi' end,
            v_tutar || ' · ' || new.taksit_sayisi || ' taksit'
              || coalesce(' — ' || nullif(new.karar_notu, ''), ''),
            'bilgi', '/izin-bordro');
  end if;

  -- Ödeme → talep sahibine
  if new.odeme_tarihi is not null and old.odeme_tarihi is null then
    insert into bildirimler (alici_id, gonderen_id, baslik, mesaj, tip, link)
    values (new.kullanici_id, new.odeyen_id, '💸 Avansınız ödendi',
            v_tutar || ' ödendi · ' || new.taksit_sayisi
              || ' taksitte maaştan kesilecek',
            'basari', '/izin-bordro');
  end if;
  return new;
exception when others then
  -- Bildirim üretimi avans kaydını ASLA bozamaz
  raise warning 'avans_bildir: %', sqlerrm;
  return new;
end $$;

drop trigger if exists tr_avans_bildir on public.avans_talepleri;
create trigger tr_avans_bildir
  after insert or update on public.avans_talepleri
  for each row execute function public.avans_bildir();

notify pgrst, 'reload schema';
