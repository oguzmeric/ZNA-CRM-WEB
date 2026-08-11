-- 280 — Mükerrer teklif kaydına DB kapısı (11.08.2026 olayı)
--
-- OLAY: Teklif Detay'da Kaydet'e basıldı, istek 5 saniyelik istemci zaman
-- aşımına takıldı ve "Request timed out" hatası döndü. Oysa INSERT sunucuda
-- TAMAMLANMIŞTI — kesilen yalnızca tarayıcının beklemesiydi. Kullanıcı
-- "kaydedilmedi" sanıp tekrar bastı; butonda hiçbir kilit olmadığı için her
-- tıklama yeni bir INSERT attı. Aynı teklif 7+ kez kaydedildi
-- (TEK-1028…TEK-1038, beşi tek saniye içinde) ve sistem yavaşladı.
--
-- ÜÇ KATMANLI SAVUNMA — bu dosya sonuncusu:
--   1) TeklifDetay.jsx  — senkron `useRef` kilidi + buton disabled
--   2) lib/supabase.js  — yazma isteklerine 25sn bütçe, idle süpürmesinden muaf
--   3) BU TRIGGER       — son savunma: istemci ne yaparsa yapsın DB kabul etmez
--                         (doğrudan API çağrısı, mobil istemci, betik dahil)
--
-- İMZA: kim + hangi firma + hangi satırlar + genel iskonto. Dördü de aynıysa ve
-- arada 60 saniyeden az varsa bu bir tekrar gönderimdir. Aynı kişinin aynı
-- müşteriye birebir aynı içerikli ikinci teklifi bir dakika içinde bilerek
-- kaydetmesi gerçekçi değil; 60sn penceresi sistem yavaşken kuyruğa giren
-- istekleri de kapsayacak kadar geniş tutuldu.
--
-- ⚠️ `genel_toplam` BİLEREK imzanın DIŞINDA: o alanı `trg_teklif_genel_toplam`
-- trigger'ı hesaplıyor ve bu kapı ondan ÖNCE çalışıyor. İstemcinin gönderdiği
-- değerle kayda yazılan değer ayrışırsa imza tutmaz ve kapı sessizce açılırdı.
-- Satırlar + genel iskonto zaten tutarı belirler — türetilmiş alana bağlanma.
--
-- ⚠️ Tekliflerin İÇERİĞİ değişirse (tek satır bile) imza değişir ve kayıt
-- geçer — bu kapı yalnız BİREBİR AYNI gönderimi durdurur, meşru işi engellemez.

begin;

-- Pencere sorgusunun tarama yapmaması için (liste sıralaması da faydalanır)
create index if not exists teklifler_olusturma_tarih_idx
  on public.teklifler (olusturma_tarih desc);

create or replace function public.teklif_mukerrer_engel()
returns trigger
language plpgsql
security definer               -- RLS mükerrer kaydı gizlememeli
set search_path = public, pg_temp
as $$
declare
  v_imza    text;
  v_mevcut  record;
begin
  v_imza := md5(
    coalesce(new.olusturan_id::text, '')            || '|' ||
    coalesce(lower(btrim(new.firma_adi)), '')       || '|' ||
    coalesce(new.genel_iskonto::text, '')           || '|' ||
    coalesce(new.satirlar::text, '')
  );

  select t.id, t.teklif_no
    into v_mevcut
    from public.teklifler t
   where t.olusturma_tarih > now() - interval '60 seconds'
     and md5(
       coalesce(t.olusturan_id::text, '')           || '|' ||
       coalesce(lower(btrim(t.firma_adi)), '')      || '|' ||
       coalesce(t.genel_iskonto::text, '')          || '|' ||
       coalesce(t.satirlar::text, '')
     ) = v_imza
   limit 1;

  if found then
    -- İstemci bu mesajı tanıyor (TeklifDetay.jsx): kullanıcıya hata değil
    -- "zaten kaydedildi" bilgisi gösterip listeye yönlendiriyor.
    raise exception 'mukerrer_teklif: ayni teklif az once kaydedildi (%)', v_mevcut.teklif_no
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.teklif_mukerrer_engel() from anon;

-- ⚠️ İSİM BİLEREK 'tr_aa_' — trigger'lar aynı olay için ALFABETİK sırayla
-- çalışır. Bu kapı, teklif numarası üreten `tr_teklif_no_uret`'ten ÖNCE
-- çalışmalı; yoksa reddedilen her denemede sayaç ilerler ve numara boşluğu
-- oluşur (olay sırasında TEK-1029/1031/1032/1033 böyle kayboldu).
drop trigger if exists tr_aa_teklif_mukerrer_engel on public.teklifler;
create trigger tr_aa_teklif_mukerrer_engel
  before insert on public.teklifler
  for each row execute function public.teklif_mukerrer_engel();

commit;

-- Doğrulama:
--   select tgname from pg_trigger
--    where tgrelid = 'public.teklifler'::regclass and not tgisinternal
--    order by tgname;
--   → tr_aa_teklif_mukerrer_engel  (tr_teklif_no_uret'ten ÖNCE listelenmeli)
