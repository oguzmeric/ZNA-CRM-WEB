-- 264 — Kullanıcı Sözleşmesi: metin + zorunlu onay altyapısı (04.08)
--
-- KARARLAR (kullanıcı onayı):
--   • Onay ZORUNLU — onaylamayan personel hiçbir veriye erişemez
--   • Kapsam: ZNA personeli (müşteri portalı / bayi ŞİMDİLİK kapsam dışı;
--     onlara farklı bir metin gerekir — çalışan izleme maddeleri geçersiz)
--
-- ⭐ NEDEN ÖNEMLİ: Sistemde FİİLEN çalışan iki mekanizmanın hukuki dayanağı
-- bu metindir:
--   1) Veri erişim izleme + anormal çekimde hesap askıya alma (mig 259/260)
--   2) Çalışan konum takibi — mesai GPS, araç rota geçmişi (mig 261/262),
--      araç içi kamera
-- Bunlar sözleşmede AÇIKÇA beyan edilmezse hem yaptırım zemini zayıf kalır
-- hem KVKK açısından "açık rıza / aydınlatma" eksikliği doğar.
--
-- ⚠️ METİN HUKUKÇU İNCELEMESİNDEN GEÇMELİDİR. Buradaki metin, sistemin
-- gerçekte ne yaptığını doğru anlatan bir TASLAKTIR; iş hukuku ve KVKK
-- boyutunun avukat tarafından teyidi gerekir.
--
-- Metin neden DB'de? Web ve mobil TEK kaynaktan okusun. Dosyada tutulsaydı
-- iki projede iki kopya olur, biri güncellenip diğeri unutulurdu.

begin;

-- ── 1) Sözleşme metinleri (versiyonlu) ─────────────────────────────────
create table if not exists public.sozlesme_metinleri (
  id                bigserial primary key,
  versiyon          text not null unique,       -- '1.0', '1.1' …
  baslik            text not null,
  icerik            text not null,              -- markdown
  yururluk_tarihi   date not null,
  aktif             boolean not null default false,
  olusturma_tarih   timestamptz not null default now()
);

comment on table public.sozlesme_metinleri is
  'Kullanıcı sözleşmesi metinleri. Aynı anda yalnız BİR versiyon aktif olabilir; yeni versiyon aktifleşince herkes yeniden onaylar.';

-- Aynı anda tek aktif metin
create unique index if not exists ux_sozlesme_tek_aktif
  on public.sozlesme_metinleri (aktif) where aktif;

-- ── 2) Onay kayıtları ──────────────────────────────────────────────────
create table if not exists public.sozlesme_onaylari (
  id            bigserial primary key,
  kullanici_id  bigint not null references public.kullanicilar(id) on delete cascade,
  sozlesme_id   bigint not null references public.sozlesme_metinleri(id) on delete restrict,
  versiyon      text not null,
  onay_tarihi   timestamptz not null default now(),
  kaynak        text,        -- 'web' | 'mobil'
  cihaz         text,        -- user-agent / cihaz modeli
  unique (kullanici_id, sozlesme_id)
);

comment on table public.sozlesme_onaylari is
  'Kim, hangi sözleşme versiyonunu, ne zaman onayladı. İhtilafta kanıt kaydıdır — SİLİNMEZ.';

create index if not exists ix_sozlesme_onay_kullanici
  on public.sozlesme_onaylari (kullanici_id, onay_tarihi desc);

-- ── 3) RLS ─────────────────────────────────────────────────────────────
alter table public.sozlesme_metinleri enable row level security;
alter table public.sozlesme_onaylari  enable row level security;

-- Aktif metni HERKES okur (giriş yapmamış ziyaretçi dahil): sözleşme
-- login sayfasından tıklanabilir olacak.
drop policy if exists sozlesme_metin_oku on public.sozlesme_metinleri;
create policy sozlesme_metin_oku on public.sozlesme_metinleri
  for select to anon, authenticated using (aktif = true);

-- Kullanıcı kendi onaylarını görür; yönetim hepsini görür (takip için)
drop policy if exists sozlesme_onay_oku on public.sozlesme_onaylari;
create policy sozlesme_onay_oku on public.sozlesme_onaylari
  for select to authenticated using (
    kullanici_id = (select id from public.kullanicilar where auth_id = (select auth.uid()))
    or exists (
      select 1 from public.kullanicilar k
      where k.auth_id = (select auth.uid()) and k.rol = 'admin'
    )
  );

-- Yazma YALNIZ RPC üzerinden (aşağıda). Doğrudan insert policy'si YOK:
-- kullanıcı başkası adına onay kaydı üretemesin.

-- ── 4) Onaylama RPC'si ─────────────────────────────────────────────────
-- Kullanıcıyı oturumdan kendisi bulur — istemciden kullanici_id ALINMAZ.
create or replace function public.sozlesme_onayla(
  p_versiyon text,
  p_kaynak   text default 'web',
  p_cihaz    text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kullanici_id bigint;
  v_sozlesme     record;
begin
  select id into v_kullanici_id
    from public.kullanicilar
   where auth_id = auth.uid()
     and coalesce(hesap_silindi, false) = false;
  if v_kullanici_id is null then
    return jsonb_build_object('ok', false, 'hata', 'kullanici_bulunamadi');
  end if;

  select * into v_sozlesme
    from public.sozlesme_metinleri
   where versiyon = p_versiyon and aktif = true;
  if v_sozlesme.id is null then
    return jsonb_build_object('ok', false, 'hata', 'aktif_sozlesme_yok');
  end if;

  insert into public.sozlesme_onaylari
    (kullanici_id, sozlesme_id, versiyon, kaynak, cihaz)
  values
    (v_kullanici_id, v_sozlesme.id, v_sozlesme.versiyon,
     coalesce(p_kaynak, 'web'), left(coalesce(p_cihaz, ''), 300))
  on conflict (kullanici_id, sozlesme_id) do nothing;

  return jsonb_build_object('ok', true, 'versiyon', v_sozlesme.versiyon);
end $$;

grant execute on function public.sozlesme_onayla(text, text, text) to authenticated;

-- ── 5) "Bu kullanıcı onaylamış mı?" ────────────────────────────────────
-- Arayüz kapısı bunu sorar. Personel olmayan (müşteri/bayi) için ZORUNLU
-- DEĞİL döner — kapsam kararı gereği onlar kilitlenmez.
create or replace function public.sozlesme_durumum()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_kul      record;
  v_sozlesme record;
  v_onay     record;
begin
  select id, tip, rol into v_kul
    from public.kullanicilar
   where auth_id = auth.uid()
     and coalesce(hesap_silindi, false) = false;
  if v_kul.id is null then
    return jsonb_build_object('gerekli', false, 'sebep', 'kullanici_yok');
  end if;

  -- Kapsam: yalnız ZNA personeli. Müşteri portalı ve bayi kullanıcıları
  -- bu metnin muhatabı değil (çalışan izleme maddeleri onlara uygulanmaz).
  if coalesce(v_kul.tip, '') <> 'zna' then
    return jsonb_build_object('gerekli', false, 'sebep', 'kapsam_disi');
  end if;

  select id, versiyon, baslik, yururluk_tarihi into v_sozlesme
    from public.sozlesme_metinleri where aktif = true;
  if v_sozlesme.id is null then
    return jsonb_build_object('gerekli', false, 'sebep', 'aktif_metin_yok');
  end if;

  select onay_tarihi into v_onay
    from public.sozlesme_onaylari
   where kullanici_id = v_kul.id and sozlesme_id = v_sozlesme.id;

  return jsonb_build_object(
    'gerekli',  v_onay.onay_tarihi is null,
    'versiyon', v_sozlesme.versiyon,
    'baslik',   v_sozlesme.baslik,
    'onay_tarihi', v_onay.onay_tarihi
  );
end $$;

grant execute on function public.sozlesme_durumum() to authenticated;

notify pgrst, 'reload schema';

commit;

select 'tablolar+fonksiyonlar kuruldu' as bilgi;
