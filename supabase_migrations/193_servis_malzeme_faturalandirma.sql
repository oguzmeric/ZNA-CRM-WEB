-- 193: Servis malzemesi faturalandırma işareti (madde 23.10) — F3
-- Teknisyen/operatör malzeme başına kullanım şeklini işaretler; hareket kaydının
-- fatura durumu buna göre atanır ve işaret değişince (mali süreç başlamadıysa) senkron kalır.

alter table servis_malzemeleri
  add column if not exists faturalandirma text
  check (faturalandirma is null or faturalandirma in
    ('ucretli','garanti','sozlesme','ucretsiz','musteriden_alinan','iade','faturalandirilmayacak'));

-- İşaret → malzeme_hareketleri fatura_durumu eşlemesi
create or replace function mh_servis_isaret_durumu(isaret text) returns text
language sql immutable as $$
  select case isaret
    when 'garanti'               then 'garanti'
    when 'sozlesme'              then 'garanti'
    when 'ucretsiz'              then 'ucretsiz'
    when 'iade'                  then 'iade'
    when 'musteriden_alinan'     then 'faturalandirilmayacak'
    when 'faturalandirilmayacak' then 'faturalandirilmayacak'
    else 'fatura_bekliyor'  -- ucretli / işaretsiz
  end
$$;

-- INSERT trigger'ı işareti dikkate alacak şekilde güncelle
create or replace function mh_servis_malzemesinden() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select talep_no, musteri_id, musteri_ad into t
    from servis_talepleri where id = new.servis_id;
  insert into malzeme_hareketleri
    (kaynak, servis_id, servis_malzeme_id, kaynak_no, musteri_id, musteri_ad,
     urun_ad, stok_kodu, seri_no, miktar, birim, birim_fiyat, para_birimi,
     teknisyen, teslim_tarihi, fatura_durumu, aciklama, islem_gecmisi)
  values
    ('servis', new.servis_id, new.id, t.talep_no, t.musteri_id, t.musteri_ad,
     new.urun_adi, new.stok_kodu, new.seri_no, coalesce(new.miktar,1),
     coalesce(new.birim,'Adet'), new.birim_fiyat, 'TL',
     new.kullanici_ad, new.tarih,
     mh_servis_isaret_durumu(new.faturalandirma),
     case when new.faturalandirma = 'sozlesme' then 'Bakım sözleşmesi kapsamında'
          when new.faturalandirma = 'musteriden_alinan' then 'Müşteriden alınan ürün'
          else null end,
     jsonb_build_array(jsonb_build_object('t', now(), 'islem', 'olusturuldu',
       'detay', 'Servis ' || coalesce(t.talep_no,'') || ' malzemesinden otomatik'
         || case when new.faturalandirma is not null then ' — işaret: ' || new.faturalandirma else '' end)))
  on conflict (servis_malzeme_id) do nothing;
  return new;
end $$;

-- İşaret sonradan değişirse hareketi senkonla (mali süreç BAŞLAMADIYSA)
create or replace function mh_servis_isaret_senkron() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.faturalandirma is distinct from old.faturalandirma then
    update malzeme_hareketleri
       set fatura_durumu = mh_servis_isaret_durumu(new.faturalandirma),
           aciklama = case when new.faturalandirma = 'sozlesme' then 'Bakım sözleşmesi kapsamında'
                           when new.faturalandirma = 'musteriden_alinan' then 'Müşteriden alınan ürün'
                           else aciklama end,
           islem_gecmisi = islem_gecmisi || jsonb_build_array(jsonb_build_object(
             't', now(), 'islem', 'durum', 'kim', coalesce(new.kullanici_ad, ''),
             'detay', 'Servis işareti: ' || coalesce(new.faturalandirma, '(kaldırıldı)')))
     where servis_malzeme_id = new.id
       and aktif
       and fatura_durumu not in ('faturalandi','kismen_faturalandi','proforma_hazirlandi','proforma_gonderildi','musteri_onayi_bekleniyor');
  end if;
  -- Miktar/fiyat senkronu (faturasız hareketlerde)
  if new.miktar is distinct from old.miktar or new.birim_fiyat is distinct from old.birim_fiyat then
    update malzeme_hareketleri
       set miktar = greatest(coalesce(new.miktar,1), 0.001), birim_fiyat = new.birim_fiyat
     where servis_malzeme_id = new.id and aktif
       and fatura_durumu in ('fatura_bekliyor','faturaya_hazir') and faturalanan_miktar = 0;
  end if;
  return new;
end $$;
drop trigger if exists trg_mh_servis_isaret on servis_malzemeleri;
create trigger trg_mh_servis_isaret after update on servis_malzemeleri
  for each row execute function mh_servis_isaret_senkron();

notify pgrst, 'reload schema';
select 'mig 193 tamam' as sonuc;
