-- 116: stok_kalemleri'ne teknisyen_id kolonu.
-- durum='teknisyende' iken hangi teknisyende olduğu direkt görülsün.
-- Diğer durumlarda NULL kalır.

alter table stok_kalemleri
  add column if not exists teknisyen_id bigint references kullanicilar(id) on delete set null;

create index if not exists stok_kalemleri_teknisyen_idx
  on stok_kalemleri (teknisyen_id) where teknisyen_id is not null;

-- Depoya dönerken guard: teknisyen_id, durum tutarlı kalsın
create or replace function stok_kalemleri_teknisyen_temizle()
returns trigger language plpgsql as $$
begin
  if new.durum <> 'teknisyende' then new.teknisyen_id := null; end if;
  return new;
end;
$$;

drop trigger if exists stok_kalemleri_teknisyen_trg on stok_kalemleri;
create trigger stok_kalemleri_teknisyen_trg
  before insert or update on stok_kalemleri
  for each row execute function stok_kalemleri_teknisyen_temizle();

notify pgrst, 'reload schema';
