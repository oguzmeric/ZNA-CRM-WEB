-- 287 — Sipariş lokasyon kapısı müşteri BİRLEŞTİRMEyi kilitlemesin
--
-- mig 286'nın trigger'ı, lokasyonun müşterisi siparişin müşterisiyle uyuşmazsa
-- exception atıyordu — INSERT için doğru, ama UPDATE tarafında ağır bir yan
-- etkisi var: müşteri birleştirme runbook'u `musteri_id` tutan 27 tabloda
--   update <tablo> set musteri_id = <yeni> where musteri_id = <eski>
-- çalıştırıyor. Siparişin lokasyonu hâlâ ESKİ müşterinin şubesini gösterdiği
-- için bu ifade patlıyor, birleştirme yarıda kalıyordu (siparisler.musteri_id
-- FK'si on delete restrict olduğundan eski kartı silme adımı da bloke olurdu).
--
-- Yeni kural:
--   • lokasyon_id DOĞRUDAN yazılıyorsa (insert ya da lokasyon_id güncellemesi)
--     → uyuşmazlıkta yine REDDET. Kullanıcı yanlış şube seçemez.
--   • yalnız musteri_id değişiyorsa (birleştirme/düzeltme) → lokasyon artık o
--     müşteriye ait olmadığı için lokasyon_id NULL'lanır ve işlem geçer.
--     Sessiz veri kaybı değil: zaten başka müşterinin şubesiydi, taşınan
--     siparişte anlamı kalmıyor. Ekranda "Lokasyon seçilmedi" uyarısı çıkar.

begin;

create or replace function public.siparis_lokasyon_dogrula()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  lok_musteri bigint;
  lokasyon_yazildi boolean;
begin
  if new.lokasyon_id is null then
    return new;
  end if;

  select musteri_id into lok_musteri
    from musteri_lokasyonlari where id = new.lokasyon_id;

  if lok_musteri is not distinct from new.musteri_id then
    return new;   -- uyuşuyor, sorun yok
  end if;

  -- Uyuşmuyor. Lokasyonun KENDİSİ bu işlemde yazıldı mı?
  lokasyon_yazildi := (tg_op = 'INSERT')
                      or (old.lokasyon_id is distinct from new.lokasyon_id);

  if lokasyon_yazildi then
    raise exception 'Lokasyon bu müşteriye ait değil (lokasyon %, sipariş müşterisi %)',
      new.lokasyon_id, new.musteri_id;
  end if;

  -- Yalnız müşteri değişti (birleştirme): lokasyon bağını düşür, işlemi geçir.
  new.lokasyon_id := null;
  return new;
end;
$$;

commit;

-- Doğrulama (rollback'li testte koşuldu):
--   • lokasyon_id doğrudan yanlış müşteriye yazılırsa      → REDDEDİLİR
--   • musteri_id birleştirme ile değişirse                  → GEÇER, lokasyon null
--   • doğru lokasyon yazılırsa                              → GEÇER
