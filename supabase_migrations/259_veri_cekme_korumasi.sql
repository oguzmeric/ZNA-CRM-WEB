-- 259 — Veri çekme koruması: GÖZETİM FAZI (03-04.08 kararları)
--
-- Kullanıcı kararları:
--   1) Önce 2 hafta GÖZETİM: yalnız log + bildirim, OTOMATİK KİLİT YOK.
--      Gerçek kullanım verisiyle eşik kalibre edilecek, sonra askı açılacak.
--   2) Admin hesapları askıya alınamaz/kilitlenmez ama hareketleri LOGLANIR.
--   3) Excel dışa aktarmalar loglanır, askı tetiklemez.
--
-- Teknik gerçek (canlı test 03.08): PostgREST okumaları salt-okunur
-- transaction'da → RLS içinden SELECT logu YAZILAMAZ. Log bu yüzden istemci
-- sayacı + VOLATILE rpc (POST) ile yazılır; askı kapısı ise is_staff()'ta —
-- 118 policy'nin tamamı oradan geçtiği için curl/DevTools ile atlatılamaz.

begin;

-- ── 1) Askı kolonları ──────────────────────────────────────────────────────
alter table public.kullanicilar add column if not exists askida      boolean not null default false;
alter table public.kullanicilar add column if not exists aski_sebebi text;
alter table public.kullanicilar add column if not exists aski_tarihi timestamptz;

-- ── 2) is_staff v2: silinmiş + askıdaki hesap veri okuyamaz ────────────────
-- Bilinen açık da kapanıyor: is_staff hesap_silindi'ye bakmıyordu (is_admin
-- bakıyordu). Askı yalnız PERSONELİ keser — admin muaf (karar 2: sistemi
-- yönetecek kimse kilitlenmesin). Adminler zaten askiya_al RPC'sinde reddedilir;
-- burası çifte emniyet.
create or replace function public.is_staff()
returns boolean language sql stable security definer
set search_path to 'public' as $$
  select coalesce(
    (select rol in ('admin','personel')
        and coalesce(hesap_silindi, false) = false
        and (rol = 'admin' or coalesce(askida, false) = false)
     from kullanicilar where auth_id = auth.uid()),
    false
  );
$$;

-- ── 3) Askı kolonları kilitli listeye (mig 246 trigger'ı) ──────────────────
-- kullanicilar_self_update RLS'i kişinin kendi satırını güncellemesine izin
-- veriyor; bu kolonlar korunmazsa PERSONEL KENDİ ASKISINI KALDIRABİLİRDİ.
create or replace function public.kullanicilar_yetki_koruma()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (select public.is_admin()) then
    return new;
  end if;

  if new.rol                      is distinct from old.rol
     or new.tip                   is distinct from old.tip
     or new.moduller              is distinct from old.moduller
     or new.ad                    is distinct from old.ad
     or new.auth_id               is distinct from old.auth_id
     or new.musteri_id            is distinct from old.musteri_id
     or new.kullanici_adi         is distinct from old.kullanici_adi
     or new.silinebilir           is distinct from old.silinebilir
     or new.izinli_turler         is distinct from old.izinli_turler
     or new.onay_durum            is distinct from old.onay_durum
     or new.onaylayan_id          is distinct from old.onaylayan_id
     or new.siparis_onay_yetkilisi   is distinct from old.siparis_onay_yetkilisi
     or new.siparis_onay_ust_yetkili is distinct from old.siparis_onay_ust_yetkili
     or new.teklif_onay_yetkilisi    is distinct from old.teklif_onay_yetkilisi
     or new.teklif_onay_ust_yetkili  is distinct from old.teklif_onay_ust_yetkili
     or new.fatura_yetkilisi      is distinct from old.fatura_yetkilisi
     or new.montaj_sorumlusu      is distinct from old.montaj_sorumlusu
     or new.gorev_yetki           is distinct from old.gorev_yetki
     or new.demirbas_yetkilisi    is distinct from old.demirbas_yetkilisi
     or new.saha_sorumlusu        is distinct from old.saha_sorumlusu
     -- mig 259: askı alanları — kişi kendi askısını kaldıramaz
     or new.askida                is distinct from old.askida
     or new.aski_sebebi           is distinct from old.aski_sebebi
     or new.aski_tarihi           is distinct from old.aski_tarihi
  then
    raise exception 'Yetki alanlarini yalnizca yonetici degistirebilir (rol/tip/moduller/ad/onay yetkileri).';
  end if;

  return new;
end $$;

-- ── 4) Günlük veri erişim özeti ────────────────────────────────────────────
-- Ham istek başına satır YAZILMAZ (günde on binlerce olurdu); istemci 30 sn'de
-- bir toplayıp tek RPC ile yollar, burada gün+kullanıcı satırına upsert edilir.
create table if not exists public.veri_erisim_gunluk (
  id              bigint generated always as identity primary key,
  kullanici_id    bigint not null references kullanicilar(id) on delete cascade,
  gun             date   not null,
  istek_sayisi    integer not null default 0,
  satir_sayisi    bigint  not null default 0,
  en_buyuk_istek  integer not null default 0,   -- tek istekte çekilen en çok satır
  tablolar        jsonb   not null default '{}'::jsonb,  -- tablo → satır kırılımı
  uyarildi        boolean not null default false,        -- günde 1 bildirim (spam önleme)
  guncelleme      timestamptz not null default now(),
  unique (kullanici_id, gun)
);

create index if not exists idx_veri_erisim_gun on veri_erisim_gunluk (gun desc);

alter table public.veri_erisim_gunluk enable row level security;
-- Yalnız admin OKUR; yazma policy'si bilerek YOK — tek yazım yolu aşağıdaki
-- SECURITY DEFINER rpc (kullanıcı kendi logunu şişirip/silip iz karartamaz).
drop policy if exists veri_erisim_admin_select on veri_erisim_gunluk;
create policy veri_erisim_admin_select on veri_erisim_gunluk
  for select using ((select is_admin()));

-- ── 5) Eşik ayarları (tek satır) — gözetimde kalibre edilecek ─────────────
create table if not exists public.veri_koruma_ayarlari (
  id                  integer primary key check (id = 1),
  mod                 text not null default 'gozetim' check (mod in ('gozetim','aktif')),
  tek_istek_esigi     integer not null default 2000,    -- pagedFetch sayfası 1000; 2000+ tek istek anormal
  gunluk_satir_esigi  bigint  not null default 150000,
  gunluk_istek_esigi  integer not null default 4000,
  bildirim_alici_id   bigint  not null default 2,       -- Oğuz
  guncelleme          timestamptz not null default now()
);
insert into public.veri_koruma_ayarlari (id) values (1) on conflict (id) do nothing;

alter table public.veri_koruma_ayarlari enable row level security;
drop policy if exists veri_koruma_admin_all on veri_koruma_ayarlari;
create policy veri_koruma_admin_all on veri_koruma_ayarlari
  for all using ((select is_admin())) with check ((select is_admin()));

-- ── 6) RPC: istemci sayacının döktüğü toplamları işle ─────────────────────
create or replace function public.veri_erisim_kaydet(
  p_istek int, p_satir bigint, p_en_buyuk int, p_tablolar jsonb default '{}'::jsonb
) returns void
language plpgsql volatile security definer
set search_path to 'public'
as $$
declare
  v_kul     record;
  v_gun     date := (now() at time zone 'Europe/Istanbul')::date;
  v_ayar    record;
  v_satir   record;
begin
  -- Kimlik RPC içinde çözülür — istemciden id alınmaz (sahte id yazılamaz)
  select id, ad into v_kul
  from kullanicilar
  where auth_id = auth.uid() and rol in ('admin','personel')
    and coalesce(hesap_silindi, false) = false
  limit 1;
  if v_kul.id is null then return; end if;

  -- Girdi temizliği: negatif/uçuk değerler sayaç bozmasın
  p_istek    := least(greatest(coalesce(p_istek, 0), 0), 100000);
  p_satir    := least(greatest(coalesce(p_satir, 0), 0), 10000000);
  p_en_buyuk := least(greatest(coalesce(p_en_buyuk, 0), 0), 1000000);
  if p_istek = 0 and p_satir = 0 then return; end if;

  insert into veri_erisim_gunluk as g
    (kullanici_id, gun, istek_sayisi, satir_sayisi, en_buyuk_istek, tablolar)
  values (v_kul.id, v_gun, p_istek, p_satir, p_en_buyuk, coalesce(p_tablolar, '{}'::jsonb))
  on conflict (kullanici_id, gun) do update set
    istek_sayisi   = g.istek_sayisi + excluded.istek_sayisi,
    satir_sayisi   = g.satir_sayisi + excluded.satir_sayisi,
    en_buyuk_istek = greatest(g.en_buyuk_istek, excluded.en_buyuk_istek),
    guncelleme     = now(),
    -- tablo kırılımı: aynı anahtarlar TOPLANIR (jsonb || olsa ezerdi)
    tablolar = (
      select coalesce(jsonb_object_agg(anahtar, toplam), '{}'::jsonb)
      from (
        select t.anahtar, sum(t.deger) as toplam
        from (
          select key as anahtar, coalesce(value::bigint, 0) as deger from jsonb_each_text(g.tablolar)
          union all
          select key, coalesce(value::bigint, 0) from jsonb_each_text(excluded.tablolar)
        ) t
        group by t.anahtar
      ) m
    );

  -- Eşik kontrolü — GÖZETİM: yalnız bildirim, kilit yok. Günde 1 uyarı/kişi.
  select * into v_ayar from veri_koruma_ayarlari where id = 1;
  if v_ayar is null then return; end if;

  select * into v_satir from veri_erisim_gunluk
  where kullanici_id = v_kul.id and gun = v_gun;

  if not v_satir.uyarildi and (
       v_satir.satir_sayisi   > v_ayar.gunluk_satir_esigi
    or v_satir.istek_sayisi   > v_ayar.gunluk_istek_esigi
    or v_satir.en_buyuk_istek > v_ayar.tek_istek_esigi
  ) then
    insert into bildirimler (alici_id, baslik, mesaj, tip, link)
    values (
      v_ayar.bildirim_alici_id,
      '⚠️ Veri erişim eşiği aşıldı',
      v_kul.ad || ' bugün ' || v_satir.istek_sayisi || ' istekte '
        || v_satir.satir_sayisi || ' satır çekti (tek istekte en çok '
        || v_satir.en_buyuk_istek || '). Gözetim modu: hesap kilitlenmedi.',
      'uyari',
      '/kullanici-yonetimi'
    );
    update veri_erisim_gunluk set uyarildi = true
    where kullanici_id = v_kul.id and gun = v_gun;
  end if;
exception when others then
  -- Log altyapısı ASLA uygulamayı bozamaz — sessizce yut (best-effort).
  null;
end $$;

revoke all on function public.veri_erisim_kaydet(int, bigint, int, jsonb) from public, anon;
grant execute on function public.veri_erisim_kaydet(int, bigint, int, jsonb) to authenticated, service_role;

-- ── 7) Elle askıya alma / çıkarma (yalnız yönetici; admin hesap alınamaz) ──
create or replace function public.kullanici_askiya_al(p_id bigint, p_sebep text default null)
returns void language plpgsql volatile security definer
set search_path to 'public' as $$
declare v_rol text;
begin
  if not (select is_admin()) then
    raise exception 'Yalnızca yöneticiler hesap askıya alabilir.';
  end if;
  select rol into v_rol from kullanicilar where id = p_id;
  if v_rol is null then raise exception 'Kullanıcı bulunamadı: %', p_id; end if;
  if v_rol = 'admin' then raise exception 'Yönetici hesabı askıya alınamaz.'; end if;
  update kullanicilar
     set askida = true,
         aski_sebebi = coalesce(nullif(trim(p_sebep), ''), 'Elle askıya alındı'),
         aski_tarihi = now()
   where id = p_id;
end $$;

create or replace function public.kullanici_askidan_cikar(p_id bigint)
returns void language plpgsql volatile security definer
set search_path to 'public' as $$
begin
  if not (select is_admin()) then
    raise exception 'Yalnızca yöneticiler askı kaldırabilir.';
  end if;
  update kullanicilar
     set askida = false, aski_sebebi = null, aski_tarihi = null
   where id = p_id;
end $$;

revoke all on function public.kullanici_askiya_al(bigint, text) from public, anon;
revoke all on function public.kullanici_askidan_cikar(bigint) from public, anon;
grant execute on function public.kullanici_askiya_al(bigint, text) to authenticated;
grant execute on function public.kullanici_askidan_cikar(bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
