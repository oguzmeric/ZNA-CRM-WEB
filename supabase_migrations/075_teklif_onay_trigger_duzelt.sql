-- Hiyerarşi düzeltmesi:
--   Eski: Teklif kabul → siparis_onayi = 'bekliyor' (direkt sipariş onayına)
--   Yeni: Teklif kabul → teklif_onayi = 'bekliyor' (önce teklif onayına)
--   Teklif onayı verilince frontend siparis_onayi = 'bekliyor' set eder (siparişe düşer)

-- Trigger fonksiyonunu güncelle
create or replace function teklif_kabul_siparis_olustur()
returns trigger
language plpgsql
as $$
begin
  if new.onay_durumu = 'kabul'
     and (old.onay_durumu is distinct from 'kabul')
     and new.teklif_onayi is null
     and new.siparis_onayi is null then
    new.teklif_onayi = jsonb_build_object(
      'durum', 'bekliyor',
      'gonderme_tarih', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  end if;
  return new;
end;
$$;

-- Trigger adını yenile (aynı function'a bağlı kalabilir)
drop trigger if exists tr_teklif_kabul_siparis on teklifler;
create trigger tr_teklif_kabul_siparis
  before update on teklifler
  for each row
  execute function teklif_kabul_siparis_olustur();

-- Şu anki yanlış durumda olan teklifleri düzelt:
-- siparis_onayi = 'bekliyor' olan ve teklif_onayi hiç girmemiş olanları
-- teklif onayına taşı (henüz teklif onayı sürecine girmemişler)
update teklifler
set teklif_onayi = jsonb_build_object(
      'durum', 'bekliyor',
      'gonderme_tarih', to_char(coalesce(olusturma_tarih, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    siparis_onayi = null
where siparis_onayi->>'durum' = 'bekliyor'
  and (teklif_onayi is null or teklif_onayi->>'durum' is null);

notify pgrst, 'reload schema';
