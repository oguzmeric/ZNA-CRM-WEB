-- 266 — Sözleşme onayının İMZA değeri: değişmezlik + metin özeti + IP (04.08)
--
-- Kullanıcı sorusu: "Telefondan onaylayanların onayını nerede saklayacağız?
-- Sonuçta bu da bir imza niteliğinde." — Doğru soru, iki açık ortaya çıkardı:
--
-- AÇIK 1: METİN SONRADAN DEĞİŞTİRİLEBİLİYORDU.
--   Onay kaydı yalnız 'versiyon' tutuyordu. mig 265 metni "on conflict do
--   update" ile yazıyor; aynı versiyon numarasıyla içerik değiştirilebilir.
--   O zaman "Ahmet v1.0'ı onayladı" kaydı, Ahmet'in NEYİ onayladığını
--   kanıtlamaz — imza değerini yitirir.
--   ÇÖZÜM: (a) onay anındaki metnin SHA-256 özeti onay kaydına yazılır,
--          (b) yayımlanmış metnin içeriği artık DEĞİŞTİRİLEMEZ (trigger).
--
-- AÇIK 2: IP KAYDEDİLMİYORDU.
--   Onayın hangi ağdan verildiği ihtilafta önemli bir karinedir.
--   PostgREST istek başlıklarını GUC'a koyuyor (04.08'de canlıda kanıtlandı),
--   RPC içinden x-forwarded-for okunabiliyor.
--
-- AYRICA: onay kayıtları UPDATE/DELETE edilemez hale getirildi. Bir imzanın
-- sonradan düzeltilebilmesi imzayı değersizleştirir.

begin;

create extension if not exists pgcrypto;

-- ── 1) Metin özeti (hash) ──────────────────────────────────────────────
alter table public.sozlesme_metinleri
  add column if not exists metin_ozeti text;

alter table public.sozlesme_onaylari
  add column if not exists metin_ozeti text,   -- onay ANINDAKİ metnin özeti
  add column if not exists ip text;

comment on column public.sozlesme_onaylari.metin_ozeti is
  'Onay anındaki metnin SHA-256 özeti. Metin sonradan değişse bile kişinin neyi onayladığı bununla kanıtlanır.';

-- Mevcut metinlerin özetini doldur
update public.sozlesme_metinleri
   set metin_ozeti = encode(digest(icerik, 'sha256'), 'hex')
 where metin_ozeti is null;

-- Yeni/değişen metinde özeti otomatik hesapla
create or replace function public.sozlesme_ozet_hesapla() returns trigger
language plpgsql set search_path = public as $$
begin
  new.metin_ozeti := encode(digest(new.icerik, 'sha256'), 'hex');
  return new;
end $$;

drop trigger if exists trg_sozlesme_ozet on public.sozlesme_metinleri;
create trigger trg_sozlesme_ozet
  before insert or update of icerik on public.sozlesme_metinleri
  for each row execute function public.sozlesme_ozet_hesapla();

-- ── 2) Yayımlanmış metin DEĞİŞTİRİLEMEZ ────────────────────────────────
-- Bir kez onaylanmaya başlamış metnin içeriği/versiyonu kilitlenir.
-- Değişiklik gerekiyorsa YENİ VERSİYON eklenir ve herkes yeniden onaylar —
-- zaten tasarım da bu (mig 264, madde 11.3).
create or replace function public.sozlesme_metin_kilit() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.sozlesme_onaylari where sozlesme_id = old.id) then
    if new.icerik is distinct from old.icerik
       or new.versiyon is distinct from old.versiyon then
      raise exception
        'Onaylanmış sözleşme metni değiştirilemez (versiyon %). Yeni bir versiyon ekleyin.',
        old.versiyon
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_sozlesme_metin_kilit on public.sozlesme_metinleri;
create trigger trg_sozlesme_metin_kilit
  before update on public.sozlesme_metinleri
  for each row execute function public.sozlesme_metin_kilit();

-- ── 3) Onay kaydı DEĞİŞTİRİLEMEZ / SİLİNEMEZ ───────────────────────────
create or replace function public.sozlesme_onay_degismez() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Sözleşme onay kaydı değiştirilemez veya silinemez (imza niteliğindedir).'
    using errcode = 'check_violation';
end $$;

drop trigger if exists trg_sozlesme_onay_degismez on public.sozlesme_onaylari;
create trigger trg_sozlesme_onay_degismez
  before update or delete on public.sozlesme_onaylari
  for each row execute function public.sozlesme_onay_degismez();

-- ── 4) Onay RPC'si: özet + IP yazsın ───────────────────────────────────
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
  v_ip           text;
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

  -- İstemci IP'si: PostgREST başlıkları GUC'ta (04.08 canlı kanıt).
  -- x-forwarded-for birden çok adres taşıyabilir; ilki gerçek istemcidir.
  begin
    v_ip := split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      ',', 1);
  exception when others then
    v_ip := null;
  end;

  insert into public.sozlesme_onaylari
    (kullanici_id, sozlesme_id, versiyon, kaynak, cihaz, metin_ozeti, ip)
  values
    (v_kullanici_id, v_sozlesme.id, v_sozlesme.versiyon,
     coalesce(p_kaynak, 'web'), left(coalesce(p_cihaz, ''), 300),
     v_sozlesme.metin_ozeti, nullif(trim(v_ip), ''))
  on conflict (kullanici_id, sozlesme_id) do nothing;

  return jsonb_build_object('ok', true, 'versiyon', v_sozlesme.versiyon);
end $$;

grant execute on function public.sozlesme_onayla(text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;

select versiyon, aktif, left(metin_ozeti, 16) || '…' as ozet
from public.sozlesme_metinleri;
