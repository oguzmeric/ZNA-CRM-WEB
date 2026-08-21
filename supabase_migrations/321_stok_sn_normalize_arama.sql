-- 321 — SN okutmada NORMALIZE arama (21.08, depocu Salih bildirimi).
--
-- SORUN: "bilgisayardan eklenen ürünler telefondan okutulunca görünmüyor".
-- Ölçüldü: silinme YOK (silindi_null 0, son 7 gün kayıpsız); kök İKİ yapısal
-- uyumsuzluk: (1) stok_kalemleri'nde 203 kayıt TİRELİ seri_no taşıyor, mobil
-- kalemAra yalnız birebir (eq) + kasa-duyarsız TAM (ilike) eşleşme arıyor —
-- etiketten tiresiz okunan kod tireli kaydı BULAMIYOR; (2) /arizali-urunler
-- webde musteri_cihazlari'na yazıyor, telefonun stok taraması oraya ikincil
-- ve kırılgan bakıyor.
--
-- ÇÖZÜM: iki tabloya da NORMALIZE anahtarla (upper + alfasayısal-dışı at)
-- bakan tek arama fonksiyonu. Veri DÜZELTİLMEZ: tireli SN üreticinin meşru
-- formatı olabilir — görüntü değişmez, arama dayanıklı olur.
-- Tablo boyutları (4k + ~binlerce) regexp taramasını ms'de tutar; büyürse
-- ifade indeksi eklenir.

begin;

create or replace function public.stok_sn_ara(p_kod text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_anahtar text;
  v_kayit jsonb;
begin
  v_anahtar := regexp_replace(upper(coalesce(p_kod, '')), '[^A-Z0-9]', '', 'g');
  if length(v_anahtar) < 4 then
    return null;   -- çok kısa anahtar her şeyle eşleşir — güvenli değil
  end if;

  -- 1) Stok kalemi (aktif)
  select to_jsonb(k) into v_kayit
    from public.stok_kalemleri k
   where coalesce(k.silindi, false) = false
     and (
       regexp_replace(upper(coalesce(k.seri_no, '')), '[^A-Z0-9]', '', 'g') = v_anahtar
       or regexp_replace(upper(coalesce(k.barkod, '')), '[^A-Z0-9]', '', 'g') = v_anahtar
     )
   order by k.id desc
   limit 1;
  if v_kayit is not null then
    return jsonb_build_object('kaynak', 'stok', 'kayit', v_kayit);
  end if;

  -- 2) Müşteri cihazı (/arizali-urunler webde buraya yazar)
  select to_jsonb(c) into v_kayit
    from public.musteri_cihazlari c
   where regexp_replace(upper(coalesce(c.seri_no, '')), '[^A-Z0-9]', '', 'g') = v_anahtar
   order by c.id desc
   limit 1;
  if v_kayit is not null then
    return jsonb_build_object('kaynak', 'cihaz', 'kayit', v_kayit);
  end if;

  return null;
end;
$$;

-- SECURITY DEFINER bilinçli: fonksiyon iki tabloda da yalnız SELECT yapar ve
-- personel RLS'i zaten bu tablolara tam okuma verir; portal müşterisine
-- AÇILMAZ — yalnız authenticated personel akışları çağırır, anon kapalı.
revoke all on function public.stok_sn_ara(text) from public, anon;
grant execute on function public.stok_sn_ara(text) to authenticated;

commit;

notify pgrst, 'reload schema';
