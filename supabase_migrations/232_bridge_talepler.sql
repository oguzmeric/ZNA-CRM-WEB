-- 232_bridge_talepler.sql
-- Başakşehir Belediyesi Bridge Task Operation API entegrasyonu — DB temeli.
-- Seçenek A: ayrı "Bridge Talepleri" menüsü + ayrı tablo (esnweb deseni).
--
-- KVKK: Bridge cevaplarında vatandaş adı/telefonu/e-posta/maskeli TC/doğum
-- tarihi (collocutor* alanları) gelir. Bu tabloya YALNIZ operasyonel alanlar
-- yazılır; kişisel alanlar HİÇ saklanmaz. RLS staff-only.
--
-- İki tablo:
--   bridge_talepler       — çekilen talepler (operasyonel alanlar + iç triyaj)
--   bridge_senkron_durum  — tek satır: sessionId + memberId + watermark
--                           (cron koşuları arası oturum kalıcılığı)

begin;

-- ---------------------------------------------------------------------------
-- 1) Talepler
-- ---------------------------------------------------------------------------
create table if not exists public.bridge_talepler (
  id                             bigint generated always as identity primary key,
  bridge_task_id                 bigint not null unique,      -- Bridge tarafı id
  task_serial_number             text,                        -- B2026...
  subject                        text,
  content                        text,
  content_is_html                boolean default false,
  task_type_id                   integer,
  task_type_description          text,
  task_status_id                 integer,
  task_status_description        text,
  closed_task_status_id          integer,
  closed_task_status_description text,
  department_description          text,
  task_source_channel_description text,
  priority_description           text,
  insert_datetime                timestamptz,   -- Bridge UTC (mapper +3 çevirir gösterirken)
  deadline                       timestamptz,
  completed_datetime             timestamptz,
  completed_percent              integer,
  comment_count                  integer,
  last_comment                   text,
  city                           text,
  town                           text,
  district                       text,
  task_address                   text,
  latitude                       double precision,
  longitude                      double precision,
  -- İç triyaj (CRM tarafı — Bridge'e yazılmaz):
  crm_durum                      text not null default 'yeni',  -- yeni | incelendi | gorev_acildi | kapandi
  crm_gorev_id                   bigint,        -- ileride açılan CRM görevine köprü (gevşek, FK yok)
  atanan_id                      bigint references public.kullanicilar(id) on delete set null,
  crm_not                        text,
  ilk_cekilme_tarih              timestamptz not null default now(),
  son_senkron_tarih              timestamptz not null default now()
);

comment on table public.bridge_talepler is
  'Başakşehir Bridge API taleplerinin operasyonel yansıması (KVKK: kişisel alanlar saklanmaz).';

create index if not exists idx_bridge_talepler_status
  on public.bridge_talepler (task_status_id);
create index if not exists idx_bridge_talepler_insert
  on public.bridge_talepler (insert_datetime desc);
create index if not exists idx_bridge_talepler_crm_durum
  on public.bridge_talepler (crm_durum);

-- ---------------------------------------------------------------------------
-- 2) Senkron durumu (tek satır) — oturum + watermark kalıcılığı
-- ---------------------------------------------------------------------------
create table if not exists public.bridge_senkron_durum (
  id                integer primary key default 1 check (id = 1),
  session_id        text,
  member_id         bigint,
  oturum_tarih      timestamptz,     -- oturum ne zaman açıldı (teşhis)
  son_watermark     timestamptz,     -- getTaskList beginDate için son başarı sınırı
  son_calisma_tarih timestamptz,     -- en son senkron denemesi
  son_sonuc         text,            -- kısa durum metni (teşhis)
  guncelleme_tarih  timestamptz not null default now()
);

insert into public.bridge_senkron_durum (id) values (1)
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) RLS — staff-only okuma; yazma yalnız service_role (RLS'i bypass eder)
-- ---------------------------------------------------------------------------
alter table public.bridge_talepler      enable row level security;
alter table public.bridge_senkron_durum enable row level security;

-- initplan dersi: is_staff() değil (select is_staff()) — policy per-row yeniden çalışmasın.
drop policy if exists bridge_talepler_staff_read on public.bridge_talepler;
create policy bridge_talepler_staff_read
  on public.bridge_talepler for select
  to authenticated
  using ((select public.is_staff()));

-- Staff iç triyaj alanlarını güncelleyebilir (atama/not/durum).
drop policy if exists bridge_talepler_staff_update on public.bridge_talepler;
create policy bridge_talepler_staff_update
  on public.bridge_talepler for update
  to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists bridge_senkron_durum_staff_read on public.bridge_senkron_durum;
create policy bridge_senkron_durum_staff_read
  on public.bridge_senkron_durum for select
  to authenticated
  using ((select public.is_staff()));

commit;
