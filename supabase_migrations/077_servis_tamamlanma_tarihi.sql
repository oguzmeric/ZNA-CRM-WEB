-- Servis talep tamamlanma zamanı — leaderboard/rapor için doğru zaman damgası.
-- durum='tamamlandi'ye geçtiği anda tamamlanma_tarihi = now(). Geri alınırsa null.

alter table servis_talepleri add column if not exists tamamlanma_tarihi timestamptz;

create or replace function servis_tamamlanma_tarihi_set()
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

drop trigger if exists tr_servis_tamamlanma_tarihi on servis_talepleri;
create trigger tr_servis_tamamlanma_tarihi
  before update on servis_talepleri
  for each row
  execute function servis_tamamlanma_tarihi_set();

create or replace function servis_tamamlanma_tarihi_insert()
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

drop trigger if exists tr_servis_tamamlanma_tarihi_ins on servis_talepleri;
create trigger tr_servis_tamamlanma_tarihi_ins
  before insert on servis_talepleri
  for each row
  execute function servis_tamamlanma_tarihi_insert();

notify pgrst, 'reload schema';
