-- 272_rls_regresyon_ve_silindi_duzeltmeleri.sql
-- 06.08 doğrulama turunun bulguları (mig 270/271 sonrası):
--
-- a) Mig 271 regresyonu: Salih/Mahmut kendi ön siparişinden türeyen ZNA-SIP
--    numarasını göremez oldu (GorusmeDetay rozeti boş — "Salih vakası" geri
--    geldi). Dar SELECT istisnası: yalnız kendi ön siparişine bağlı sipariş.
-- b) Mig 271 regresyonu: saha sorumluları (Salih 34, Mahmut 45) Yeni Toplu
--    Bakım'da sözleşme dropdown'ını göremez oldu. Salt-okunur istisna.
-- c) Mig 270 trigger'ının SN'li ürün tespiti silindi filtresizdi: soft-silinmiş
--    kalemli bulk ürün sonsuza dek "SN'li" sayılıp senkron dışı kalıyordu.
--    refresh_stok_miktari'de de aynı tuzak vardı (repo dışı fonksiyon —
--    burada repoya kazandırıldı).
-- d) Müşteri kullanıcılarında firma_adi boşsa portal Teklif İste RLS insert
--    CHECK'inden geçemiyordu (2 canlı kullanıcı) — musteriler.firma'dan backfill.
--    (Kalıcı fix: musteri-davet-kabul edge fn artık firma_adi yazıyor.)

begin;

-- ── a) Ön sipariş sahibi, türeyen siparişin numarasını görebilsin ──────────
drop policy if exists siparisler_on_siparis_sahibi_sel on siparisler;
create policy siparisler_on_siparis_sahibi_sel on siparisler
  for select to authenticated
  using (
    on_siparis_id is not null and exists (
      select 1 from on_siparisler o
      where o.id = siparisler.on_siparis_id
        and o.olusturan_id = (select k.id from kullanicilar k where k.auth_id = auth.uid())
    )
  );

-- ── b) Saha sorumlusu sözleşme listesini okuyabilsin (toplu bakım bağı) ────
drop policy if exists sozlesmeler_saha_sorumlusu_sel on sozlesmeler;
create policy sozlesmeler_saha_sorumlusu_sel on sozlesmeler
  for select to authenticated
  using ((select coalesce(k.saha_sorumlusu, false)
          from kullanicilar k where k.auth_id = auth.uid()));

-- ── c1) Trigger: soft-silinmiş kalemler SN'li saymaz ───────────────────────
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

  -- SN'li ürün: bakiye stok_kalemleri'nden türetilir, bu trigger karışmaz.
  -- silindi=false ŞART: stok_kalemleri satır silmez (soft delete) — filtresiz
  -- exists, tüm kalemleri silinmiş bulk ürünü sonsuza dek SN'li sayardı.
  if exists (select 1 from stok_kalemleri
             where stok_kodu = v_kod and silindi = false) then
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
      return old;
    end if;
  end if;

  update stok_urunler
  set stok_miktari = coalesce(stok_miktari, 0) + v_delta
  where stok_kodu = v_kod;

  return coalesce(new, old);
end;
$$;

-- ── c2) refresh_stok_miktari da silindi-farkında (repo dışıydı, kazandırıldı)
create or replace function refresh_stok_miktari(p_stok_kodu text)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_kalem_var boolean;
begin
  if p_stok_kodu is null then return; end if;

  select exists(select 1 from stok_kalemleri
                where stok_kodu = p_stok_kodu and silindi = false)
  into v_kalem_var;

  if not v_kalem_var then return; end if;

  update stok_urunler
  set stok_miktari = (
    select count(*) from stok_kalemleri
    where stok_kodu = p_stok_kodu
      and durum = 'depoda'
      and silindi = false
  )
  where stok_kodu = p_stok_kodu;
end;
$$;

-- ── c3) Yeniden hizalama: mig 270 backfill'i soft-silinmiş kalemli ürünleri
--       atlamıştı — şimdi onlar da hareket toplamına eşitlenir.
--       (Canlıda 'sayim' hareketi hiç yok — 06.08 ölçümüyle doğrulandı;
--       sayımlı ürün olsaydı bu basit toplam yanlış olurdu.)
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
  and not exists (select 1 from stok_kalemleri k
                  where k.stok_kodu = u.stok_kodu and k.silindi = false)
  and coalesce(u.stok_miktari, 0) <> h.toplam;

-- ── d) Müşteri kullanıcılarında boş firma_adi backfill ─────────────────────
update kullanicilar k
set firma_adi = m.firma
from musteriler m
where k.tip = 'musteri'
  and (k.firma_adi is null or k.firma_adi = '')
  and m.id = k.musteri_id
  and m.firma is not null and m.firma <> '';

commit;

notify pgrst, 'reload schema';
