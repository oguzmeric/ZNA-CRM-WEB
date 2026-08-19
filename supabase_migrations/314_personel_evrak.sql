-- 314 — Personel özlük evrak arşivi
--
-- İhtiyaç: "Personelden talep ettiğim evrakların PDF halini yükleyeceğim bir
-- yer" — kimlik fotokopisi, diploma, adli sicil, sağlık raporu, ikametgah,
-- SGK işe giriş bildirgesi... İK'nın topladığı işveren kayıtları.
--
-- ⚠️ NEDEN `kisi_dokumanlari` KULLANILMADI: o tablo kişinin KENDİ dosya dolabı
-- (görünürlük: sadece_ben / herkes / secili, kişi kendi yükler kendi yönetir).
-- Özlük evrakı ise kişinin kendi dosyası değil, İK'nın tuttuğu kayıttır;
-- personelin silme/gizleme yetkisi OLMAMALI. İkisini aynı tabloda toplamak
-- görünürlük modelini karıştırırdı.
--
-- YETKİ: personel_sicil ile AYNI kapı — ik_yetkili() ('ik_yonetim' modülü:
-- Ali 1, Oğuz 2, Abdullah 44). Salt admin olmak yetmez; özlük dosyası
-- kadro dışına açılmamalı. Personelin kendisi de göremez.

create table if not exists public.personel_evraklari (
  id                 uuid primary key default gen_random_uuid(),
  kullanici_id       bigint not null references public.kullanicilar(id) on delete cascade,
  tur                text   not null,
  baslik             text,
  dosya_yolu         text   not null,
  dosya_ad           text,
  dosya_boyut        bigint,
  dosya_tip          text,
  -- Sağlık raporu, ehliyet, sertifika gibi SÜRELİ evraklar için. Boş bırakılabilir.
  gecerlilik_tarihi  date,
  aciklama           text,
  yukleyen_id        bigint references public.kullanicilar(id),
  olusturma_tarih    timestamptz not null default now()
);

-- `tur` üzerinde CHECK constraint BİLEREK YOK: mig 312'de kategori check'i
-- yeni bir değer eklenince 23514 ile patlamıştı. Geçerli türler UI'da sabit
-- listede duruyor; yeni tür eklemek migration gerektirmesin.
comment on column public.personel_evraklari.tur is
  'kimlik | diploma | adli_sicil | saglik_raporu | ikametgah | sgk_giris | '
  'vesikalik | askerlik | ehliyet | sozlesme | diger — liste UI tarafında.';

create index if not exists ix_personel_evrak_kullanici
  on public.personel_evraklari (kullanici_id, olusturma_tarih desc);

alter table public.personel_evraklari enable row level security;

-- (select ik_yetkili()) sarmalı ZORUNLU — initplan tuzağı: sarmalsız yazılırsa
-- fonksiyon satır başına yeniden çalışır (bkz. reference_rls_initplan_performans).
drop policy if exists personel_evrak_ik on public.personel_evraklari;
create policy personel_evrak_ik on public.personel_evraklari
  for all to authenticated
  using ((select public.ik_yetkili()))
  with check ((select public.ik_yetkili()));

-- ── Bucket ───────────────────────────────────────────────────────────────
-- Private: içinde kimlik, adli sicil, sağlık raporu var. 20 MB — çok sayfalı
-- renkli tarama sığsın. HEIC yok (web tarayıcıları açamıyor).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'personel-evrak', 'personel-evrak', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Belge ile satır AYNI kapıdan geçsin: satırı göremeyen dosyayı indirememeli.
drop policy if exists personel_evrak_sel on storage.objects;
create policy personel_evrak_sel on storage.objects
  for select to authenticated
  using (bucket_id = 'personel-evrak' and (select public.ik_yetkili()));

drop policy if exists personel_evrak_ins on storage.objects;
create policy personel_evrak_ins on storage.objects
  for insert to authenticated
  with check (bucket_id = 'personel-evrak' and (select public.ik_yetkili()));

drop policy if exists personel_evrak_upd on storage.objects;
create policy personel_evrak_upd on storage.objects
  for update to authenticated
  using (bucket_id = 'personel-evrak' and (select public.ik_yetkili()))
  with check (bucket_id = 'personel-evrak' and (select public.ik_yetkili()));

drop policy if exists personel_evrak_del on storage.objects;
create policy personel_evrak_del on storage.objects
  for delete to authenticated
  using (bucket_id = 'personel-evrak' and (select public.ik_yetkili()));
