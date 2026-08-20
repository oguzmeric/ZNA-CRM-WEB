-- 317 — Bağımsız SN havuzundan stok koduna TOPLU atama
--
-- İhtiyaç (20.08): SN'siz ürünler için ZNA barkodları üretiliyor (bagimsiz_snler,
-- mig 220/288) ve etiket basılıyor. Şimdiye kadar bu etiketler ancak okuyucuyla
-- tek tek okutularak stok kalemine giriyordu. Artık ekrandan SEÇİLİP bir stok
-- koduna topluca atanabilecek.
--
-- TASARIM İLKELERİ (önceki derslerden):
--   • Stok defterine BURADA YAZILMAZ — trg_kalem_to_stok_hareket, 'depoda'
--     insert'inde 1'lik giriş hareketini kendisi yazar (tek kaynak,
--     reference_stok_hareket_tek_kaynak; çift kayıt vakası yaşandı).
--   • Benzersizlik DB'de: stok_kalemleri_seri_no_aktif_uq (silindi=false).
--     RPC yine de önden kontrol edip atlananı SEBEPLİ raporlar — kullanıcı
--     "12 seçtim 10 eklendi" değil "2'si neden atlandı" görür (sessiz hata
--     kontrol listesi md.1).
--   • Kısmi sonuç ŞEFFAF: beklenen engeller (stokta var / cihaza atanmış /
--     zaten atanmış) exception DEĞİL rapor satırıdır; beklenmeyen hata ise
--     her şeyi geri alır (tek transaction).
--   • Yetki kapısı RPC İÇİNDE de var (SECURITY DEFINER, bkz.
--     reference_rls_returning_tuzagi — sessiz boş dönüş yerine net hata).

-- ── 1) Havuzda "stokta kullanıldı" izi ───────────────────────────────────
-- Bu kolonlar OLMADAN aynı barkod iki kez atanabilirdi (havuz listesi
-- kullanılmışı ayırt edemezdi).
alter table public.bagimsiz_snler
  add column if not exists stok_kalemi_id    bigint references public.stok_kalemleri(id) on delete set null,
  add column if not exists stoga_atama_tarih timestamptz;

comment on column public.bagimsiz_snler.stok_kalemi_id is
  'Bu SN bir stok kalemine atandıysa kalem id''si. Havuzda "atanabilir" = '
  'stok_kalemi_id IS NULL AND cihaz_id IS NULL. mig 317.';

create index if not exists idx_bagimsiz_sn_atanabilir
  on public.bagimsiz_snler (olusturma_tarih desc)
  where stok_kalemi_id is null and cihaz_id is null;

-- ── 2) BACKFILL: geçmişte okuyucuyla stok kalemine girmiş SN'leri bağla ──
-- Yoksa yıllardır kullanılmış barkodlar havuzda "atanabilir" görünür ve
-- ikinci kez atanmaya çalışılıp kafa karıştırırdı.
with eslesme as (
  select b.id as bsn_id, k.id as kalem_id
  from public.bagimsiz_snler b
  join public.stok_kalemleri k
    on k.seri_no = b.seri_no and k.silindi = false
  where b.stok_kalemi_id is null
)
update public.bagimsiz_snler b
   set stok_kalemi_id = e.kalem_id
  from eslesme e
 where b.id = e.bsn_id;

-- ── 3) Atama RPC'si ──────────────────────────────────────────────────────
create or replace function public.bagimsiz_sn_stoga_ata(
  p_ids       bigint[],
  p_stok_kodu text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_urun     record;
  v_sn       record;
  v_kalem_id bigint;
  v_eklenen  int := 0;
  v_atlanan  jsonb := '[]'::jsonb;
begin
  -- Yetki: stok yazma is_staff() kapısından geçer (tablo RLS'iyle aynı kapı)
  if not public.is_staff() then
    raise exception 'Bu islem icin yetkiniz yok.' using errcode = 'insufficient_privilege';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Atanacak SN secilmedi.' using errcode = 'invalid_parameter_value';
  end if;
  if array_length(p_ids, 1) > 500 then
    raise exception 'Tek seferde en fazla 500 SN atanabilir.' using errcode = 'invalid_parameter_value';
  end if;

  select stok_kodu, stok_adi, marka into v_urun
    from public.stok_urunler
   where stok_kodu = p_stok_kodu
   limit 1;
  if v_urun.stok_kodu is null then
    raise exception 'Stok kodu bulunamadi: %', p_stok_kodu using errcode = 'no_data_found';
  end if;

  -- FOR UPDATE: aynı SN'leri iki kullanıcı aynı anda atmaya kalkarsa ikincisi
  -- bekler ve güncel durumu görür (yarışta çift kalem yerine sebepli atlama).
  for v_sn in
    select id, seri_no, cihaz_id, stok_kalemi_id
      from public.bagimsiz_snler
     where id = any(p_ids)
     order by id
       for update
  loop
    if v_sn.stok_kalemi_id is not null then
      v_atlanan := v_atlanan || jsonb_build_object('seri_no', v_sn.seri_no, 'sebep', 'zaten stok kalemine atanmış');
      continue;
    end if;
    if v_sn.cihaz_id is not null then
      v_atlanan := v_atlanan || jsonb_build_object('seri_no', v_sn.seri_no, 'sebep', 'müşteri cihazına bağlı');
      continue;
    end if;
    if exists (select 1 from public.stok_kalemleri k
                where k.seri_no = v_sn.seri_no and k.silindi = false) then
      -- Backfill sonrası nadir: elle/okuyucuyla az önce girilmiş olabilir.
      v_atlanan := v_atlanan || jsonb_build_object('seri_no', v_sn.seri_no, 'sebep', 'bu seri no stokta zaten kayıtlı');
      continue;
    end if;

    -- SnEkleModal ile AYNI davranış: durum='depoda', marka + model ürün
    -- kartından. Defteri trg_kalem_to_stok_hareket yazar — buraya hareket
    -- insert'i EKLEME (çift kayıt olur).
    insert into public.stok_kalemleri (stok_kodu, seri_no, durum, marka, model)
    values (p_stok_kodu, v_sn.seri_no, 'depoda', v_urun.marka, v_urun.stok_adi)
    returning id into v_kalem_id;

    update public.bagimsiz_snler
       set stok_kalemi_id = v_kalem_id,
           stoga_atama_tarih = now(),
           stok_kodu = coalesce(stok_kodu, p_stok_kodu)
     where id = v_sn.id;

    v_eklenen := v_eklenen + 1;
  end loop;

  -- Seçilen id'lerden havuzda hiç bulunamayanlar da raporlansın
  if v_eklenen + jsonb_array_length(v_atlanan) < array_length(p_ids, 1) then
    v_atlanan := v_atlanan || jsonb_build_object(
      'seri_no', '(' || (array_length(p_ids,1) - v_eklenen - jsonb_array_length(v_atlanan))::text || ' kayıt)',
      'sebep', 'havuzda bulunamadı');
  end if;

  return jsonb_build_object('eklenen', v_eklenen, 'atlanan', v_atlanan);
end;
$$;

revoke all on function public.bagimsiz_sn_stoga_ata(bigint[], text) from public, anon;
grant execute on function public.bagimsiz_sn_stoga_ata(bigint[], text) to authenticated;

comment on function public.bagimsiz_sn_stoga_ata(bigint[], text) is
  'Bağımsız SN havuzundan seçilen barkodları bir stok koduna atar: her SN için '
  'stok_kalemleri''ne depoda kalemi açar (defteri köprü trigger yazar) ve havuz '
  'satırını bağlar. Kısmi sonuç döner: {eklenen, atlanan:[{seri_no, sebep}]}. mig 317.';

-- Doğrulama çıktısı
select
  (select count(*) from public.bagimsiz_snler) as havuz_toplam,
  (select count(*) from public.bagimsiz_snler where stok_kalemi_id is not null) as backfill_baglanan,
  (select count(*) from public.bagimsiz_snler where stok_kalemi_id is null and cihaz_id is null) as atanabilir;
