-- 118: SN eklendiğinde stok_urunler.seri_takipli otomatik true olsun
-- Bu tekrar 'seri_takipli mi değil mi' problemi yaşanmasın diye.

create or replace function stok_kalemi_seri_takipli_auto()
returns trigger language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  -- Yeni bir SN kaydı eklendiğinde ürünü seri_takipli olarak işaretle
  update stok_urunler
  set seri_takipli = true
  where stok_kodu = new.stok_kodu
    and (seri_takipli is null or seri_takipli = false);
  return new;
end;
$$;

drop trigger if exists stok_kalemi_seri_takipli_trg on stok_kalemleri;
create trigger stok_kalemi_seri_takipli_trg
  after insert on stok_kalemleri
  for each row execute function stok_kalemi_seri_takipli_auto();

notify pgrst, 'reload schema';
