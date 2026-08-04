-- 263 — "Kullanılacak Malzemeler" faturaya düşmesin (04.08)
--
-- HATA: servis_malzemeleri tablosu İKİ listeyi birden tutuyor:
--   durum='planlanan'  → "Kullanılacak Malzemeler" (iç not, sahaya çıkmadan
--                        hazırlık listesi — kartın kendi yazısı: "Stok düşmez,
--                        zimmet oluşmaz, müşteri servis formunda görünmez")
--   durum='kullanildi' → "Kullanılan Malzemeler" (gerçekten harcanan; müşteri
--                        servis formuna basılır, faturalandırılır)
--
-- Ama merkezi Kullanılan Malzemeler modülüne köprüleyen trigger
-- (trg_mh_servis_malzeme, mig 192/193) durum'a HİÇ BAKMIYORDU:
--   create trigger trg_mh_servis_malzeme after insert on servis_malzemeleri
--   ...  (WHEN koşulu yok)
-- Sonuç: "kullanılacak" listesine malzeme eklenir eklenmez merkezi listede
-- "Fatura Bekliyor" kalemi doğuyordu. Henüz kullanılmamış — hatta sahaya bile
-- çıkılmamış — malzeme için fatura bekleniyor görünüyordu.
--
-- Canlı kanıt (04.08):
--   durum='kullanildi' : 1 kayıt → 1 merkezi kayıt      ✓
--   durum='planlanan'  : 3 kayıt → 3 merkezi kayıt, 3'ü fatura_bekliyor  ✗
--   Örnek: DATA PRİZİ (CAT6), servis_malzemeleri.id=31, durum='planlanan',
--          malzeme_hareketleri.id=246, fatura_durumu='fatura_bekliyor'
--
-- ÇÖZÜM: köprü yalnız durum='kullanildi' için çalışır. Planlanan kalem
-- "Kullandım" ile gerçekten kullanıldığında (durum planlanan→kullanildi)
-- merkezi kayıt O ZAMAN doğar.

begin;

-- ── 1) INSERT köprüsü: yalnız gerçekten kullanılan malzeme ──────────────
-- Fonksiyon gövdesi mig 193'teki ile aynı; tek fark baştaki durum kapısı.
create or replace function mh_servis_malzemesinden() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  -- ⭐ Planlanan (Kullanılacak) kalem mali sürece GİRMEZ.
  if coalesce(new.durum, '') <> 'kullanildi' then
    return new;
  end if;

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

-- ── 2) "Kullandım" anı: planlanan → kullanildi geçişinde köprü kurulur ──
-- Bu olmadan, planlanan kalem sonradan kullanılsa bile merkezi listeye hiç
-- düşmez ve faturalandırma kaçardı (birinci maddenin zorunlu tamamlayıcısı).
create or replace function mh_servis_malzeme_kullanildi() returns trigger
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
       'detay', 'Servis ' || coalesce(t.talep_no,'') || ' — planlanan kalem kullanıldı')))
  -- ⚠️ do nothing DEĞİL: aşağıdaki 3. adım, planlanan kalemlerin hatalı
  -- merkezi kaydını PASİFLİYOR (silmiyor — iz kalsın diye). O satır
  -- servis_malzeme_id benzersizliğini tuttuğu için "do nothing" deseydik,
  -- kalem sonradan gerçekten kullanıldığında insert sessizce düşer ve
  -- malzeme HİÇ faturaya girmezdi — sessiz gelir kaybı.
  -- Bunun yerine pasif kaydı yeniden canlandırıyoruz.
  on conflict (servis_malzeme_id) do update
    set aktif         = true,
        miktar        = excluded.miktar,
        birim_fiyat   = excluded.birim_fiyat,
        fatura_durumu = excluded.fatura_durumu,
        teknisyen     = excluded.teknisyen,
        teslim_tarihi = excluded.teslim_tarihi,
        islem_gecmisi = coalesce(malzeme_hareketleri.islem_gecmisi, '[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object('t', now(), 'islem', 'yeniden_aktif',
            'detay', 'Planlanan kalem kullanıldı — mali sürece alındı'));
  return new;
end $$;

drop trigger if exists trg_mh_servis_malzeme_kullanildi on servis_malzemeleri;
create trigger trg_mh_servis_malzeme_kullanildi
  after update of durum on servis_malzemeleri
  for each row
  when (new.durum = 'kullanildi' and coalesce(old.durum,'') is distinct from 'kullanildi')
  execute function mh_servis_malzeme_kullanildi();

-- ── 3) Mevcut yanlış kayıtları temizle ─────────────────────────────────
-- YALNIZ mali süreci BAŞLAMAMIŞ olanlar (fatura_bekliyor). Faturası kesilmiş
-- / irsaliyesi çıkmış bir kayda dokunulmaz — öyle bir kayıt varsa elle
-- incelenmeli, sessizce silmek muhasebeyi bozar.
-- Silme değil PASİFLEME: iz kalsın, geri alınabilsin.
update public.malzeme_hareketleri mh
   set aktif = false,
       islem_gecmisi = coalesce(mh.islem_gecmisi, '[]'::jsonb) ||
         jsonb_build_array(jsonb_build_object(
           't', now(), 'islem', 'pasiflendi',
           'detay', 'mig 263: kalem "Kullanılacak" listesinde (planlanan), henüz kullanılmadı — faturaya düşmemeliydi'))
  from public.servis_malzemeleri sm
 where mh.servis_malzeme_id = sm.id
   and sm.durum = 'planlanan'
   and mh.fatura_durumu = 'fatura_bekliyor'
   and coalesce(mh.aktif, true) = true;

commit;

-- Doğrulama: planlanan kalemlerin AKTİF merkezi kaydı kalmamalı
select sm.durum,
       count(*) as kalem,
       count(mh.id) filter (where coalesce(mh.aktif,true)) as aktif_merkezi_kayit
from public.servis_malzemeleri sm
left join public.malzeme_hareketleri mh on mh.servis_malzeme_id = sm.id
group by sm.durum;
