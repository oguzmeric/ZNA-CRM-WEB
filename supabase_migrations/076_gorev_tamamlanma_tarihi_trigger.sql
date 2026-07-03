-- Görev tamamlanma zamanı otomatik doldurulsun.
-- durum='tamamlandi' set edildiği anda tamamlanma_tarihi = now().
-- Geri alınırsa (tamamlandi'dan başka bir duruma) tekrar sıfırlanır ki yeniden tamamlanınca doğru zaman yakalansın.

create or replace function gorev_tamamlanma_tarihi_set()
returns trigger
language plpgsql
as $$
begin
  if new.durum = 'tamamlandi' and (old.durum is null or old.durum <> 'tamamlandi') then
    new.tamamlanma_tarihi := now();
  elsif new.durum <> 'tamamlandi' and old.durum = 'tamamlandi' then
    new.tamamlanma_tarihi := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_gorev_tamamlanma_tarihi on gorevler;
create trigger tr_gorev_tamamlanma_tarihi
  before update on gorevler
  for each row
  execute function gorev_tamamlanma_tarihi_set();

-- INSERT için de: doğrudan tamamlandi olarak eklenen görev varsa (nadir)
create or replace function gorev_tamamlanma_tarihi_insert()
returns trigger
language plpgsql
as $$
begin
  if new.durum = 'tamamlandi' and new.tamamlanma_tarihi is null then
    new.tamamlanma_tarihi := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tr_gorev_tamamlanma_tarihi_ins on gorevler;
create trigger tr_gorev_tamamlanma_tarihi_ins
  before insert on gorevler
  for each row
  execute function gorev_tamamlanma_tarihi_insert();

notify pgrst, 'reload schema';
