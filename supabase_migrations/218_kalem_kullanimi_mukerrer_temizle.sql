-- 218 — servis_kalem_kullanimi mükerrer kayıt temizliği + cihaz başına TEK satır.
--
-- KÖK NEDEN (2026-07-21): Mobil "Sahada Kullan" (MalzemeKullanScreen) her
-- dokunuşta YENİ 'kullanildi' satırı ekliyordu (upsert değil) ve tekrar dokunmaya
-- karşı korumasızdı → aynı cihaz (kalem) bir serviste 5× teslim_alindi + 5×
-- kullanildi olarak birikti (31 satır / 8 gerçek cihaz). "Teknisyen Envanterinden
-- Düşenler" kartında 28 mükerrer satır olarak görünüyordu.
--
-- ÇÖZÜM: (1) mükerrerleri temizle — cihaz başına EN İLERİ statüde tek satır tut,
-- (2) unique index (servis_talep_id, kalem_id) — çift tık/eşzamanlı da tek satır,
-- (3) plan sayaçlarını (teslim/kullanılan) tekilleştirilmiş veriden yeniden say.
-- İstemci tarafı ayrıca upsert + guard ile düzeltildi (EAS).

begin;

-- 1) MÜKERRER TEMİZLİK — (servis, kalem) başına tek satır:
--    kullanildi (3) > teslim_edildi (2) > teslim_alindi (1) > diğer; sonra en yeni.
with siralanmis as (
  select id,
    row_number() over (
      partition by servis_talep_id, kalem_id
      order by (case durum
                  when 'kullanildi'   then 3
                  when 'teslim_edildi' then 2
                  when 'teslim_alindi' then 1
                  else 0 end) desc,
               tarih desc nulls last, id desc
    ) as rn
  from servis_kalem_kullanimi
)
delete from servis_kalem_kullanimi
 where id in (select id from siralanmis where rn > 1);

-- 2) Cihaz başına tek satır garantisi
create unique index if not exists servis_kalem_kullanimi_servis_kalem_uq
  on servis_kalem_kullanimi (servis_talep_id, kalem_id);

-- 3) Plan sayaçlarını tekilleştirilmiş veriden yeniden hesapla (yalnız S/N planlar).
--    teslim_alinan = teslim_alindi + kullanildi (kullanılan da teslim alınmıştır);
--    kullanilan   = kullanildi.
update servis_malzeme_plani p
   set teslim_alinan_miktar = coalesce(s.teslim, 0),
       kullanilan_miktar    = coalesce(s.kullanildi, 0)
  from (
    select plan_id,
           count(*) filter (where durum in ('teslim_alindi', 'kullanildi', 'teslim_edildi')) as teslim,
           count(*) filter (where durum in ('kullanildi', 'teslim_edildi')) as kullanildi
      from servis_kalem_kullanimi
     where plan_id is not null
     group by plan_id
  ) s
 where p.id = s.plan_id
   and coalesce(p.tip, 'seri') <> 'bulk';

commit;

notify pgrst, 'reload schema';
select 'MIG 218 OK — kalem kullanimi mukerrer temizlendi + unique + sayac' as sonuc;
