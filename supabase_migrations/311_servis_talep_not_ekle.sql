-- 311 — Servis talebine NOT EKLEME için güvenli RPC.
--
-- SORUN (18.08 kullanıcı bildirimi): "talep içinde yazışmaya bir şey yazınca
-- yazılmıyor". Kök neden: `servis_talepleri` tablosunda MÜŞTERİ için UPDATE
-- politikası YOK — yalnız SELECT / INSERT / DELETE var:
--   servis_talepleri_staff_all       ALL    is_staff()
--   servis_talepleri_customer_select SELECT musteri_id = current_musteri_id()
--   servis_talepleri_customer_insert INSERT ...
--   servis_talepleri_customer_delete DELETE ...
-- Portal müşterisi not yazdığında istemci `notlar` jsonb'sini UPDATE etmeye
-- çalışıyor, RLS reddediyor, istemci de hatayı yutup kutuyu temizliyordu:
-- müşteri yazdığını kaybediyor, not hiç kaydedilmiyordu.
--
-- ⚠️ NEDEN POLİTİKA DEĞİL RPC: Postgres RLS satır düzeyindedir, KOLON
-- düzeyinde değil. Müşteriye UPDATE politikası açmak `durum`,
-- `atanan_kullanici_id`, `operator_onay` gibi TÜM kolonları da açardı —
-- müşteri kendi talebini "tamamlandı" yapabilirdi. RPC ile yazma yolu dar
-- tutulur: yalnız `notlar` dizisine ekleme yapılır, başka kolona dokunulmaz.
-- (Aynı disiplin mesai_kayitlari'nda uygulanıyor — mig 291.)
--
-- YETKİ: personel (is_staff) her talebe; müşteri YALNIZ kendi firmasının
-- talebine. Müşterinin gönderdiği notun tipi sunucuda 'musteri'ye SABİTLENİR
-- — istemciden 'ic' (iç not) gönderip ekip içi nota sızmasın.

begin;

create or replace function public.servis_talep_not_ekle(
  p_talep_id bigint,
  p_metin    text,
  p_tip      text default 'ic'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kul     record;
  v_talep   record;
  v_tip     text;
  v_not     jsonb;
begin
  if coalesce(btrim(p_metin), '') = '' then
    raise exception 'Not metni boş olamaz.';
  end if;

  select k.id, k.ad, coalesce(k.tip,'') as tip, k.musteri_id
    into v_kul
    from public.kullanicilar k
   where k.auth_id = auth.uid()
     and coalesce(k.hesap_silindi, false) = false
   limit 1;

  if v_kul.id is null then
    raise exception 'Oturum bulunamadı.';
  end if;

  select t.id, t.musteri_id into v_talep
    from public.servis_talepleri t
   where t.id = p_talep_id;

  if v_talep.id is null then
    raise exception 'Talep bulunamadı.';
  end if;

  if v_kul.tip = 'musteri' then
    -- Müşteri yalnız KENDİ firmasının talebine yazabilir
    if v_talep.musteri_id is null or v_talep.musteri_id is distinct from v_kul.musteri_id then
      raise exception 'Bu talebe not ekleme yetkiniz yok.';
    end if;
    v_tip := 'musteri';                      -- istemci ne gönderirse göndersin
  else
    if not (select public.is_staff()) then
      raise exception 'Bu talebe not ekleme yetkiniz yok.';
    end if;
    v_tip := case when p_tip = 'musteri' then 'musteri' else 'ic' end;
  end if;

  v_not := jsonb_build_object(
    'id',          gen_random_uuid(),
    'kullaniciId', v_kul.id,
    'kullaniciAd', v_kul.ad,
    'metin',       btrim(p_metin),
    'tarih',       to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'tip',         v_tip
  );

  update public.servis_talepleri
     set notlar            = coalesce(notlar, '[]'::jsonb) || v_not,
         guncelleme_tarihi = now()
   where id = p_talep_id;

  return v_not;
end;
$$;

revoke all on function public.servis_talep_not_ekle(bigint, text, text) from public, anon;
grant execute on function public.servis_talep_not_ekle(bigint, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
