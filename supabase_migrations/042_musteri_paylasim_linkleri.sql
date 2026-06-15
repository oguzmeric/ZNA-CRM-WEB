-- Musteri paylasim linkleri — teklif veya servis raporunu musteriye mail/SMS ile
-- gondermek icin token tabanli, sureli paylasim sistemi.
--
-- Akis:
--   1. Personel "Musteriye Gonder" butonuna basar (TeklifDetay veya ServisTalepDetay).
--   2. belge-paylas edge function: token uretir, bu tabloya kaydeder, secilen kanala
--      (mail / sms / her_ikisi) Resend ve/veya NetGSM ile gonderir.
--   3. Musteri linke tiklar: /p/:token -> token dogrula -> belge_tipi'ne gore
--      teklif veya servis raporu render edilir.
--   4. Her acilista acilma_sayisi++ ve son_acilma guncellenir.

create table if not exists musteri_paylasim_linkleri (
  id              bigserial primary key,
  token           text not null unique,                  -- ornek: 'p_aBc123XyZ...' (32 char)
  belge_tipi      text not null check (belge_tipi in ('teklif', 'servis_raporu')),
  belge_id        bigint not null,                       -- teklif.id veya servis_talepleri.id
  olusturan_id    bigint references kullanicilar(id) on delete set null,
  olusturma_tarih timestamptz not null default now(),
  son_kullanma    timestamptz not null default (now() + interval '30 days'),
  iptal_edildi    boolean not null default false,        -- personel manuel iptal edebilir

  -- Gonderim bilgileri
  gonderim_kanali text not null check (gonderim_kanali in ('mail', 'sms', 'her_ikisi')),
  gonderildigi_email text,
  gonderildigi_gsm   text,
  mail_durumu     text,                                  -- 'gonderildi' | 'hata: ...'
  sms_durumu      text,                                  -- 'gonderildi' | 'hata: ...'

  -- Acilis istatistigi
  ilk_acilma      timestamptz,
  son_acilma      timestamptz,
  acilma_sayisi   integer not null default 0,
  acilan_ip       text,                                  -- son acilan IP (audit)

  meta            jsonb default '{}'::jsonb
);

create index if not exists idx_paylasim_token        on musteri_paylasim_linkleri(token);
create index if not exists idx_paylasim_belge        on musteri_paylasim_linkleri(belge_tipi, belge_id);
create index if not exists idx_paylasim_olusturan    on musteri_paylasim_linkleri(olusturan_id);
create index if not exists idx_paylasim_son_kullanma on musteri_paylasim_linkleri(son_kullanma)
  where not iptal_edildi;

-- RLS: client direkt erisemez (token kor brute-force koruma + audit).
-- Personel listesi (kim ne gonderdi) edge function veya RPC ile gelir.
alter table musteri_paylasim_linkleri enable row level security;

-- Personel kendi olusturduklarini gorebilir (gelecekteki "Gonderim Gecmisi" UI'si icin)
drop policy if exists "paylasim_select_olusturan" on musteri_paylasim_linkleri;
create policy "paylasim_select_olusturan" on musteri_paylasim_linkleri
  for select using (
    olusturan_id = (
      select id from kullanicilar where auth_id = auth.uid()
    )
  );

-- Insert/update sadece service_role uzerinden (edge function)
-- (RLS varsayilan olarak insert/update'i bloklayacak)

-- Public token dogrulama icin SECURITY DEFINER RPC.
-- Anon client (auth.uid() = null) bunu cagirabilir, tokenle eslesen geceri bir
-- paylasim varsa belge bilgilerini ve acilma istatistigini guncelleyip donder.
create or replace function paylasim_link_dogrula(
  in_token text,
  in_ip text default null
)
returns table (
  belge_tipi text,
  belge_id   bigint,
  son_kullanma timestamptz,
  ilk_acilma timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_ilk timestamptz;
  v_belge_tipi text;
  v_belge_id bigint;
  v_son_kullanma timestamptz;
begin
  -- Geceri link bul
  select id, ilk_acilma, mp.belge_tipi, mp.belge_id, mp.son_kullanma
    into v_id, v_ilk, v_belge_tipi, v_belge_id, v_son_kullanma
    from musteri_paylasim_linkleri mp
   where mp.token = in_token
     and not mp.iptal_edildi
     and mp.son_kullanma > now()
   limit 1;

  if v_id is null then
    return;  -- Bos sonuc — frontend "gecersiz/expired" gosterir
  end if;

  -- Acilis istatistigi guncelle
  update musteri_paylasim_linkleri
     set acilma_sayisi = acilma_sayisi + 1,
         son_acilma = now(),
         ilk_acilma = coalesce(ilk_acilma, now()),
         acilan_ip = coalesce(in_ip, acilan_ip)
   where id = v_id;

  return query select v_belge_tipi, v_belge_id, v_son_kullanma, coalesce(v_ilk, now());
end;
$$;

grant execute on function paylasim_link_dogrula(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
