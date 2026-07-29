-- 243 — Grup sohbeti arayüzünün ihtiyaç duyduğu DB parçaları
--
-- 240-242 ile sohbet/katılımcı şeması ve RPC'ler kurulmuştu ama arayüz
-- yazılmadığı için grup tarafı hiç kullanılmamıştı. Arayüzü yazarken çıkan
-- eksikler:
--
--  1) `mesajlar.alici_id` NOT NULL — grup mesajının TEK alıcısı yok. Nullable
--     yapılıyor; yerine "hedef var mı" kontrolü konuyor (alıcı VEYA sohbet).
--  2) Grupta `okundu` bayrağı tek satırda tutulamaz (10 kişi, 10 farklı okuma
--     durumu). Okunmamış sayısı katılımcı satırındaki `son_okuma_tarih`ten
--     hesaplanıyor. Birebirde ✓✓ için `okundu` aynen kalıyor.
--  3) `birebir_sohbet_ac` gizleme damgasını SİLİYORDU → "sohbeti sil" dedikten
--     sonra tek mesaj yazınca silinen tüm geçmiş geri geliyordu. Damga artık
--     korunuyor: sohbet yeni mesajla listeye döner ama eski mesajlar gizli kalır.
--  4) Sohbet listesi tek turda gelsin diye `sohbetlerim()`.

begin;

-- ── 1) Grup mesajı: alıcı yok ──────────────────────────────────────────────
alter table public.mesajlar alter column alici_id drop not null;

alter table public.mesajlar drop constraint if exists mesajlar_hedef_var;
alter table public.mesajlar add constraint mesajlar_hedef_var
  check (alici_id is not null or sohbet_id is not null);

-- ── 2) Grup okuma damgası ──────────────────────────────────────────────────
alter table public.sohbet_katilimcilar
  add column if not exists son_okuma_tarih timestamptz;

-- ── 3) birebir_sohbet_ac: gizleme damgası korunur ──────────────────────────
create or replace function public.birebir_sohbet_ac(p_diger_id bigint)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_ben bigint; v_rol text; v_id bigint; v_a bigint; v_b bigint;
begin
  select id, rol into v_ben, v_rol from kullanicilar where auth_id = auth.uid() limit 1;
  if v_ben is null then raise exception 'Oturum bulunamadı'; end if;
  if v_rol not in ('admin','personel') then raise exception 'Yetkin yok'; end if;
  if p_diger_id is null or p_diger_id = v_ben then raise exception 'Geçersiz kişi'; end if;
  if not exists (select 1 from kullanicilar where id = p_diger_id and rol in ('admin','personel')) then
    raise exception 'Kişi bulunamadı';
  end if;

  v_a := least(v_ben, p_diger_id);
  v_b := greatest(v_ben, p_diger_id);
  perform pg_advisory_xact_lock(hashtext('birebir_sohbet_' || v_a || '_' || v_b));

  select s.id into v_id
    from sohbetler s
    join sohbet_katilimcilar k1 on k1.sohbet_id = s.id and k1.kullanici_id = v_a
    join sohbet_katilimcilar k2 on k2.sohbet_id = s.id and k2.kullanici_id = v_b
   where s.tip = 'birebir'
   limit 1;

  if v_id is null then
    insert into sohbetler (tip, olusturan_id) values ('birebir', v_ben) returning id into v_id;
    insert into sohbet_katilimcilar (sohbet_id, kullanici_id) values (v_id, v_a), (v_id, v_b);
  else
    -- DİKKAT: gizlendi_tarih'e DOKUNMUYORUZ. Silinen geçmiş gizli kalmalı;
    -- sohbet zaten yeni mesajla listeye geri döner.
    update sohbet_katilimcilar
       set ayrildi = false
     where sohbet_id = v_id and kullanici_id = v_ben and ayrildi = true;
  end if;
  return v_id;
end $$;

-- ── 4) Sohbet listem (katılımcılarıyla birlikte, tek turda) ────────────────
create or replace function public.sohbetlerim()
returns table (
  id bigint, tip text, ad text, olusturan_id bigint,
  son_mesaj_tarih timestamptz, gizlendi_tarih timestamptz,
  son_okuma_tarih timestamptz, katilimcilar bigint[]
)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.tip, s.ad, s.olusturan_id, s.son_mesaj_tarih,
         k.gizlendi_tarih, k.son_okuma_tarih,
         array(select k2.kullanici_id
                 from sohbet_katilimcilar k2
                where k2.sohbet_id = s.id and k2.ayrildi = false
                order by k2.kullanici_id)
    from sohbetler s
    join sohbet_katilimcilar k on k.sohbet_id = s.id
    join kullanicilar u on u.id = k.kullanici_id
   where u.auth_id = auth.uid()
     and k.ayrildi = false
   order by coalesce(s.son_mesaj_tarih, s.olusturma_tarih) desc;
$$;

-- ── Okundu damgası / gizleme / gruptan ayrılma ─────────────────────────────
create or replace function public.sohbet_okundu_isaretle(p_sohbet_id bigint)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_ben bigint;
begin
  select id into v_ben from kullanicilar where auth_id = auth.uid() limit 1;
  if v_ben is null then raise exception 'Oturum bulunamadı'; end if;
  update sohbet_katilimcilar set son_okuma_tarih = now()
   where sohbet_id = p_sohbet_id and kullanici_id = v_ben;
  return found;
end $$;

create or replace function public.sohbeti_gizle(p_sohbet_id bigint)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_ben bigint;
begin
  select id into v_ben from kullanicilar where auth_id = auth.uid() limit 1;
  if v_ben is null then raise exception 'Oturum bulunamadı'; end if;
  update sohbet_katilimcilar set gizlendi_tarih = now()
   where sohbet_id = p_sohbet_id and kullanici_id = v_ben;
  if not found then raise exception 'Bu sohbetin katılımcısı değilsin'; end if;
  return true;
end $$;

-- Gruptan ayrıl: katılımcılıktan çıkar (birebirde anlamsız → sadece grup)
create or replace function public.sohbetten_ayril(p_sohbet_id bigint)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_ben bigint; v_tip text;
begin
  select id into v_ben from kullanicilar where auth_id = auth.uid() limit 1;
  if v_ben is null then raise exception 'Oturum bulunamadı'; end if;
  select tip into v_tip from sohbetler where id = p_sohbet_id;
  if v_tip is null then raise exception 'Sohbet bulunamadı'; end if;
  if v_tip <> 'grup' then raise exception 'Yalnız gruptan ayrılabilirsin'; end if;
  update sohbet_katilimcilar set ayrildi = true, gizlendi_tarih = now()
   where sohbet_id = p_sohbet_id and kullanici_id = v_ben;
  if not found then raise exception 'Bu sohbetin katılımcısı değilsin'; end if;
  return true;
end $$;

revoke execute on function public.sohbetlerim() from anon;
revoke execute on function public.sohbet_okundu_isaretle(bigint) from anon;
revoke execute on function public.sohbeti_gizle(bigint) from anon;
revoke execute on function public.sohbetten_ayril(bigint) from anon;
grant execute on function public.sohbetlerim() to authenticated;
grant execute on function public.sohbet_okundu_isaretle(bigint) to authenticated;
grant execute on function public.sohbeti_gizle(bigint) to authenticated;
grant execute on function public.sohbetten_ayril(bigint) to authenticated;

commit;
