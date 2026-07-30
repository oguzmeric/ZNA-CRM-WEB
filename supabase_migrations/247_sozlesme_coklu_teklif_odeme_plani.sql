-- 247: Satış sözleşmesinde (1) BİRDEN FAZLA TEKLİF, (2) PARÇALI ÖDEME PLANI.
--
-- (1) Gerçek ihtiyaç: bir binanın yangın + kamera + kartlı geçiş + ses sistemi
--     ayrı ayrı tekliflendiriliyor ama TEK proje / TEK sözleşme oluyor. Şimdiye
--     kadar satis_sozlesmeleri.teklif_id tek teklif tutuyordu.
--     Ara tablo satis_sozlesme_teklifleri EKLENDİ ve tek doğru kaynak oldu.
--     teklif_id / teklif_no ana kolonları trigger'la SENKRON tutuluyor:
--       teklif_id = ilk sıradaki teklif  (mig 186 unique index + eski kod çalışsın)
--       teklif_no = "TEK-1, TEK-2, TEK-3" (liste ve çıktı bunu okuyor)
--     Böylece eski akışın hiçbir yeri değişmeden yeni akış üstüne biniyor.
--
-- (2) odeme_plani jsonb: [{sira,tip,yuzde,tutar,vadeGunu,vadeTarihi,banka,belgeNo,aciklama}]
--     "%30 nakit ön ödeme + 60 gün çek + 90 gün çek" gibi anlaşmalar tek satırlık
--     "ödeme tipi" alanına sığmıyordu.

-- ---------- (2) Ödeme planı ----------
alter table public.satis_sozlesmeleri
  add column if not exists odeme_plani jsonb not null default '[]'::jsonb;

-- ---------- (1) Çoklu teklif ara tablosu ----------
create table if not exists public.satis_sozlesme_teklifleri (
  id              bigserial primary key,
  sozlesme_id     bigint not null references public.satis_sozlesmeleri(id) on delete cascade,
  teklif_id       bigint not null,
  teklif_no       text,
  firma_adi       text,
  konu            text,
  -- Tutar ve ürün listesi ANLIK KOPYADIR: sözleşme imzalandıktan sonra teklif
  -- değişse bile sözleşme eki değişmemeli (satis_sozlesmeleri.urun_listesi ile aynı mantık).
  tutar           numeric(18,2) default 0,
  urun_listesi    jsonb default '[]'::jsonb,
  sira            integer default 0,
  olusturma_tarih timestamptz default now(),
  constraint uq_ss_teklif unique (sozlesme_id, teklif_id)
);

create index if not exists idx_ss_teklif_sozlesme on public.satis_sozlesme_teklifleri(sozlesme_id);
create index if not exists idx_ss_teklif_teklif   on public.satis_sozlesme_teklifleri(teklif_id);

alter table public.satis_sozlesme_teklifleri enable row level security;
-- (select is_staff()) — initplan: policy satır başına değil sorgu başına çalışsın
drop policy if exists ss_teklif_all on public.satis_sozlesme_teklifleri;
create policy ss_teklif_all on public.satis_sozlesme_teklifleri for all
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ---------- Mevcut kayıtların backfill'i (trigger'lardan ÖNCE) ----------
insert into public.satis_sozlesme_teklifleri (sozlesme_id, teklif_id, teklif_no, firma_adi, konu, tutar, urun_listesi, sira)
select s.id, s.teklif_id, s.teklif_no, s.firma_adi, s.isin_konusu,
       coalesce(s.ana_toplam, 0), coalesce(s.urun_listesi, '[]'::jsonb), 0
  from public.satis_sozlesmeleri s
 where s.teklif_id is not null
on conflict (sozlesme_id, teklif_id) do nothing;

-- ---------- Tekillik: aynı teklif iki AKTİF sözleşmede olamaz (mig 186 kuralının devamı) ----------
create or replace function public.ss_teklif_tekil_kontrol()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_baska text;
begin
  -- (a) Ana kolonda başka bir aktif sözleşmeye bağlı mı?
  select s.sozlesme_no into v_baska
    from satis_sozlesmeleri s
   where s.teklif_id = new.teklif_id
     and s.durum <> 'iptal'
     and s.id <> new.sozlesme_id
   limit 1;

  -- (b) Ara tabloda başka bir aktif sözleşmede mi?
  if v_baska is null then
    select s.sozlesme_no into v_baska
      from satis_sozlesme_teklifleri t
      join satis_sozlesmeleri s on s.id = t.sozlesme_id
     where t.teklif_id = new.teklif_id
       and t.sozlesme_id <> new.sozlesme_id
       and s.durum <> 'iptal'
     limit 1;
  end if;

  if v_baska is not null then
    raise exception 'Bu teklif zaten % numarali sozlesmeye bagli. Ayni teklif iki sozlesmede kullanilamaz.', v_baska;
  end if;
  return new;
end
$$;

drop trigger if exists tr_ss_teklif_tekil on public.satis_sozlesme_teklifleri;
create trigger tr_ss_teklif_tekil
  before insert or update of teklif_id on public.satis_sozlesme_teklifleri
  for each row execute function public.ss_teklif_tekil_kontrol();

-- ---------- Senkron: ana kolonlar ara tablodan türetilir ----------
create or replace function public.ss_teklif_senkron()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_soz_id bigint := coalesce(new.sozlesme_id, old.sozlesme_id);
  v_ilk_id bigint;
  v_nolar  text;
begin
  select t.teklif_id into v_ilk_id
    from satis_sozlesme_teklifleri t
   where t.sozlesme_id = v_soz_id
   order by t.sira, t.id
   limit 1;

  select string_agg(t.teklif_no, ', ' order by t.sira, t.id) into v_nolar
    from satis_sozlesme_teklifleri t
   where t.sozlesme_id = v_soz_id
     and coalesce(t.teklif_no, '') <> '';

  if v_ilk_id is null then
    -- Tüm teklifler kaldırıldı. teklif_no'ya DOKUNMUYORUZ: bağımsız sözleşmede
    -- kullanıcı elle numara yazabiliyor, onu silmek veri kaybı olur.
    update satis_sozlesmeleri set teklif_id = null where id = v_soz_id;
  else
    update satis_sozlesmeleri
       set teklif_id = v_ilk_id,
           teklif_no = coalesce(v_nolar, teklif_no)
     where id = v_soz_id;
  end if;
  return null;
end
$$;

drop trigger if exists tr_ss_teklif_senkron on public.satis_sozlesme_teklifleri;
create trigger tr_ss_teklif_senkron
  after insert or delete or update of teklif_id, teklif_no, sira on public.satis_sozlesme_teklifleri
  for each row execute function public.ss_teklif_senkron();

notify pgrst, 'reload schema';
