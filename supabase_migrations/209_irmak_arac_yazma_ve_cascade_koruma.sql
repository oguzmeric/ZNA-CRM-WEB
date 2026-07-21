-- 209: (1) Irmak INAN (59) araç kaydı yazma yetkisi — filoYetki.js [29,44,59] ile hizalı
--      (2) Cascade koruması: bordrolar, izin_talepleri, mesai_kayitlari, arac_foto_kayitlari
--          kullanıcı silinince UÇMASIN (demirbaş olayının tekrarı — bkz. mig 208)

begin;

-- (1) Araç yazma politikası: id 59 eklendi
drop policy if exists arac_yonetim_yazar on public.sirket_araclari;
create policy arac_yonetim_yazar on public.sirket_araclari for all
  using (
    exists (
      select 1 from kullanicilar
      where auth_id = auth.uid()
        and (
          rol = 'admin'
          or ad ~* '\m(oğuz|oguz|ali|ferdi)\M'
          or id in (29, 44, 59) -- filoYetki.js IZINLI_KULLANICI_IDLERI ile aynı
        )
    )
  );

-- (2) Kritik geçmiş kayıtları cascade'den çıkar → restrict
--     (kullanıcı silinmeden önce bu kayıtların bilinçli taşınması/temizlenmesi gerekir)
alter table bordrolar
  drop constraint if exists bordrolar_kullanici_id_fkey;
alter table bordrolar
  add constraint bordrolar_kullanici_id_fkey
  foreign key (kullanici_id) references kullanicilar(id) on delete restrict;

alter table izin_talepleri
  drop constraint if exists izin_talepleri_kullanici_id_fkey;
alter table izin_talepleri
  add constraint izin_talepleri_kullanici_id_fkey
  foreign key (kullanici_id) references kullanicilar(id) on delete restrict;

alter table mesai_kayitlari
  drop constraint if exists mesai_kayitlari_kullanici_id_fkey;
alter table mesai_kayitlari
  add constraint mesai_kayitlari_kullanici_id_fkey
  foreign key (kullanici_id) references kullanicilar(id) on delete restrict;

alter table arac_foto_kayitlari
  drop constraint if exists arac_foto_kayitlari_teknisyen_id_fkey;
alter table arac_foto_kayitlari
  add constraint arac_foto_kayitlari_teknisyen_id_fkey
  foreign key (teknisyen_id) references kullanicilar(id) on delete restrict;

commit;

notify pgrst, 'reload schema';

select conrelid::regclass::text as tablo, confdeltype
from pg_constraint
where conname in (
  'bordrolar_kullanici_id_fkey', 'izin_talepleri_kullanici_id_fkey',
  'mesai_kayitlari_kullanici_id_fkey', 'arac_foto_kayitlari_teknisyen_id_fkey'
)
order by 1;
