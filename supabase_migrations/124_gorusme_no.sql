-- 124: Görüşme No — GRS-YYYY-NNNNNN yıllık formatında otomatik numara.
--
-- KRİTİK: Mevcut hiçbir şeyi bozmuyor. Sadece gorusmeler tablosuna bir kolon
-- ekler ve BEFORE INSERT trigger ile no doldurur. Backfill mevcut kayıtlar
-- için yapılır.
--
-- Pattern: 055_teklif_no_trigger.sql ile aynı prensip, yıl bileşeni eklenmiş.
--
-- Faz 1/5 — Görüşme No + backfill.
-- Bkz: promt "ZNACRM sisteminde tüm ticari ve operasyonel süreçler Görüşme
-- Kaydı üzerinden başlar. Her görüşme kaydına sistem tarafından otomatik bir
-- Görüşme Numarası verilir. Örnek format: GRS-2026-000001."

-- ==================== KOLON ====================
alter table gorusmeler
  add column if not exists gorusme_no text;

-- Not: unique constraint backfill'den SONRA eklenecek (aşağıda) çünkü
-- mevcut kayıtların hepsinde NULL var, önce doldurmak gerek.

-- ==================== NUMARA ÜRETİCİ ====================
-- Yıllık sequence yerine max+1 pattern kullanıyoruz — teklif_no ile aynı,
-- doğru + basit + race durumunda BEFORE INSERT lock ile güvenli.

create or replace function gorusme_no_uret()
returns trigger
language plpgsql
as $$
declare
  v_yil int := extract(year from coalesce(new.olusturma_tarih, now()))::int;
  v_son_no int;
  v_pattern text;
begin
  -- Client zaten verdiyse dokunma
  if new.gorusme_no is not null and new.gorusme_no <> '' then
    return new;
  end if;

  -- İlgili yılın son numarasını bul
  v_pattern := '^GRS-' || v_yil || '-(\d+)$';
  select coalesce(
    max(substring(gorusme_no from v_pattern)::int),
    0
  ) into v_son_no
  from gorusmeler
  where gorusme_no ~ v_pattern;

  new.gorusme_no := 'GRS-' || v_yil || '-' || lpad((v_son_no + 1)::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists tr_gorusme_no_uret on gorusmeler;
create trigger tr_gorusme_no_uret
  before insert on gorusmeler
  for each row
  execute function gorusme_no_uret();

-- ==================== BACKFILL ====================
-- Mevcut görüşmelere yıllara göre sıralı numara ata.
-- olusturma_tarih ile ROW_NUMBER kullanıyoruz — kronolojik sıra.

do $$
declare
  r record;
  v_yil int;
  v_sayac int;
  v_onceki_yil int := 0;
begin
  for r in
    select id, extract(year from coalesce(olusturma_tarih, now()))::int as yil
    from gorusmeler
    where gorusme_no is null or gorusme_no = ''
    order by coalesce(olusturma_tarih, now()) asc, id asc
  loop
    if r.yil <> v_onceki_yil then
      v_yil := r.yil;
      v_onceki_yil := r.yil;
      -- Bu yılın mevcut max no'sundan başla (nadir edge case: yıla göre karışık kayıtlar)
      select coalesce(
        max(substring(gorusme_no from ('^GRS-' || v_yil || '-(\d+)$'))::int),
        0
      ) into v_sayac
      from gorusmeler
      where gorusme_no ~ ('^GRS-' || v_yil || '-\d+$');
    end if;
    v_sayac := v_sayac + 1;
    update gorusmeler
       set gorusme_no = 'GRS-' || v_yil || '-' || lpad(v_sayac::text, 6, '0')
     where id = r.id;
  end loop;
end $$;

-- ==================== UNIQUE + INDEX ====================
create unique index if not exists gorusmeler_gorusme_no_uidx
  on gorusmeler (gorusme_no) where gorusme_no is not null;

-- PostgREST'e şemayı yeniden yükle
notify pgrst, 'reload schema';
