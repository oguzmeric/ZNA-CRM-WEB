-- Müşteri, SMS/mail ile gelen paylaşım linkinden teklife cevap verebilsin.
-- (Sayfa şimdiye kadar tamamen read-only'di; müşteri "onaylıyorum" diyemiyordu.)
--
-- Güvenlik modeli: linke sahip olan cevap verebilir (tokenın kendisi yetkidir —
-- paylasim_teklif_oku ile aynı model). Ek olarak müşteri adını yazıp yetkili
-- olduğunu beyan eder; ad + tarih + IP link kaydının meta'sına yazılır, böylece
-- sonradan "kim onayladı" sorusu cevaplanabilir.
--
-- anon çağırabilmeli (müşterinin oturumu yok) — bu yüzden fonksiyon dar kapsamlı:
-- sadece token'ın işaret ettiği teklifin durumunu ilerletir, başka hiçbir şey
-- okumaz/yazmaz ve teklif verisi DÖNDÜRMEZ.

create or replace function paylasim_teklif_musteri_karar(
  in_token text,
  in_karar text,
  in_ad    text,
  in_not   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link       record;
  v_teklif     record;
  v_durum      text;
  v_yeni       text;
  v_onay_durum text;
  v_ad         text := btrim(coalesce(in_ad, ''));
  v_not        text := nullif(btrim(coalesce(in_not, '')), '');
  v_ip         text;
  v_alici      bigint;
  v_baslik     text;
begin
  if in_karar not in ('onayladi', 'revizyon', 'reddetti') then
    return jsonb_build_object('ok', false, 'mesaj', 'Geçersiz karar.');
  end if;
  if length(v_ad) < 2 then
    return jsonb_build_object('ok', false, 'mesaj', 'Lütfen adınızı ve soyadınızı yazın.');
  end if;

  select * into v_link
    from musteri_paylasim_linkleri
   where token = in_token
     and not iptal_edildi
     and son_kullanma > now()
   limit 1;

  if v_link is null or v_link.belge_tipi <> 'teklif' then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu bağlantı geçersiz ya da süresi dolmuş.');
  end if;

  select * into v_teklif from teklifler where id = v_link.belge_id;
  if v_teklif is null then
    return jsonb_build_object('ok', false, 'mesaj', 'Teklif bulunamadı.');
  end if;

  -- Etkin durum: spek_durum öncelikli, yoksa eski kolonlardan çıkarım
  -- (src/lib/teklifDurumlari.js -> tekliftenDurum ile aynı mantık)
  if coalesce(btrim(v_teklif.spek_durum), '') <> '' then
    v_durum := v_teklif.spek_durum;
  else
    v_durum := case v_teklif.onay_durumu
      when 'kabul'      then 'musteri_onayladi'
      when 'vazgecildi' then 'musteri_reddetti'
      when 'revizyon'   then 'revizyon_istendi'
      else case when v_teklif.teklif_onayi->>'durum' = 'onayli'
                then 'yon_onayladi' else 'yon_onay_bekliyor' end
    end;
  end if;

  -- Zaten karar verilmişse tekrar yazma (link tekrar açılabilir / çift tık)
  if v_durum in ('musteri_onayladi', 'musteri_reddetti', 'revizyon_istendi', 'siparise_aktarildi') then
    return jsonb_build_object('ok', true, 'zaten', true, 'durum', v_durum,
                              'mesaj', 'Bu teklif için cevabınız daha önce alınmış.');
  end if;

  -- Yalnız müşteriye ulaşmış tekliflere cevap verilebilir
  if v_durum not in ('yon_onayladi', 'musteriye_gonderildi', 'musteri_onay_bekliyor') then
    return jsonb_build_object('ok', false, 'mesaj', 'Bu teklif şu anda cevaba açık değil.');
  end if;

  -- durumdanDbAlanlar() eşleniği — iki kolon birlikte yazılır
  if in_karar = 'onayladi' then
    v_yeni := 'musteri_onayladi'; v_onay_durum := 'kabul';
  elsif in_karar = 'reddetti' then
    v_yeni := 'musteri_reddetti'; v_onay_durum := 'vazgecildi';
  else
    v_yeni := 'revizyon_istendi'; v_onay_durum := 'revizyon';
  end if;

  update teklifler
     set spek_durum = v_yeni,
         onay_durumu = v_onay_durum,
         kabul_tarihi = case when in_karar = 'onayladi' then now() else kabul_tarihi end,
         kabul_eden   = case when in_karar = 'onayladi' then v_ad else kabul_eden end
   where id = v_teklif.id;

  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := null;
  end;

  -- Kim, ne zaman, hangi link üzerinden — audit
  update musteri_paylasim_linkleri
     set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
           'musteri_karari', in_karar,
           'karar_tarihi',   now(),
           'karar_veren_ad', v_ad,
           'karar_notu',     v_not,
           'karar_ip',       nullif(v_ip, '')
         )
   where id = v_link.id;

  -- Teklifi hazırlayana bildirim (bildirimler INSERT -> trigger -> Expo push)
  select id into v_alici
    from kullanicilar
   where tip = 'zna'
     and tr_kucuk(btrim(ad)) = tr_kucuk(btrim(coalesce(v_teklif.hazirlayan, '')))
   limit 1;
  if v_alici is null then
    v_alici := nullif(v_teklif.teklif_onayi->>'gonderen_id', '')::bigint;
  end if;

  if v_alici is not null then
    v_baslik := case in_karar
      when 'onayladi' then 'Müşteri teklifi ONAYLADI'
      when 'reddetti' then 'Müşteri teklifi reddetti'
      else 'Müşteri revizyon istedi'
    end;
    insert into bildirimler (alici_id, baslik, mesaj, tip, link, meta)
    values (
      v_alici,
      v_baslik || ' — ' || coalesce(v_teklif.teklif_no, '#' || v_teklif.id),
      coalesce(v_teklif.firma_adi, '') || ' · ' || v_ad ||
        case when v_not is not null then ' — "' || v_not || '"' else '' end,
      case in_karar when 'onayladi' then 'basari' when 'reddetti' then 'hata' else 'uyari' end,
      '/teklifler/' || v_teklif.id,
      jsonb_build_object('kaynak', 'paylasim_linki', 'teklif_id', v_teklif.id, 'karar', in_karar)
    );
  end if;

  return jsonb_build_object('ok', true, 'zaten', false, 'durum', v_yeni,
                            'mesaj', 'Cevabınız alındı.');
end;
$$;

revoke all on function paylasim_teklif_musteri_karar(text, text, text, text) from public;
grant execute on function paylasim_teklif_musteri_karar(text, text, text, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
