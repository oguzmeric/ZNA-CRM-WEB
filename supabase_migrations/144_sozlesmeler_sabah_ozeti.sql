-- 144: Sözleşmeler mini modülü + Yönetici Sabah Özeti cron'u.
-- 1. sozlesmeler: müşteri sözleşmeleri (bakım/kiralama/hizmet) — bitiş takibi
--    sabah özetine girer. Dosya eki mevcut private 'filo-belge' bucket'ına
--    'sozlesme/' klasörüyle yüklenir (yeni bucket gerekmez).
-- 2. pg_cron: sabah-ozeti edge fn her sabah 05:00 UTC (08:00 TR) —
--    Ali Uğur (id 1) + Oğuz (id 2) telefonlarına özet push'u.

-- ==================== 1. SÖZLEŞMELER ====================
create table if not exists sozlesmeler (
  id              bigserial primary key,
  musteri_id      bigint references musteriler(id) on delete set null,
  firma_adi       text,                 -- müşteri kaydı olmayan taraflar için serbest metin
  baslik          text not null,
  sozlesme_tipi   text not null default 'bakim'
    check (sozlesme_tipi in ('bakim', 'kiralama', 'hizmet', 'tedarik', 'diger')),
  baslangic_tarih date,
  bitis_tarih     date not null,        -- takip bu alandan çalışır
  tutar           numeric(14,2),
  otomatik_yenileme boolean default false,
  dosya_url       text,                 -- filo-belge bucket path (sozlesme/...)
  notlar          text,
  aktif           boolean not null default true,
  olusturan_id    bigint references kullanicilar(id) on delete set null,
  olusturma_tarih timestamptz not null default now()
);

create index if not exists sozlesmeler_bitis_idx on sozlesmeler (bitis_tarih) where aktif;
create index if not exists sozlesmeler_musteri_idx on sozlesmeler (musteri_id);

alter table sozlesmeler enable row level security;
alter table sozlesmeler force row level security;
revoke all on sozlesmeler from anon, public;
grant select, insert, update, delete on sozlesmeler to authenticated;
drop policy if exists sozlesmeler_staff_all on sozlesmeler;
create policy sozlesmeler_staff_all on sozlesmeler
  for all using (is_staff()) with check (is_staff());

grant usage, select on sequence sozlesmeler_id_seq to authenticated;

-- ==================== 2. PG_CRON ====================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'sabah-ozeti-cron') then
    perform cron.unschedule('sabah-ozeti-cron');
  end if;
end $$;

-- 05:00 UTC = 08:00 TR — hafta içi her sabah
select cron.schedule(
  'sabah-ozeti-cron',
  '0 5 * * 1-5',
  $cron$
    select net.http_post(
      url := 'https://hcrbwxeuscfibgmchdtt.supabase.co/functions/v1/sabah-ozeti',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', current_setting('app.esn_cron_secret', true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

notify pgrst, 'reload schema';
