-- 270_stok_miktari_senkron_trigger.sql
-- SN'siz ürünlerde stok bakiyesi İKİ ayrı modelle tutuluyordu (06.08 denetimi):
-- web = stok_hareketleri toplamı, mobil = stok_urunler.stok_miktari kolonu
-- (istemcide elle ±). Aralarında hiçbir senkron yoktu — 7 üründe fark birikmişti.
--
-- Tek gerçek kaynak: stok_hareketleri. stok_miktari artık TÜREV kolon —
-- bu trigger güncel tutar; istemcilerdeki elle ± güncellemeler kaldırıldı.
--
-- SN'Lİ ürünlere DOKUNULMAZ: onların stok_miktari'sı stok_kalemleri
-- sayımından türetilir (canlıdaki refresh_stok_miktari — repo dışı, tek yazılı
-- kanıt crm-mobile design doc). Aynı koruma orada da ters yönde var.
--
-- 'sayim' tipi: miktar = MUTLAK değer → stok_miktari doğrudan set edilir.
-- (Web bakiye fonksiyonu da sayimi reset noktası sayacak şekilde güncellendi.)

begin;

create or replace function stok_miktari_senkron()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kod   text := coalesce(new.stok_kodu, old.stok_kodu);
  v_delta numeric := 0;
begin
  if v_kod is null then return coalesce(new, old); end if;

  -- SN'li ürün: bakiye stok_kalemleri'nden türetilir, bu trigger karışmaz
  if exists (select 1 from stok_kalemleri where stok_kodu = v_kod) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.hareket_tipi in ('giris', 'transfer_giris') then
      v_delta := coalesce(new.miktar, 0);
    elsif new.hareket_tipi in ('cikis', 'transfer_cikis') then
      v_delta := -coalesce(new.miktar, 0);
    elsif new.hareket_tipi = 'sayim' then
      update stok_urunler set stok_miktari = coalesce(new.miktar, 0)
      where stok_kodu = v_kod;
      return new;
    else
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    if old.hareket_tipi in ('giris', 'transfer_giris') then
      v_delta := -coalesce(old.miktar, 0);
    elsif old.hareket_tipi in ('cikis', 'transfer_cikis') then
      v_delta := coalesce(old.miktar, 0);
    else
      -- sayım silinirse önceki değer bilinemez — dokunma
      return old;
    end if;
  end if;

  update stok_urunler
  set stok_miktari = coalesce(stok_miktari, 0) + v_delta
  where stok_kodu = v_kod;

  return coalesce(new, old);
end;
$$;

revoke all on function stok_miktari_senkron() from public;
revoke all on function stok_miktari_senkron() from anon;

drop trigger if exists tr_stok_miktari_senkron on stok_hareketleri;
create trigger tr_stok_miktari_senkron
  after insert or delete on stok_hareketleri
  for each row execute function stok_miktari_senkron();

-- Tek seferlik hizalama: SN'siz ürünlerde kolonu hareket toplamına eşitle.
-- (06.08 ölçümü: 7 ürün — 6'sında webden yapılan girişler kolona hiç
-- yansımamıştı, kolon 0 gösteriyordu; hareket kaydı daha eksiksiz.)
update stok_urunler u
set stok_miktari = h.toplam
from (
  select stok_kodu,
    sum(case hareket_tipi
        when 'giris' then miktar when 'transfer_giris' then miktar
        when 'cikis' then -miktar when 'transfer_cikis' then -miktar
        else 0 end) as toplam
  from stok_hareketleri
  group by stok_kodu
) h
where h.stok_kodu = u.stok_kodu
  and not exists (select 1 from stok_kalemleri k where k.stok_kodu = u.stok_kodu)
  and coalesce(u.stok_miktari, 0) <> h.toplam;

commit;

notify pgrst, 'reload schema';
