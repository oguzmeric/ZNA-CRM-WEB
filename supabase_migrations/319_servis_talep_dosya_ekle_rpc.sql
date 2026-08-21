-- 319 — Servis talebine DOSYA EKİ kaydı için güvenli RPC + portal hesap onarımı.
--
-- SORUN (21.08 tespiti): `dosyalar` jsonb kolonu istemcide UPDATE ile
-- güncelleniyor. Müşteride UPDATE politikası YOK (mig 311 ile aynı kök):
-- portal müşterisi talep açarken foto yüklüyor, dosya Storage'a GİDİYOR ama
-- `dosyalar` metasının UPDATE'i RLS'e takılıyor; istemci `if (kayitli)` ile
-- sessizce yutuyor → ek talep kaydında hiç görünmüyor.
--
-- ÇÖZÜM mig 311 ile aynı disiplin: SECURITY DEFINER RPC yalnız `dosyalar`
-- dizisine ekleme yapar, başka kolona dokunmaz. Personel her talebe, müşteri
-- YALNIZ kendi firmasının talebine ekleyebilir. Meta web şemasıyla yazılır
-- ({name,type,size,path,url,uploadedAt,uploaderAd}) — mobil `url` de gönderir.

begin;

create or replace function public.servis_talep_dosya_ekle(
  p_talep_id bigint,
  p_ad       text,
  p_tip      text default null,
  p_boyut    bigint default null,
  p_yol      text default null,
  p_url      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kul   record;
  v_talep record;
  v_meta  jsonb;
begin
  if coalesce(btrim(p_ad), '') = '' then
    raise exception 'Dosya adı boş olamaz.';
  end if;
  if coalesce(btrim(p_yol), '') = '' and coalesce(btrim(p_url), '') = '' then
    raise exception 'Dosya yolu veya adresi gerekli.';
  end if;

  select k.id, k.ad, coalesce(k.tip,'') as tip, k.musteri_id
    into v_kul
    from public.kullanicilar k
   where k.auth_id = auth.uid()
     and coalesce(k.hesap_silindi, false) = false
   limit 1;

  if v_kul.id is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  select t.id, t.musteri_id into v_talep
    from public.servis_talepleri t
   where t.id = p_talep_id;

  if v_talep.id is null then
    raise exception 'Talep bulunamadı.';
  end if;

  if v_kul.tip = 'musteri' then
    if v_talep.musteri_id is null or v_talep.musteri_id is distinct from v_kul.musteri_id then
      raise exception 'Bu talebe dosya ekleme yetkiniz yok.';
    end if;
  elsif not (select public.is_staff()) then
    raise exception 'Bu talebe dosya ekleme yetkiniz yok.';
  end if;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'name',       btrim(p_ad),
    'type',       nullif(btrim(coalesce(p_tip, '')), ''),
    'size',       p_boyut,
    'path',       nullif(btrim(coalesce(p_yol, '')), ''),
    'url',        nullif(btrim(coalesce(p_url, '')), ''),
    'uploadedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'uploaderAd', v_kul.ad
  ));

  update public.servis_talepleri
     set dosyalar          = coalesce(dosyalar, '[]'::jsonb) || v_meta,
         guncelleme_tarihi = now()
   where id = p_talep_id;

  return v_meta;
end;
$$;

revoke all on function public.servis_talep_dosya_ekle(bigint, text, text, bigint, text, text) from public, anon;
grant execute on function public.servis_talep_dosya_ekle(bigint, text, text, bigint, text, text) to authenticated;

-- ── Müşteri kimliği + kendi talebi doğrulaması (ortak yardımcı) ────────────
-- Döner: kullanicilar satırı. Talep müşterinin firmasına ait değilse exception.
create or replace function public._portal_talep_yetki(p_talep_id bigint)
returns public.kullanicilar
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kul   public.kullanicilar;
  v_musteri_id bigint;
begin
  select k.* into v_kul
    from public.kullanicilar k
   where k.auth_id = auth.uid()
     and k.tip = 'musteri'
     and coalesce(k.hesap_silindi, false) = false
   limit 1;
  if v_kul.id is null then
    raise exception 'Bu işlem yalnız müşteri portalı hesabıyla yapılabilir.';
  end if;

  select t.musteri_id into v_musteri_id
    from public.servis_talepleri t where t.id = p_talep_id;
  if v_musteri_id is null or v_musteri_id is distinct from v_kul.musteri_id then
    raise exception 'Bu talep üzerinde yetkiniz yok.';
  end if;
  return v_kul;
end;
$$;
revoke all on function public._portal_talep_yetki(bigint) from public, anon, authenticated;

-- ── Müşteri çözüm onayı / ret ──────────────────────────────────────────────
-- Web MusteriTalepDetay "Çözümü onayla" / "Sorun devam ediyor" butonları
-- talepGuncelle (UPDATE) kullanıyordu — müşteride UPDATE politikası olmadığı
-- için SESSİZCE düşüyordu. Ret'te durum tekrar 'devam_ediyor'a döner.
create or replace function public.servis_talep_musteri_onay(
  p_talep_id bigint,
  p_onay     boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kul public.kullanicilar;
  v_gecmis_kaydi jsonb;
begin
  v_kul := public._portal_talep_yetki(p_talep_id);

  v_gecmis_kaydi := jsonb_build_object(
    'durum',      case when p_onay then 'tamamlandi' else 'devam_ediyor' end,
    'tarih',      to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'kullaniciAd', v_kul.ad,
    'aciklama',   case when p_onay then 'Müşteri çözümü onayladı'
                       else 'Müşteri sorunun devam ettiğini bildirdi' end
  );

  update public.servis_talepleri
     set musteri_onay      = case when p_onay then 'onaylandi' else 'ret' end,
         durum             = case when p_onay then durum else 'devam_ediyor' end,
         durum_gecmisi     = coalesce(durum_gecmisi, '[]'::jsonb) || v_gecmis_kaydi,
         guncelleme_tarihi = now()
   where id = p_talep_id;
end;
$$;
revoke all on function public.servis_talep_musteri_onay(bigint, boolean) from public, anon;
grant execute on function public.servis_talep_musteri_onay(bigint, boolean) to authenticated;

-- ── Müşteri hizmet değerlendirmesi (1-5 yıldız + yorum) ────────────────────
-- Aynı kök: degerlendirme_* kolonları UPDATE ile yazılıyordu, müşteri yazamıyordu.
create or replace function public.servis_talep_degerlendir(
  p_talep_id bigint,
  p_puan     integer,
  p_yorum    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kul public.kullanicilar;
begin
  if p_puan is null or p_puan < 1 or p_puan > 5 then
    raise exception 'Puan 1 ile 5 arasında olmalı.';
  end if;
  v_kul := public._portal_talep_yetki(p_talep_id);

  update public.servis_talepleri
     set degerlendirme_puan         = p_puan,
         degerlendirme_yorum        = nullif(btrim(coalesce(p_yorum, '')), ''),
         degerlendirme_tarihi       = now(),
         degerlendirme_kullanici_id = v_kul.id,
         guncelleme_tarihi          = now()
   where id = p_talep_id;
end;
$$;
revoke all on function public.servis_talep_degerlendir(bigint, integer, text) from public, anon;
grant execute on function public.servis_talep_degerlendir(bigint, integer, text) to authenticated;

-- ── Müşteri talep düzenleme (yalnız 'bekliyor' durumunda, dar kolon seti) ──
-- Web "Düzenle" formu da talepGuncelle (UPDATE) kullanıyordu — aynı sessiz kırık.
create or replace function public.servis_talep_musteri_duzenle(
  p_talep_id bigint,
  p_alanlar  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kul public.kullanicilar;
  v_durum text;
begin
  v_kul := public._portal_talep_yetki(p_talep_id);

  select durum into v_durum from public.servis_talepleri where id = p_talep_id;
  if v_durum is distinct from 'bekliyor' then
    raise exception 'Talep işleme alındığı için artık düzenlenemez.';
  end if;
  if coalesce(btrim(p_alanlar->>'konu'), '') = ''
     or coalesce(btrim(p_alanlar->>'aciklama'), '') = '' then
    raise exception 'Konu ve açıklama boş olamaz.';
  end if;

  -- Beyaz liste: müşteri yalnız kendi form alanlarını değiştirebilir;
  -- durum/atama/onay kolonlarına bu yoldan dokunulamaz.
  update public.servis_talepleri
     set konu        = btrim(p_alanlar->>'konu'),
         aciklama    = btrim(p_alanlar->>'aciklama'),
         lokasyon    = coalesce(p_alanlar->>'lokasyon', lokasyon),
         cihaz_turu  = coalesce(p_alanlar->>'cihazTuru', cihaz_turu),
         aciliyet    = case when p_alanlar->>'aciliyet' in ('dusuk','normal','yuksek','acil')
                            then p_alanlar->>'aciliyet' else aciliyet end,
         ilgili_kisi = coalesce(p_alanlar->>'ilgiliKisi', ilgili_kisi),
         telefon     = coalesce(p_alanlar->>'telefon', telefon),
         email       = coalesce(p_alanlar->>'email', email),
         uygun_zaman = coalesce(p_alanlar->>'uygunZaman', uygun_zaman),
         durum_gecmisi = coalesce(durum_gecmisi, '[]'::jsonb) || jsonb_build_object(
           'tip', 'duzenleme', 'durum', 'bekliyor',
           'tarih', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'kullaniciAd', v_kul.ad, 'aciklama', 'Müşteri talebi güncelledi'),
         guncelleme_tarihi = now()
   where id = p_talep_id;
end;
$$;
revoke all on function public.servis_talep_musteri_duzenle(bigint, jsonb) from public, anon;
grant execute on function public.servis_talep_musteri_duzenle(bigint, jsonb) to authenticated;

-- ── Veri onarımı: portal hesabı id 66 (aliuguraktepe2) ─────────────────────
-- tip='musteri' ama rol='personel' kalmıştı (mig 295 sonrası açılmış hesap).
-- Mobil/web personel kapıları rol'e baktığı için bu hesap personel arayüzüne
-- düşüyordu. Eski değer: rol='personel'.
update public.kullanicilar
   set rol = 'musteri'
 where id = 66 and tip = 'musteri' and rol = 'personel';

commit;

notify pgrst, 'reload schema';
