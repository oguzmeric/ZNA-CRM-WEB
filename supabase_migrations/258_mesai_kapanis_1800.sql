-- 258 — Otomatik mesai kapanışı: bitiş saati 18:00 yazılır (cron yine 18:30'da)
--
-- İŞ KURALI (04.08 karar): Mesai fiilen 18:00'de biter. 18:00-18:30 arası,
-- kişinin fazla mesaiye kalıp kalmayacağının KARARLAŞTIRILDIĞI tampondur ve
-- mesaiden sayılmaz. Cron 18:30'da çalışmaya devam eder (tampon bitmiş olsun
-- diye) ama kayda bitiş=18:00 ve süre=18:00'e göre yazılır.
--
-- İSTİSNA: girişi 18:00'den SONRA olan kayıtlar (18:00-18:30 arası giriş
-- serbest; 19:00+ fazla mesai). Bunlara 18:00 yazılamaz — girişten önce olur,
-- süre negatife düşerdi. Onlarda eski davranış (kapatma anı) sürer.
--
-- Ayrıca dünün (03.08.2026) otomatik kapanan 10 kaydı geriye dönük 18:00'e
-- çekilir (kullanıcı isteği). Değerler uygulanmadan önce canlıdan okundu:
-- 10 kayıt, girişler 09:09-11:08, hepsi cikis=18:30 / "Otomatik kapatıldı".

begin;

create or replace function public.mesai_otomatik_kapat()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  etkilenen integer;
begin
  update mesai_kayitlari
     set cikis_zamani = kapanis,
         sure_dakika  = greatest(0, (extract(epoch from (kapanis - giris_zamani)) / 60)::integer),
         not_ = case
                  when coalesce(not_, '') = '' then kapanis_notu
                  else not_ || ' | ' || kapanis_notu
                end
    from (
      select m.id as mid,
             -- Giriş gününün 18:00'i (TR). Türkiye kalıcı UTC+3; Europe/Istanbul
             -- tzdata'sı da aynı sonucu verir ve okunaklıdır.
             case
               when hedef.t > m.giris_zamani
                 -- least(now(): fonksiyon 18:00'den ÖNCE elle çalıştırılırsa
                 -- geleceğe tarihli çıkış yazmasın (test/acil kapatma durumu).
                 then least(now(), hedef.t)
               else now()   -- 18:00 sonrası girişler: eski davranış
             end as kapanis,
             case
               when hedef.t > m.giris_zamani and hedef.t <= now()
                 then 'Otomatik kapatıldı (bitiş 18:00)'
               else 'Otomatik kapatıldı (18:30)'
             end as kapanis_notu
        from mesai_kayitlari m
        cross join lateral (
          select ((m.giris_zamani at time zone 'Europe/Istanbul')::date
                  + time '18:00') at time zone 'Europe/Istanbul' as t
        ) hedef
       where m.cikis_zamani is null
    ) h
   where mesai_kayitlari.id = h.mid;

  get diagnostics etkilenen = row_count;
  return etkilenen;
end;
$$;

revoke all on function public.mesai_otomatik_kapat() from public;
revoke all on function public.mesai_otomatik_kapat() from anon;
grant execute on function public.mesai_otomatik_kapat() to authenticated;
grant execute on function public.mesai_otomatik_kapat() to service_role;

-- ── Geriye dönük: 03.08.2026 kayıtları bitiş 18:00'e çekilir ────────────────
-- İdempotent: çıkışı zaten 18:00 olan satırda koşul tutmaz, ikinci çalıştırma
-- hiçbir şey değiştirmez. Yalnız otomatik kapananlara dokunur (elle kapatılan
-- olsaydı karışmazdık; dünkü dökümde 10/10 otomatikti).
update mesai_kayitlari
   set cikis_zamani = (date '2026-08-03' + time '18:00') at time zone 'Europe/Istanbul',
       sure_dakika  = greatest(0, (extract(epoch from (
                        ((date '2026-08-03' + time '18:00') at time zone 'Europe/Istanbul')
                        - giris_zamani)) / 60)::integer),
       not_ = replace(not_, 'Otomatik kapatıldı (18:30)', 'Otomatik kapatıldı (bitiş 18:00)')
 where (giris_zamani at time zone 'Europe/Istanbul')::date = date '2026-08-03'
   and coalesce(not_, '') like '%Otomatik kapatıldı (18:30)%'
   and cikis_zamani > (date '2026-08-03' + time '18:00') at time zone 'Europe/Istanbul'
   and giris_zamani < (date '2026-08-03' + time '18:00') at time zone 'Europe/Istanbul';

-- Doğrulama: dünün kayıtları yeni değerleriyle
select k.ad || ': ' || to_char(m.giris_zamani at time zone 'Europe/Istanbul', 'HH24:MI')
       || ' → ' || to_char(m.cikis_zamani at time zone 'Europe/Istanbul', 'HH24:MI')
       || '  sure=' || m.sure_dakika || 'dk' as bilgi
from mesai_kayitlari m join kullanicilar k on k.id = m.kullanici_id
where (m.giris_zamani at time zone 'Europe/Istanbul')::date = date '2026-08-03'
order by k.ad;

commit;
