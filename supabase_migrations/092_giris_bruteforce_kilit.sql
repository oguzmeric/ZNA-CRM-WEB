-- ═══════════════════════════════════════════════════════════════
-- Brute-force korumsı: 15 dk'da 5 başarısız deneme → 15 dk kilit
-- ═══════════════════════════════════════════════════════════════

create table if not exists giris_denemeleri (
  id bigserial primary key,
  email text not null,
  ip text,
  basarili boolean not null default false,
  olusma timestamptz not null default now()
);

create index if not exists giris_denemeleri_email_zaman_idx
  on giris_denemeleri (email, olusma desc);
create index if not exists giris_denemeleri_ip_zaman_idx
  on giris_denemeleri (ip, olusma desc);

-- Sıkı RLS: sadece service role okuyup yazsın
alter table giris_denemeleri enable row level security;
alter table giris_denemeleri force row level security;
revoke all on giris_denemeleri from anon, public, authenticated;

-- Sadece admin okuyabilir (kendi güvenlik dashboard'ı için ileride)
create policy "giris_denemeleri_admin_read" on giris_denemeleri
  for select using (is_admin());

-- ─── RPC: Kilit süresini döndür ────────────────────────────────
-- Son 15 dk'da 5+ başarısız deneme varsa, kilit süresini saniye olarak döndür
create or replace function giris_kilit_saniye(p_email text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  hata_sayisi int;
  en_eski_hata timestamptz;
  kilit_bitis timestamptz;
  kalan int;
begin
  if p_email is null or trim(p_email) = '' then return 0; end if;

  select count(*), min(olusma)
    into hata_sayisi, en_eski_hata
    from giris_denemeleri
    where email = lower(trim(p_email))
      and basarili = false
      and olusma > now() - interval '15 minutes';

  if hata_sayisi < 5 then return 0; end if;

  kilit_bitis := en_eski_hata + interval '15 minutes';
  kalan := extract(epoch from (kilit_bitis - now()))::int;
  if kalan < 0 then return 0; end if;
  return kalan;
end $$;

grant execute on function giris_kilit_saniye(text) to anon, authenticated;

-- ─── RPC: Deneme kaydet ────────────────────────────────────────
create or replace function giris_denemesi_kaydet(p_email text, p_basarili boolean, p_ip text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or trim(p_email) = '' then return; end if;
  insert into giris_denemeleri (email, basarili, ip)
  values (lower(trim(p_email)), coalesce(p_basarili, false), p_ip);
  -- Başarılı ise: geçmiş başarısızları temizle (kilit sıfırlansın)
  if p_basarili then
    delete from giris_denemeleri
      where email = lower(trim(p_email))
        and basarili = false;
  end if;
  -- Temizlik: 24 saatten eski kayıtları sil (tablo şişmesin)
  delete from giris_denemeleri where olusma < now() - interval '24 hours';
end $$;

grant execute on function giris_denemesi_kaydet(text, boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';
