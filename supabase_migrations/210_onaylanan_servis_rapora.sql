-- 210: Onaylanan servis → Servis Raporları arşivine otomatik düşer
-- Kullanıcı talebi (2026-07-21): "Servis onaylandıktan sonra Servis Raporları
-- sayfasına düşmesi gerekmez mi?" — durum 'onaylandi' olduğunda servis_talepleri
-- kaydından servis_raporlari satırı üretilir (fis_no = talep_no, tekrar onayda
-- güncellenir, duplike olmaz). Trigger DB'de olduğu için web + mobil her onay
-- yolunu kapsar. esnweb senkronunun silme algılaması sayısal fiş aralığıyla
-- çalıştığından TLP-… numaraları ona takılmaz.

begin;

-- on conflict (fis_no) için unique index şart (mevcut idx yalnız btree'ydi; duplike yok, doğrulandı)
create unique index if not exists servis_raporlari_fis_no_uq on servis_raporlari (fis_no);

create or replace function public.servis_onay_rapora_yaz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.durum = 'onaylandi' and coalesce(old.durum, '') <> 'onaylandi' then
    insert into servis_raporlari (
      fis_no, firma_adi, cari_kodu, lokasyon, bildiren,
      bildirilen_ariza, sonuc, ariza_kodu, takip_kodu, statu_esn,
      teknisyen, servis_tipi, yukumluluk, servis_yeri,
      bil_tarih, gid_tarih, musteri_id, silindi
    ) values (
      new.talep_no,
      coalesce(new.firma_adi, new.musteri_ad),
      null,
      new.lokasyon,
      nullif(trim(coalesce(new.ilgili_kisi, '')), ''),
      coalesce(nullif(trim(coalesce(new.aciklama, '')), ''), new.konu),
      coalesce(new.cozum_aciklamasi, new.yapilan_mudahale),
      coalesce(new.konu, new.ana_tur),
      'İş tamam',
      'Tamamlandı',
      new.atanan_kullanici_ad,
      coalesce(new.servis_tipi, new.ana_tur),
      new.yukumluluk,
      new.servis_yeri,
      new.olusturma_tarihi::date,
      coalesce(new.tamamlanma_tarihi::date, current_date),
      new.musteri_id,
      false
    )
    on conflict (fis_no) do update set
      sonuc = excluded.sonuc,
      bildirilen_ariza = excluded.bildirilen_ariza,
      teknisyen = excluded.teknisyen,
      gid_tarih = excluded.gid_tarih,
      silindi = false;
  end if;
  return new;
end;
$$;

drop trigger if exists servis_onay_rapora_trg on servis_talepleri;
create trigger servis_onay_rapora_trg
  after update of durum on servis_talepleri
  for each row execute function servis_onay_rapora_yaz();

-- Geriye dönük: hâlihazırda onaylanmış servisler de arşive alınsın
insert into servis_raporlari (
  fis_no, firma_adi, lokasyon, bildiren, bildirilen_ariza, sonuc, ariza_kodu,
  takip_kodu, statu_esn, teknisyen, servis_tipi, yukumluluk, servis_yeri,
  bil_tarih, gid_tarih, musteri_id, silindi
)
select
  t.talep_no, coalesce(t.firma_adi, t.musteri_ad), t.lokasyon,
  nullif(trim(coalesce(t.ilgili_kisi, '')), ''),
  coalesce(nullif(trim(coalesce(t.aciklama, '')), ''), t.konu),
  coalesce(t.cozum_aciklamasi, t.yapilan_mudahale),
  coalesce(t.konu, t.ana_tur), 'İş tamam', 'Tamamlandı',
  t.atanan_kullanici_ad, coalesce(t.servis_tipi, t.ana_tur), t.yukumluluk, t.servis_yeri,
  t.olusturma_tarihi::date, coalesce(t.tamamlanma_tarihi::date, t.guncelleme_tarihi::date),
  t.musteri_id, false
from servis_talepleri t
where t.durum = 'onaylandi' and t.talep_no is not null
on conflict (fis_no) do nothing;

commit;

notify pgrst, 'reload schema';

select count(*) as arsivdeki_crm_raporu from servis_raporlari where fis_no like 'TLP-%';
