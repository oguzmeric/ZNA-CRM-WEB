-- 185: Görev bitiş tarihi kolonlarını senkronla
--
-- Sorun: gorevler'de ÜÇ bitiş kolonu var (bitis_tarihi date, bitis_tarih timestamptz,
-- son_tarih date) ve yazma yolları tutarsız:
--   web düzenleme formu  → bitis_tarih + son_tarih   (bitis_tarihi ESKİ kalıyor)
--   web devam modalı     → bitis_tarihi + son_tarih
--   mobil görev formu    → bitis_tarih + bitis_tarihi (son_tarih ESKİ kalıyor)
-- Günlük Özet + sabah-ozeti edge fn bitis_tarihi okuyordu → formdan tarihi ileri
-- alınan görev "Geciken Görevler"den düşmüyordu (Elite Garden vakası, 2026-07-17).
--
-- Kanonik kolon: son_tarih (Panel + Görevler listesi + gecikme SMS zaten bunu okur).
-- Bu migration: backfill + BEFORE trigger ile üçünü hangi yol yazarsa yazsın eşitle.

-- 1) Backfill: son_tarih boş olanları doldur (16 satır bitis_tarihi'nden, 1 satır bitis_tarih'ten)
update gorevler
set son_tarih = coalesce(bitis_tarihi, (bitis_tarih at time zone 'Europe/Istanbul')::date)
where son_tarih is null and (bitis_tarihi is not null or bitis_tarih is not null);

-- 2) Backfill: bitis_tarihi'yi kanonik son_tarih ile eşitle (7 uyumsuz satır)
update gorevler
set bitis_tarihi = son_tarih
where son_tarih is not null and bitis_tarihi is distinct from son_tarih;

-- 3) Trigger: hangi kolon değiştiyse onu kaynak kabul et, diğerlerine yay.
--    Öncelik: son_tarih > bitis_tarihi > bitis_tarih (date kolonlar TZ derdi taşımaz;
--    timestamptz'den türetirken Europe/Istanbul'a çevir).
create or replace function public.gorev_tarih_senkron()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.son_tarih := coalesce(new.son_tarih, new.bitis_tarihi, (new.bitis_tarih at time zone 'Europe/Istanbul')::date);
    new.bitis_tarihi := coalesce(new.bitis_tarihi, new.son_tarih);
  else
    if new.son_tarih is distinct from old.son_tarih and new.son_tarih is not null then
      new.bitis_tarihi := new.son_tarih;
    elsif new.bitis_tarihi is distinct from old.bitis_tarihi and new.bitis_tarihi is not null then
      new.son_tarih := new.bitis_tarihi;
    elsif new.bitis_tarih is distinct from old.bitis_tarih and new.bitis_tarih is not null then
      new.son_tarih := (new.bitis_tarih at time zone 'Europe/Istanbul')::date;
      new.bitis_tarihi := new.son_tarih;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_gorev_tarih_senkron on gorevler;
create trigger trg_gorev_tarih_senkron
  before insert or update on gorevler
  for each row execute function gorev_tarih_senkron();
