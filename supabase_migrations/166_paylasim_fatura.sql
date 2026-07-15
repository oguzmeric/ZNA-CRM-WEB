-- Fatura Talebi F3: kesilen faturayı müşteriye link ile gönder.
--
-- Fatura PDF'i 'fatura-belge' PRIVATE bucket'ında (fatura hassas belge).
-- Public /p/:token sayfası anon çalışır ve imzalı URL üretemez — SQL'den
-- storage imzalama yapılamaz. Çözüm: imzalı URL GÖNDERİM ANINDA (personel
-- yetkisiyle, belge-paylas edge fn içinde) üretilip link kaydının meta'sına
-- yazılır; public sayfa onu okur. Süre link süresiyle eşitlenir.

-- belge_tipi'ne 'fatura' ekle (042/142/154/156 desenindeki drop+add)
alter table musteri_paylasim_linkleri
  drop constraint if exists musteri_paylasim_linkleri_belge_tipi_check;
alter table musteri_paylasim_linkleri
  add constraint musteri_paylasim_linkleri_belge_tipi_check
  check (belge_tipi in ('teklif', 'servis_raporu', 'demo_tutanak',
                        'bayi_sozlesme', 'satis_sozlesme', 'fatura'));

-- Public okuma — teklif/sözleşme RPC'leriyle aynı desen.
-- SADECE müşterinin görmesi gereken alanlar döner (talep notu, kâr bilgisi,
-- talep eden personel vb. DÖNMEZ).
create or replace function paylasim_fatura_oku(in_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link   record;
  v_talep  record;
begin
  select * into v_link
    from musteri_paylasim_linkleri
   where token = in_token
     and not iptal_edildi
     and son_kullanma > now()
   limit 1;

  if v_link is null or v_link.belge_tipi <> 'fatura' then
    return null;
  end if;

  select * into v_talep from fatura_talepleri where id = v_link.belge_id;
  if v_talep is null or v_talep.durum <> 'faturalandi' then
    return null;
  end if;

  return jsonb_build_object(
    'fatura_no',     v_talep.fatura_no,
    'fatura_tarihi', v_talep.fatura_tarihi,
    'firma_adi',     v_talep.firma_adi,
    'yetkili_adi',   v_talep.yetkili_adi,
    'konu',          v_talep.konu,
    'para_birimi',   v_talep.para_birimi,
    'genel_toplam',  v_talep.genel_toplam,
    'kalemler',      v_talep.kalemler,
    'pdf_ad',        v_talep.fatura_pdf_ad,
    -- İmzalı URL gönderim anında yazıldı (belge-paylas edge fn)
    'pdf_url',       v_link.meta->>'pdf_url'
  );
end;
$$;

revoke all on function paylasim_fatura_oku(text) from public;
grant execute on function paylasim_fatura_oku(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
