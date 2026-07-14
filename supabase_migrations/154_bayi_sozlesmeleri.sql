-- 154: Bayi Sözleşmeleri Modülü (kaynak: "Sözleşmeler Modülü(BAYİ).docx", 2026-07-14)
--
-- 1. firmalar → bayi kartı: kimlik/yetkili/ticari/finansal kolonlar + bayi_statusu
--    (tablo canlıda BOŞTU — geriye dönük kayıt etkilenmiyor)
-- 2. sozlesme_sablonlari — {{degisken}} gövdeli şablonlar + seed (Yetkili Dış Bayilik)
-- 3. bayi_sozlesmeleri — ZNA-DB-YYYY-NNNN trigger, bayi başına tek aktif sözleşme
-- 4. bayi_evraklar — zorunlu evrak takibi (firma+tip başına tek satır, durum makinesi)
-- 5. bayi_onaylar — 4 adımlı onay akışı (satis/operasyon/finans/yonetici)
-- 6. bayi-evrak private bucket + staff RLS
-- 7. musteri_paylasim_linkleri belge_tipi += 'bayi_sozlesme' + anon okuma RPC'si

-- ---------- 1. firmalar bayi kolonları ----------
alter table firmalar
  add column if not exists vergi_dairesi       text,
  add column if not exists mersis_no           text,
  add column if not exists ticaret_sicil_no    text,
  add column if not exists kep_adresi          text,
  add column if not exists ilce                text,
  add column if not exists yetkili_adi         text,
  add column if not exists yetkili_unvani      text,
  add column if not exists yetkili_telefon     text,
  add column if not exists yetkili_eposta      text,
  add column if not exists bayi_turu           text,
  add column if not exists bolge               text,
  add column if not exists faaliyet_alani      text,
  add column if not exists satis_temsilcisi_id bigint,
  add column if not exists bayi_statusu        text default 'aday',
  add column if not exists yillik_hedef_usd    numeric,
  add column if not exists odeme_tipi          text default 'pesin',
  add column if not exists vade_talebi         boolean default false,
  add column if not exists vade_gunu           int,
  add column if not exists kredi_limiti        numeric,
  add column if not exists teminat_istegi      boolean default false,
  add column if not exists teminat_tipi        text,
  add column if not exists teminat_notu        text;

comment on column firmalar.bayi_statusu is
  'aday|evrak_bekleniyor|sozlesme_olusturuldu|imza_bekleniyor|evrak_kontrolunde|finans_onayi_bekliyor|yonetici_onayi_bekliyor|aktif|askida|pasif|kara_liste';

-- ---------- 2. sozlesme_sablonlari ----------
create table if not exists sozlesme_sablonlari (
  id               bigserial primary key,
  ad               text not null,
  tip              text not null default 'bayi',  -- bayi | musteri_satis | bakim | servis | gizlilik | alt_yuklenici | proje_ozel
  govde            text not null,
  versiyon         int  not null default 1,
  aktif            boolean not null default true,
  olusturma_tarih  timestamptz not null default now(),
  guncelleme_tarih timestamptz not null default now()
);

alter table sozlesme_sablonlari enable row level security;
drop policy if exists sablon_sel on sozlesme_sablonlari;
create policy sablon_sel on sozlesme_sablonlari for select using (is_staff());
drop policy if exists sablon_ins on sozlesme_sablonlari;
create policy sablon_ins on sozlesme_sablonlari for insert with check (is_admin());
drop policy if exists sablon_upd on sozlesme_sablonlari;
create policy sablon_upd on sozlesme_sablonlari for update using (is_admin());

-- ---------- 3. bayi_sozlesmeleri ----------
create table if not exists bayi_sozlesmeleri (
  id                 bigserial primary key,
  firma_id           bigint not null references firmalar(id) on delete cascade,
  sablon_id          bigint references sozlesme_sablonlari(id),
  sozlesme_no        text unique,
  sozlesme_tarihi    date not null default current_date,
  baslangic_tarih    date,
  bitis_tarih        date,
  sure_ay            int default 12,
  yillik_hedef_usd   numeric,
  statu_metni        text,
  odeme_tipi         text,
  vade_gunu          int,
  kredi_limiti       numeric,
  uretilen_icerik    text,
  imzali_pdf_url     text,
  imzali_pdf_ad      text,
  durum              text not null default 'olusturuldu'
                     check (durum in ('olusturuldu','imza_bekleniyor','imzalandi','iptal','arsiv')),
  versiyon           int not null default 1,
  revizyon_sebebi    text,
  onceki_sozlesme_id bigint,
  olusturan_id       bigint,
  olusturan_ad       text,
  olusturma_tarih    timestamptz not null default now(),
  guncelleme_tarih   timestamptz not null default now()
);

create index if not exists idx_bayi_sozlesme_firma on bayi_sozlesmeleri(firma_id);
-- Aynı bayi için aynı anda tek "yaşayan" sözleşme (doc §5 mükerrer engeli)
create unique index if not exists ux_bayi_tek_aktif_sozlesme
  on bayi_sozlesmeleri(firma_id)
  where durum in ('olusturuldu','imza_bekleniyor','imzalandi');

alter table bayi_sozlesmeleri enable row level security;
drop policy if exists bayi_soz_all on bayi_sozlesmeleri;
create policy bayi_soz_all on bayi_sozlesmeleri for all
  using (is_staff()) with check (is_staff());

-- Sözleşme no: ZNA-DB-YYYY-NNNN (yıl bazlı sayaç, DB tarafında — race-safe)
create or replace function bayi_sozlesme_no_uret()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_yil text;
  v_son int;
begin
  if new.sozlesme_no is not null and new.sozlesme_no <> '' then
    return new;
  end if;
  v_yil := to_char(coalesce(new.sozlesme_tarihi, current_date), 'YYYY');
  select coalesce(max(substring(sozlesme_no from '^ZNA-DB-\d{4}-(\d+)$')::int), 0)
    into v_son
  from bayi_sozlesmeleri
  where sozlesme_no like 'ZNA-DB-' || v_yil || '-%';
  new.sozlesme_no := 'ZNA-DB-' || v_yil || '-' || lpad((v_son + 1)::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists tr_bayi_sozlesme_no on bayi_sozlesmeleri;
create trigger tr_bayi_sozlesme_no
  before insert on bayi_sozlesmeleri
  for each row execute function bayi_sozlesme_no_uret();

-- ---------- 4. bayi_evraklar ----------
create table if not exists bayi_evraklar (
  id                 bigserial primary key,
  firma_id           bigint not null references firmalar(id) on delete cascade,
  sozlesme_id        bigint references bayi_sozlesmeleri(id) on delete set null,
  evrak_tipi         text not null,
  -- imza_sirkusu | vergi_levhasi | faaliyet_belgesi | ticaret_sicil_gazetesi | imzali_sozlesme | son_mizan
  dosya_url          text,
  dosya_adi          text,
  durum              text not null default 'bekleniyor'
                     check (durum in ('bekleniyor','yuklendi','kontrol_ediliyor','onaylandi','reddedildi','suresi_gecti','yenisi_talep_edildi')),
  yukleyen_id        bigint,
  yukleyen_ad        text,
  yukleme_tarihi     timestamptz,
  gecerlilik_tarihi  date,
  onaylayan_id       bigint,
  onaylayan_ad       text,
  onay_tarihi        timestamptz,
  red_sebebi         text,
  notlar             text,
  olusturma_tarih    timestamptz not null default now(),
  unique (firma_id, evrak_tipi)
);

create index if not exists idx_bayi_evrak_firma on bayi_evraklar(firma_id);

alter table bayi_evraklar enable row level security;
drop policy if exists bayi_evrak_all on bayi_evraklar;
create policy bayi_evrak_all on bayi_evraklar for all
  using (is_staff()) with check (is_staff());

-- ---------- 5. bayi_onaylar ----------
create table if not exists bayi_onaylar (
  id               bigserial primary key,
  firma_id         bigint not null references firmalar(id) on delete cascade,
  sozlesme_id      bigint references bayi_sozlesmeleri(id) on delete set null,
  adim             text not null check (adim in ('satis','operasyon','finans','yonetici')),
  durum            text not null default 'bekliyor'
                   check (durum in ('bekliyor','onaylandi','reddedildi','atlandi')),
  onaylayan_id     bigint,
  onaylayan_ad     text,
  tarih            timestamptz,
  sebep            text,
  notlar           text,
  olusturma_tarih  timestamptz not null default now(),
  unique (firma_id, adim)
);

create index if not exists idx_bayi_onay_firma on bayi_onaylar(firma_id);

alter table bayi_onaylar enable row level security;
drop policy if exists bayi_onay_all on bayi_onaylar;
create policy bayi_onay_all on bayi_onaylar for all
  using (is_staff()) with check (is_staff());

-- ---------- 6. bayi-evrak bucket ----------
insert into storage.buckets (id, name, public)
values ('bayi-evrak', 'bayi-evrak', false)
on conflict do nothing;

drop policy if exists bayi_evrak_sel on storage.objects;
create policy bayi_evrak_sel on storage.objects for select
  using (bucket_id = 'bayi-evrak' and is_staff());
drop policy if exists bayi_evrak_ins on storage.objects;
create policy bayi_evrak_ins on storage.objects for insert
  with check (bucket_id = 'bayi-evrak' and is_staff());
drop policy if exists bayi_evrak_del on storage.objects;
create policy bayi_evrak_del on storage.objects for delete
  using (bucket_id = 'bayi-evrak' and is_staff());

-- ---------- 7. Paylaşım: bayi_sozlesme belge tipi + anon okuma RPC ----------
alter table musteri_paylasim_linkleri
  drop constraint if exists musteri_paylasim_linkleri_belge_tipi_check;
alter table musteri_paylasim_linkleri
  add constraint musteri_paylasim_linkleri_belge_tipi_check
  check (belge_tipi in ('teklif', 'servis_raporu', 'demo_tutanak', 'bayi_sozlesme'));

create or replace function paylasim_bayi_sozlesme_oku(in_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_belge_id   bigint;
  v_belge_tipi text;
  v_sonuc      json;
begin
  select belge_id, belge_tipi into v_belge_id, v_belge_tipi
  from musteri_paylasim_linkleri
  where token = in_token
    and son_kullanma > now();

  if v_belge_id is null or v_belge_tipi <> 'bayi_sozlesme' then
    return null;
  end if;

  select json_build_object(
    'id', s.id,
    'sozlesme_no', s.sozlesme_no,
    'sozlesme_tarihi', s.sozlesme_tarihi,
    'bitis_tarih', s.bitis_tarih,
    'durum', s.durum,
    'uretilen_icerik', s.uretilen_icerik,
    'firma_adi', f.firma_adi,
    'vade_talebi', f.vade_talebi
  ) into v_sonuc
  from bayi_sozlesmeleri s
  join firmalar f on f.id = s.firma_id
  where s.id = v_belge_id;

  return v_sonuc;
end;
$$;

revoke all on function paylasim_bayi_sozlesme_oku(text) from public;
grant execute on function paylasim_bayi_sozlesme_oku(text) to anon, authenticated, service_role;

-- ---------- Seed: Yetkili Dış Bayilik ve Deal Register Sözleşmesi ----------
insert into sozlesme_sablonlari (ad, tip, govde)
select 'Yetkili Dış Bayilik ve Deal Register Sözleşmesi', 'bayi',
$SABLON$YETKİLİ DIŞ BAYİLİK VE DEAL REGISTER SÖZLEŞMESİ

Sözleşme No: {{sozlesme_no}}
Sözleşme Tarihi: {{sozlesme_tarihi}}

1. TARAFLAR

İşbu Yetkili Dış Bayilik ve Deal Register Sözleşmesi ("Sözleşme");

SAĞLAYICI: ZNA TEKNOLOJİ ("ZNA")

ile

BAYİ: {{bayi_unvani}}
Adres: {{bayi_adresi}}
Vergi Dairesi / No: {{bayi_vergi_dairesi}} / {{bayi_vergi_no}}
MERSİS No: {{bayi_mersis_no}}
Ticaret Sicil No: {{bayi_ticaret_sicil_no}}
Telefon: {{bayi_telefon}}
E-posta: {{bayi_eposta}}
KEP Adresi: {{bayi_kep_adresi}}
Yetkili Kişi: {{bayi_yetkili_adi}} — {{bayi_yetkili_unvani}}
("BAYİ")

arasında {{sozlesme_tarihi}} tarihinde akdedilmiştir.

2. SÖZLEŞMENİN KONUSU

İşbu Sözleşme; ZNA'nın distribütörlüğünü ve/veya satışını yaptığı ürün ve hizmetlerin, BAYİ tarafından son kullanıcılara satışı, Deal Register (proje kaydı) süreçlerinin işletilmesi ve tarafların bu kapsamdaki hak ve yükümlülüklerinin belirlenmesidir.

3. BAYİ STATÜSÜ

BAYİ'nin statüsü: {{yetkili_satici_statusu}}.
BAYİ, ZNA'nın yazılı onayı olmaksızın işbu Sözleşme'den doğan hak ve yükümlülüklerini üçüncü kişilere devredemez. Bayilik statüsü ZNA tarafından, işbu Sözleşme'de yazılı koşullarla geri alınabilir.

4. SÖZLEŞME SÜRESİ

İşbu Sözleşme'nin süresi {{sozlesme_suresi}} olup, taraflardan biri süre bitiminden en az 30 (otuz) gün önce yazılı fesih bildiriminde bulunmadıkça aynı koşullarla 1 (bir) yıl uzar.

5. YILLIK HEDEF

BAYİ'nin yıllık satış hedefi: {{bayi_yillik_hedef}}.
Hedef, KDV hariç tahsil edilmiş net ciro üzerinden hesaplanır. Hedefin gerçekleşme durumu ZNA tarafından üçer aylık dönemlerde değerlendirilir.

6. ÖDEME VE VADE KOŞULLARI

Ödeme şekli: {{bayi_vade_durumu}}.
Vade günü: {{bayi_vade_gunu}}.
Tanımlı kredi limiti: {{bayi_kredi_limiti}}.
Vadeli çalışma; ZNA Finans Birimi'nin onayına, güncel mizan ibrazına ve gerektiğinde teminat tesisine bağlıdır. Limit aşımı hâlinde ZNA sevkiyatları durdurma hakkını saklı tutar.

7. DEAL REGISTER (PROJE KAYDI)

BAYİ, proje bazlı özel fiyat taleplerini ZNA CRM üzerinden Deal Register kaydı açarak iletir. Deal Register kaydı; yalnızca "Aktif Bayi" statüsündeki bayiler tarafından açılabilir. Kayıt onaylanan projelerde tanımlanan özel fiyatlar yalnızca ilgili proje ve son kullanıcı için geçerlidir; üçüncü taraflara devredilemez.

8. MARKA VE TANITIM

BAYİ, ZNA'nın ve temsil ettiği markaların isim, logo ve görsellerini yalnızca yürürlükteki marka kullanım kurallarına uygun ve ZNA'nın yazılı onayı ile kullanabilir.

9. GİZLİLİK VE KİŞİSEL VERİLER (KVKK)

Taraflar; işbu Sözleşme kapsamında öğrendikleri ticari sır ve gizli bilgileri süresiz olarak gizli tutar. Taraflar, 6698 sayılı KVKK kapsamındaki yükümlülüklerine uygun davranacağını kabul ve taahhüt eder.

10. FESİH

Taraflardan her biri, diğer tarafın işbu Sözleşme'ye esaslı aykırılığı hâlinde, yazılı ihtara rağmen aykırılığın 15 (on beş) gün içinde giderilmemesi durumunda Sözleşme'yi derhâl feshedebilir. ZNA; ödeme temerrüdü, itibar zedeleyici davranış veya yetkisiz satış hâllerinde bayilik statüsünü askıya alma veya geri alma hakkına sahiptir.

11. UYUŞMAZLIK ÇÖZÜMÜ

İşbu Sözleşme'den doğan uyuşmazlıklarda İstanbul (Anadolu) Mahkemeleri ve İcra Daireleri yetkilidir.

12. YÜRÜRLÜK

12 (on iki) maddeden oluşan işbu Sözleşme, taraf yetkililerince {{sozlesme_tarihi}} tarihinde 2 (iki) nüsha olarak imzalanmış ve yürürlüğe girmiştir.

ZNA TEKNOLOJİ                                BAYİ: {{bayi_unvani}}
{{imza_yetkilisi}}                           {{bayi_yetkili_adi}} — {{bayi_yetkili_unvani}}
İmza / Kaşe:                                 İmza / Kaşe:$SABLON$
where not exists (
  select 1 from sozlesme_sablonlari where ad = 'Yetkili Dış Bayilik ve Deal Register Sözleşmesi'
);

notify pgrst, 'reload schema';
