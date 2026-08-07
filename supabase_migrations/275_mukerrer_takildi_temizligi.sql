-- 275 — Mükerrer "takıldı" temizliği + tekrarını DB'de engelleme (07.08.2026)
--
-- SORUN: cihaz detayında 1 kez takılan ürün "5 kez takıldı" görünüyordu.
-- Kök neden istemci tarafında bulunup kapatıldı (cihazTak idempotency guard),
-- ama geçmiş kayıtlar duruyor. Kalan 13 fazla kaydın tamamı, öncekinden
-- 0–2 SANİYE sonra yazılmış (en uzun aralık 2 sn) — yani çift gönderim,
-- gerçek yeniden takma değil. Kanıt: kalem 16 zincirinde iki 'takildi'
-- 06:52:16 ve 06:52:17'de, söküm ise 12 dakika SONRA (07:04) — arada söküm
-- olmadığı için ikinci kayıt yeniden takma olamaz.
--
-- Silme SABİT ID listesiyle yapılır (dinamik "sira > 1" sorgusuyla değil):
-- migration ne zaman çalışırsa çalışsın tam olarak incelenen 13 satıra
-- dokunur, veri sonradan değişse bile fazladan satır silmez.

begin;

-- ---------------------------------------------------------------------------
-- 1) Silinen kayıt arşivi — geri dönülebilir olsun
--    Genel amaçlı: bundan sonraki temizliklerde de kullanılır.
-- ---------------------------------------------------------------------------
create table if not exists public.silinen_kayit_arsivi (
  id             bigserial primary key,
  tablo          text        not null,
  kayit          jsonb       not null,
  sebep          text,
  silen_migration text,
  silinme_tarihi timestamptz not null default now()
);

alter table public.silinen_kayit_arsivi enable row level security;

drop policy if exists silinen_kayit_arsivi_staff on public.silinen_kayit_arsivi;
create policy silinen_kayit_arsivi_staff on public.silinen_kayit_arsivi
  for select using ((select is_staff()));

comment on table public.silinen_kayit_arsivi is
  'Temizlik migration''larinda silinen satirlarin jsonb yedegi. Geri yukleme icin.';

-- ---------------------------------------------------------------------------
-- 2) Silinecek 13 satırı arşivle, sonra sil
-- ---------------------------------------------------------------------------
insert into public.silinen_kayit_arsivi (tablo, kayit, sebep, silen_migration)
select 'stok_kalemi_hareketleri', to_jsonb(h),
       'Mukerrer takildi (oncekinden 0-2 sn sonra, arada sokum yok)', '275'
from public.stok_kalemi_hareketleri h
where h.id in (33,45,52,69,77,78,80,81,82,83,87,114,122)
  and h.hareket = 'takildi';   -- güvenlik: yalnız takıldı kaydı arşivlenir/silinir

delete from public.stok_kalemi_hareketleri
where id in (33,45,52,69,77,78,80,81,82,83,87,114,122)
  and hareket = 'takildi';

-- ---------------------------------------------------------------------------
-- 3) Tekrarını DB'de engelle — son savunma katmanı
--    Bir kalem aynı müşteride ZATEN takılıysa (arada 'sokuldu' yoksa) ikinci
--    'takildi' kaydı yazılmaz. İstemci guard'ı atlansa/bypass edilse bile
--    defter bozulmaz. BEFORE INSERT'te `return null` satırı sessizce atlar —
--    burada doğru davranış budur: takma işlemi IDEMPOTENT'tir, zaten takılı
--    cihazı tekrar takmak hata değil, tekrarsız olmalıdır.
-- ---------------------------------------------------------------------------
create or replace function public.kalem_mukerrer_takma_engelle()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.hareket <> 'takildi' then
    return new;
  end if;

  -- Aynı kalem + aynı müşteri için, kendisinden sonra 'sokuldu' gelmemiş
  -- bir 'takildi' varsa cihaz hâlâ sahada demektir → ikinci kayıt mükerrer.
  if exists (
    select 1
      from stok_kalemi_hareketleri h
     where h.kalem_id = new.kalem_id
       and h.hareket = 'takildi'
       and coalesce(h.musteri_id, -1) = coalesce(new.musteri_id, -1)
       and not exists (
         select 1
           from stok_kalemi_hareketleri s
          where s.kalem_id = new.kalem_id
            and s.hareket = 'sokuldu'
            and s.id > h.id
       )
  ) then
    return null;   -- mükerrer: satır yazılmaz
  end if;

  return new;
end;
$function$;

drop trigger if exists tr_kalem_mukerrer_takma on public.stok_kalemi_hareketleri;
create trigger tr_kalem_mukerrer_takma
  before insert on public.stok_kalemi_hareketleri
  for each row execute function public.kalem_mukerrer_takma_engelle();

commit;
