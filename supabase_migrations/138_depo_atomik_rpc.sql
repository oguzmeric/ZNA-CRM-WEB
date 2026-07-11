-- Atomik depo işlemleri (2026-07-12).
-- Sorun: arıza/RMA akışları client'ta 2-3 ayrı sorguydu — ilk adım geçip
-- ikincisi patlarsa kalem durumu değişmiş ama kayıt/audit satırı yok kalıyordu.
-- Çözüm: her akış tek plpgsql fonksiyonu = tek transaction.
-- SECURITY INVOKER — RLS aynen uygulanır (client zaten bu tablolara staff
-- policy'leriyle yazabiliyordu, yetki genişletmesi yok).

-- ── Arıza işaretle: kalem durumu + arıza kaydı + hareket ──────────────
create or replace function sn_ariza_isaretle_atomik(
  in_kalem_id       bigint,
  in_yeni_durum     text,               -- 'arizali_depoda' | 'arizada'
  in_sebep          text,
  in_sebep_ad       text default null,  -- hareket açıklaması için okunur ad
  in_aciklama       text default null,
  in_teknisyen_id   bigint default null,
  in_musteri_id     bigint default null,
  in_olusturan_id   bigint default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_kalem stok_kalemleri%rowtype;
  v_kayit stok_ariza_kayitlari%rowtype;
begin
  update stok_kalemleri set durum = in_yeni_durum
   where id = in_kalem_id
   returning * into v_kalem;
  if not found then
    raise exception 'Stok kalemi bulunamadı: %', in_kalem_id;
  end if;

  insert into stok_ariza_kayitlari
    (stok_kalem_id, sebep, aciklama, geldigi_teknisyen_id, geldigi_musteri_id, olusturan_id)
  values
    (in_kalem_id, in_sebep, nullif(in_aciklama, ''), in_teknisyen_id, in_musteri_id, in_olusturan_id)
  returning * into v_kayit;

  insert into stok_hareketleri (stok_kodu, stok_adi, hareket_tipi, miktar, aciklama, tarih, kullanici_id)
  values (
    v_kalem.stok_kodu,
    coalesce(v_kalem.marka, v_kalem.model),
    'ariza', 1,
    'SN arızalı: ' || coalesce(v_kalem.seri_no, '?') || ' — ' || coalesce(in_sebep_ad, in_sebep),
    now(), in_olusturan_id
  );

  return jsonb_build_object('kalem', to_jsonb(v_kalem), 'kayit', to_jsonb(v_kayit));
end;
$$;

-- ── RMA oluştur: kalem 'tamirde' + RMA kaydı + hareket ────────────────
create or replace function sn_rma_olustur_atomik(
  in_kalem_id      bigint,
  in_tedarikci_ad  text,
  in_kargo_no      text default null,
  in_tahmini_donus date default null,
  in_notlar        text default null,
  in_olusturan_id  bigint default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_kalem stok_kalemleri%rowtype;
  v_rma   stok_rma_kayitlari%rowtype;
begin
  update stok_kalemleri set durum = 'tamirde'
   where id = in_kalem_id
   returning * into v_kalem;
  if not found then
    raise exception 'Stok kalemi bulunamadı: %', in_kalem_id;
  end if;

  insert into stok_rma_kayitlari (stok_kalem_id, tedarikci_ad, kargo_no, tahmini_donus, notlar, olusturan_id)
  values (in_kalem_id, in_tedarikci_ad, nullif(in_kargo_no, ''), in_tahmini_donus, nullif(in_notlar, ''), in_olusturan_id)
  returning * into v_rma;

  insert into stok_hareketleri (stok_kodu, stok_adi, hareket_tipi, miktar, aciklama, tarih, kullanici_id)
  values (
    v_kalem.stok_kodu, v_kalem.marka, 'rma_cikis', 1,
    'Servise gönderildi: ' || coalesce(v_kalem.seri_no, '?') || ' → ' || in_tedarikci_ad
      || case when nullif(in_kargo_no, '') is not null then ' (kargo: ' || in_kargo_no || ')' else '' end,
    now(), in_olusturan_id
  );

  return jsonb_build_object('kalem', to_jsonb(v_kalem), 'rma', to_jsonb(v_rma));
end;
$$;

-- ── RMA dönüş: kayıt sonucu + kalem durumu + hareket ──────────────────
create or replace function sn_rma_donus_atomik(
  in_rma_id       bigint,
  in_sonuc        text,               -- onarildi | degistirildi | red | iptal
  in_sonuc_ad     text default null,
  in_notlar       text default null,
  in_yeni_durum   text default null,  -- null → sonuca göre otomatik (red=hurda, diğer=depoda)
  in_olusturan_id bigint default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_rma   stok_rma_kayitlari%rowtype;
  v_kalem stok_kalemleri%rowtype;
  v_durum text;
begin
  update stok_rma_kayitlari
     set sonuc = in_sonuc,
         notlar = nullif(in_notlar, ''),
         geri_donus_tarih = now()
   where id = in_rma_id
   returning * into v_rma;
  if not found then
    raise exception 'RMA kaydı bulunamadı: %', in_rma_id;
  end if;

  v_durum := coalesce(in_yeni_durum, case when in_sonuc = 'red' then 'hurda' else 'depoda' end);

  update stok_kalemleri set durum = v_durum
   where id = v_rma.stok_kalem_id
   returning * into v_kalem;

  insert into stok_hareketleri (stok_kodu, stok_adi, hareket_tipi, miktar, aciklama, tarih, kullanici_id)
  values (
    v_kalem.stok_kodu, v_kalem.marka, 'rma_giris', 1,
    'Servisten döndü: ' || coalesce(v_kalem.seri_no, '?') || ' — ' || coalesce(in_sonuc_ad, in_sonuc),
    now(), in_olusturan_id
  );

  return jsonb_build_object('rma', to_jsonb(v_rma), 'kalem', to_jsonb(v_kalem));
end;
$$;

-- Anon'a gerek yok (dahili depo işlemi)
revoke execute on function sn_ariza_isaretle_atomik(bigint, text, text, text, text, bigint, bigint, bigint) from public, anon;
revoke execute on function sn_rma_olustur_atomik(bigint, text, text, date, text, bigint) from public, anon;
revoke execute on function sn_rma_donus_atomik(bigint, text, text, text, text, bigint) from public, anon;
grant execute on function sn_ariza_isaretle_atomik(bigint, text, text, text, text, bigint, bigint, bigint) to authenticated, service_role;
grant execute on function sn_rma_olustur_atomik(bigint, text, text, date, text, bigint) to authenticated, service_role;
grant execute on function sn_rma_donus_atomik(bigint, text, text, text, text, bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
