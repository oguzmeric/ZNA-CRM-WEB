-- 310 — Personel Sicil (özlük bilgileri).
--
-- AMAÇ: bir personele ait tüm İK bilgisini tek ekranda toplayan sicil kartının
-- veri temeli. Maaş/izin/avans/bordro/mesai/zimmet zaten kendi tablolarında;
-- eksik olan tek şey ÖZLÜK bilgisiydi (kimlik, işe giriş, adres, acil kişi...).
--
-- NEDEN kullanicilar TABLOSUNA EKLENMİYOR:
-- kullanicilar tablosunu 'kullanicilar_personel_select_personel' politikası
-- gereği ŞİRKETTEKİ TÜM PERSONEL okuyabiliyor ve Postgres RLS'inde kolon bazlı
-- koruma yok. TC kimlik / IBAN / SGK no oraya konsaydı herkes görürdü.
-- Ayrı tablo + tek RLS politikası = hassas veri üç kişiyle sınırlı.
--
-- ⚠️ İŞE GİRİŞ TARİHİ neden ayrı alan: kullanicilar.created_at HESAP AÇILIŞ
-- tarihidir, kıdem değil. Sistemdeki en eski hesap 16.04.2026; teknisyenlerin
-- çoğu Temmuz 2026'da açılmış. created_at üzerinden hakediş hesaplansa herkes
-- "1 yılını doldurmamış" çıkar ve tüm yıllık izin hakları 0 görünürdü.
--
-- YETKİ: ik_yetkili() — 'ik_yonetim' modülü olanlar: Ali Uğur Aktepe (1),
-- Oğuz Meriç (2), Abdullah İğde (44). Mig 309 ile maaş kapısı da aynı kümeye
-- çekildi; sicil kartına giren üç kişi karttaki her tabloyu görebilir, bu
-- yüzden kart içinde ikinci bir yetki ayrımı YOK.
--
-- TEKRARLANMAYAN ALANLAR: ad, unvan, email, cep_telefon, foto_url,
-- ehliyet_sinifi, ehliyet_bitis, imza zaten kullanicilar'da. Sicil kartı
-- bunları oradan okur — kopyalanırsa iki kaynak doğar ve senkron bozulur.

begin;

create table if not exists public.personel_sicil (
  kullanici_id bigint primary key
    references public.kullanicilar(id) on delete cascade,

  -- ── Kimlik ────────────────────────────────────────────────────────────
  tc_kimlik        text,
  dogum_tarihi     date,
  dogum_yeri       text,
  cinsiyet         text check (cinsiyet is null or cinsiyet in ('kadin','erkek')),
  medeni_durum     text check (medeni_durum is null or medeni_durum in ('bekar','evli','bosanmis','dul')),
  uyruk            text default 'T.C.',
  kan_grubu        text,
  baba_adi         text,
  ana_adi          text,

  -- ── İletişim ──────────────────────────────────────────────────────────
  adres               text,
  il                  text,
  ilce                text,
  ev_telefon          text,
  acil_kisi_ad        text,
  acil_kisi_yakinlik  text,
  acil_kisi_telefon   text,

  -- ── İstihdam ──────────────────────────────────────────────────────────
  ise_giris_tarihi    date,
  isten_cikis_tarihi  date,
  cikis_nedeni        text,
  departman           text,
  calisma_sekli       text check (calisma_sekli is null or calisma_sekli in ('tam_zamanli','yari_zamanli','sozlesmeli')),
  sozlesme_turu       text check (sozlesme_turu is null or sozlesme_turu in ('belirsiz_sureli','belirli_sureli')),
  calisma_yeri        text,
  yonetici_id         bigint references public.kullanicilar(id),

  -- ── SGK & resmi ───────────────────────────────────────────────────────
  sgk_sicil_no       text,
  sigorta_baslangic  date,
  meslek_kodu        text,
  engellilik_orani   integer check (engellilik_orani is null or engellilik_orani between 0 and 100),
  askerlik_durumu    text check (askerlik_durumu is null or askerlik_durumu in ('yapti','muaf','tecilli','yapmadi','ilgisiz')),

  -- ── Eğitim ────────────────────────────────────────────────────────────
  ogrenim_durumu   text,
  mezun_okul       text,
  bolum            text,
  mezuniyet_yili   integer check (mezuniyet_yili is null or mezuniyet_yili between 1950 and 2100),

  -- ── Aile (AGİ hesabı için) ────────────────────────────────────────────
  es_calisiyor     boolean,
  cocuk_sayisi     integer default 0 check (cocuk_sayisi is null or cocuk_sayisi >= 0),

  -- ── Banka ─────────────────────────────────────────────────────────────
  iban             text,
  banka_adi        text,

  -- ── Serbest not ───────────────────────────────────────────────────────
  notlar           text,

  -- ── Meta ──────────────────────────────────────────────────────────────
  guncelleyen_id     bigint references public.kullanicilar(id),
  guncelleme_tarih   timestamptz not null default now(),
  olusturma_tarih    timestamptz not null default now(),

  -- İşten çıkış, işe girişten önce olamaz
  constraint personel_sicil_tarih_sirasi
    check (isten_cikis_tarihi is null
           or ise_giris_tarihi is null
           or isten_cikis_tarihi >= ise_giris_tarihi)
);

-- Sicil listesinde "ayrılmış personel" filtresi bu kolona bakar
create index if not exists ix_personel_sicil_cikis
  on public.personel_sicil (isten_cikis_tarihi)
  where isten_cikis_tarihi is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────
-- (select ...) sarmalı ZORUNLU: sarmalsız çağrı her satır için yeniden
-- değerlendirilir (RLS initplan tuzağı, mig 227-228 dersi).
alter table public.personel_sicil enable row level security;

drop policy if exists personel_sicil_ik on public.personel_sicil;
create policy personel_sicil_ik on public.personel_sicil
  for all
  using ((select public.ik_yetkili()))
  with check ((select public.ik_yetkili()));

grant select, insert, update, delete on public.personel_sicil to authenticated;
revoke all on public.personel_sicil from anon;

-- ── guncelleme_tarih otomatik ───────────────────────────────────────────
create or replace function public.personel_sicil_guncelleme_tetikleyici()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.guncelleme_tarih := now();
  return new;
end;
$$;

drop trigger if exists tr_personel_sicil_guncelleme on public.personel_sicil;
create trigger tr_personel_sicil_guncelleme
  before update on public.personel_sicil
  for each row execute function public.personel_sicil_guncelleme_tetikleyici();

commit;

notify pgrst, 'reload schema';
