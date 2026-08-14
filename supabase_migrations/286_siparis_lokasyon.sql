-- 286 — Siparişe LOKASYON alanı
--
-- İŞ SORUNU (14.08.2026, kullanıcı): Tedarikçiden gelen fatura sipariş numarasıyla
-- eşleştiriliyor; firmanın birden fazla lokasyonu (şubesi) varsa siparişin hangi
-- lokasyona ait olduğu HİÇBİR YERDE yazmıyor.
--
-- CANLI ÖLÇÜM (uygulanmadan önce):
--   • siparisler ve teklifler tablolarında lokasyon alanı YOK. Lokasyon yalnız
--     on_siparisler / gorusmeler / kesifler / gorevler / toplu_bakimlar'da var.
--   • 218 lokasyon / 16 müşteri; 9 firma çok lokasyonlu (Başakşehir Bel. 84,
--     Bayrampaşa 54, Başakkent 43, Element 10, Turkuaz 6).
--   • 48 siparişin 31'i çok lokasyonlu müşteriye ait.
--   • Tedarikçi faturası yüklenmiş 12 siparişin 12'si de çok lokasyonlu müşteriye ait
--     → sorun teorik değil, faturalı işlerin TAMAMINI kapsıyor.
--   • Kaynak zincirinden (ön sipariş / görüşme) yalnız 8 sipariş türetilebiliyor
--     (on_siparisler 33 kaydın 9'unda, gorusmeler 3601 kaydın 133'ünde lokasyon dolu)
--     → otomatik türetme TEK BAŞINA yetmez, alan elle de seçilebilmeli.
--
-- Kolon adı ve tipi diğer modüllerle aynı: lokasyon_id bigint, on delete set null
-- (gorusmeler/kesifler/on_siparisler/gorevler/toplu_bakimlar hepsi böyle).

begin;

alter table siparisler
  add column if not exists lokasyon_id bigint
    references musteri_lokasyonlari(id) on delete set null;

comment on column siparisler.lokasyon_id is
  'Siparişin ait olduğu müşteri lokasyonu (şube). Tedarikçi faturası eşleştirmesinde
   hangi şubeye ait olduğunu görmek için (14.08.2026).';

create index if not exists idx_siparisler_lokasyon on siparisler(lokasyon_id)
  where lokasyon_id is not null;

-- ── Tutarlılık kapısı ───────────────────────────────────────────────────────
-- Lokasyon BAŞKA müşterinin lokasyonu olamaz. İstemci tarafı zaten müşteriye
-- göre filtrelenmiş liste gösterir ama kapı SUNUCUDA olmalı: müşteri sonradan
-- değiştirilirse ya da başka bir yol yazarsa sessizce yanlış şube bağlanırdı.
create or replace function public.siparis_lokasyon_dogrula()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  lok_musteri bigint;
begin
  if new.lokasyon_id is null then
    return new;
  end if;

  select musteri_id into lok_musteri
    from musteri_lokasyonlari where id = new.lokasyon_id;

  if lok_musteri is distinct from new.musteri_id then
    raise exception 'Lokasyon bu müşteriye ait değil (lokasyon %, sipariş müşterisi %)',
      new.lokasyon_id, new.musteri_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_siparis_lokasyon_dogrula on siparisler;
create trigger tr_siparis_lokasyon_dogrula
  before insert or update of lokasyon_id, musteri_id on siparisler
  for each row execute function public.siparis_lokasyon_dogrula();

-- ── Geçmiş siparişler: kaynak zincirinden doldur ────────────────────────────
-- Öncelik: ön sipariş > görüşme > teklifin görüşmesi. Yalnız BOŞ olanlara yazar
-- (idempotent) ve lokasyonun müşterisi tutuyorsa — tutmuyorsa dokunmaz, çünkü
-- yanlış şube yazmak hiç yazmamaktan kötüdür.
update siparisler s
   set lokasyon_id = k.lok
  from (
    select s2.id,
           coalesce(
             (select o.lokasyon_id  from on_siparisler o where o.id = s2.on_siparis_id),
             (select g.lokasyon_id  from gorusmeler   g where g.id = s2.gorusme_id),
             (select g2.lokasyon_id from teklifler t
                join gorusmeler g2 on g2.id = t.gorusme_id
               where t.id = s2.teklif_id)
           ) as lok
      from siparisler s2
     where s2.lokasyon_id is null
  ) k
 where s.id = k.id
   and k.lok is not null
   and exists (select 1 from musteri_lokasyonlari ml
                where ml.id = k.lok and ml.musteri_id = s.musteri_id);

-- Doğrulama: kaç sipariş dolduruldu, kaçı hâlâ boş (çok lokasyonlu müşterilerde)
select 'lokasyonu DOLU sipariş: ' || count(*) filter (where lokasyon_id is not null)
    || ' | çok lokasyonlu müşteride BOŞ kalan: ' || count(*) filter (
         where lokasyon_id is null
           and musteri_id in (select musteri_id from musteri_lokasyonlari
                              group by musteri_id having count(*) > 1))
    as sonuc
from siparisler;

commit;

-- PostgREST'in yeni kolonu görmesi için şema yenileme
notify pgrst, 'reload schema';
