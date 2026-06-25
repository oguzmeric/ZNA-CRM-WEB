-- Zeyna AI asistanı için konuşma ve mesaj tabloları.
--
-- Akış:
--   1. Kullanıcı sohbet açar → ai_konusmalar'a yeni satır eklenir
--   2. Mesaj yazar → ai_mesajlar'a 'user' rolüyle eklenir
--   3. Edge function 'zeyna' → Claude API'sini çağırır
--   4. Yanıt gelir → ai_mesajlar'a 'assistant' rolüyle eklenir
--   5. Yeni mesaj geldiğinde ai_konusmalar.son_mesaj_tarihi güncellenir
--
-- RLS: her kullanıcı sadece kendi konuşmalarını/mesajlarını görür.
-- Admin tipi yok — herkes kişisel kullanıyor.

-- ============================================================================
-- Konuşmalar
-- ============================================================================
create table if not exists ai_konusmalar (
  id              bigserial primary key,
  kullanici_id    bigint not null references kullanicilar(id) on delete cascade,
  baslik          text default 'Yeni Sohbet',
  olusturma_tarih timestamptz not null default now(),
  son_mesaj_tarihi timestamptz not null default now(),
  mesaj_sayisi    integer not null default 0,
  arsivlendi      boolean not null default false,
  meta            jsonb default '{}'::jsonb
);

create index if not exists idx_ai_konusmalar_kullanici
  on ai_konusmalar(kullanici_id, son_mesaj_tarihi desc)
  where not arsivlendi;

-- ============================================================================
-- Mesajlar
-- ============================================================================
create table if not exists ai_mesajlar (
  id              bigserial primary key,
  konusma_id      bigint not null references ai_konusmalar(id) on delete cascade,
  rol             text not null check (rol in ('user', 'assistant', 'tool', 'system')),
  icerik          text not null,
  tool_kullanildi text,   -- tool çağrısı yapıldıysa hangisi (örn 'getMusteriTalepleri')
  tool_input      jsonb,  -- tool input parametreleri
  tool_output     jsonb,  -- tool çıktısı
  token_input     integer default 0,
  token_output    integer default 0,
  olusturma_tarih timestamptz not null default now(),
  meta            jsonb default '{}'::jsonb
);

create index if not exists idx_ai_mesajlar_konusma
  on ai_mesajlar(konusma_id, olusturma_tarih);

-- ============================================================================
-- RLS
-- ============================================================================
alter table ai_konusmalar enable row level security;
alter table ai_mesajlar enable row level security;

-- Kullanıcı kendi konuşmalarını görür
drop policy if exists "ai_konusmalar_kullanici_select" on ai_konusmalar;
create policy "ai_konusmalar_kullanici_select" on ai_konusmalar
  for select using (
    kullanici_id = (select id from kullanicilar where auth_id = auth.uid())
  );

drop policy if exists "ai_konusmalar_kullanici_all" on ai_konusmalar;
create policy "ai_konusmalar_kullanici_all" on ai_konusmalar
  for all using (
    kullanici_id = (select id from kullanicilar where auth_id = auth.uid())
  ) with check (
    kullanici_id = (select id from kullanicilar where auth_id = auth.uid())
  );

-- Mesajlar: kullanıcı kendi konuşmasının mesajlarını görür
drop policy if exists "ai_mesajlar_kullanici_select" on ai_mesajlar;
create policy "ai_mesajlar_kullanici_select" on ai_mesajlar
  for select using (
    konusma_id in (
      select id from ai_konusmalar
       where kullanici_id = (select id from kullanicilar where auth_id = auth.uid())
    )
  );

-- Insert/update sadece service_role (edge function üzerinden)
-- (RLS default insert'i bloklayacak; service_role bypass eder)

-- ============================================================================
-- Konuşmaya mesaj eklendiğinde sayaçları güncelle
-- ============================================================================
create or replace function ai_konusma_guncelle_on_mesaj()
returns trigger
language plpgsql
as $$
begin
  update ai_konusmalar
     set son_mesaj_tarihi = new.olusturma_tarih,
         mesaj_sayisi = mesaj_sayisi + 1
   where id = new.konusma_id;
  return new;
end;
$$;

drop trigger if exists tr_ai_konusma_guncelle on ai_mesajlar;
create trigger tr_ai_konusma_guncelle
  after insert on ai_mesajlar
  for each row
  execute function ai_konusma_guncelle_on_mesaj();

notify pgrst, 'reload schema';
