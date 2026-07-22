-- 221 — Görev SLA "saat durdurma".
--
-- Görev "Beklemede" / "Bilgi Bekleniyor" durumundayken (dış bir şeyi beklerken)
-- gecikme saati DURUR: gecikmiş görünmez. Devam'a alınınca beklenen gün kadar
-- ETKİN bitiş tarihi ötelenir (toplam_bekleme_gun). Orijinal son_tarih korunur
-- (rapor/tarihçe için); istemci etkin bitişi = son_tarih + toplam_bekleme_gun alır.
--
-- Not: son_tarih'e DOKUNMAZ (mig 185 tarih-senkron trigger'ıyla çakışmasın);
-- yalnız iki yardımcı kolonu yönetir. Yalnız durum değişiminde tetiklenir.

alter table gorevler add column if not exists bekleme_baslangic  timestamptz;
alter table gorevler add column if not exists toplam_bekleme_gun integer not null default 0;

create or replace function gorev_bekleme_saati() returns trigger
language plpgsql as $$
declare
  eski_bekliyor boolean := coalesce(old.durum, '') in ('beklemede', 'bilgi_bekleniyor');
  yeni_bekliyor boolean := coalesce(new.durum, '') in ('beklemede', 'bilgi_bekleniyor');
begin
  if new.durum is distinct from old.durum then
    if yeni_bekliyor and not eski_bekliyor then
      -- bekleme başladı: damgayı koy
      new.bekleme_baslangic := now();
    elsif eski_bekliyor and not yeni_bekliyor then
      -- bekleme bitti: beklenen günü biriktir, damgayı temizle
      if old.bekleme_baslangic is not null then
        new.toplam_bekleme_gun := coalesce(old.toplam_bekleme_gun, 0)
          + greatest(0, ceil(extract(epoch from (now() - old.bekleme_baslangic)) / 86400.0))::int;
      end if;
      new.bekleme_baslangic := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_gorev_bekleme_saati on gorevler;
create trigger trg_gorev_bekleme_saati
  before update on gorevler
  for each row execute function gorev_bekleme_saati();

-- Hâlihazırda bekleyen görevlere yaklaşık başlangıç damgası (bugünden say)
update gorevler set bekleme_baslangic = now()
  where durum in ('beklemede', 'bilgi_bekleniyor') and bekleme_baslangic is null;

notify pgrst, 'reload schema';
