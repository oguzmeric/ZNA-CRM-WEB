-- 320 — servis_talep_musteri_onay: musteri_onay kolonu BOOLEAN, 319 metin yazıyordu.
--
-- Canlı E2E testi yakaladı (21.08): "Evet, çözüldü" tıklanınca RPC 42804
-- "column musteri_onay is of type boolean but expression is of type text".
-- Web müşteri sayfası baştan beri 'onaylandi'/'ret' METİN varsayımıyla
-- yazılmıştı; kolon boolean (personel formu yeni talepte false yazar).
-- Semantik: null = onay hiç sorulmadı (portal talebi böyle açılır),
-- true = müşteri çözümü onayladı, false = başlangıç/ret. Ret ayrımı
-- durumdan okunur (ret akışı durumu 'devam_ediyor'a döndürür).

begin;

create or replace function public.servis_talep_musteri_onay(
  p_talep_id bigint,
  p_onay     boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kul public.kullanicilar;
  v_gecmis_kaydi jsonb;
begin
  v_kul := public._portal_talep_yetki(p_talep_id);

  v_gecmis_kaydi := jsonb_build_object(
    'durum',      case when p_onay then 'tamamlandi' else 'devam_ediyor' end,
    'tarih',      to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'kullaniciAd', v_kul.ad,
    'aciklama',   case when p_onay then 'Müşteri çözümü onayladı'
                       else 'Müşteri sorunun devam ettiğini bildirdi' end
  );

  update public.servis_talepleri
     set musteri_onay      = p_onay,
         durum             = case when p_onay then durum else 'devam_ediyor' end,
         durum_gecmisi     = coalesce(durum_gecmisi, '[]'::jsonb) || v_gecmis_kaydi,
         guncelleme_tarihi = now()
   where id = p_talep_id;
end;
$$;

commit;

notify pgrst, 'reload schema';
