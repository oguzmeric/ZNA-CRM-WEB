-- 241 — Sohbet oluşturma/katılım denetimli fonksiyonlara alındı
--
-- 240'ta bırakılan açık: `sohbet_kat_insert` politikası yalnız is_staff()
-- istiyordu → herhangi bir personel HERHANGİ bir sohbete kendini katılımcı
-- olarak ekleyip başkalarının özel yazışmasını okuyabilirdi. Doğrudan INSERT
-- kapatılıyor; oluşturma ve katılımcı ekleme SECURITY DEFINER fonksiyonlardan
-- geçiyor (yetki kontrolü içeride).
--
-- Ayrıca birebir sohbet açarken yarış koşulu: iki kişi aynı anda yazarsa iki
-- ayrı sohbet oluşup yazışma ikiye bölünürdü. advisory lock ile tekilleştirildi.

begin;

drop policy if exists sohbetler_staff_insert on public.sohbetler;
drop policy if exists sohbet_kat_insert on public.sohbet_katilimcilar;

-- ── Birebir sohbet aç (varsa mevcudu döndür) ───────────────────────────────
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
  -- Aynı çift için eşzamanlı iki sohbet açılmasın
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
    -- Daha önce "sohbeti sil" demişse damga kalkar → sohbet listeye geri döner
    update sohbet_katilimcilar
       set gizlendi_tarih = null, ayrildi = false
     where sohbet_id = v_id and kullanici_id = v_ben;
  end if;
  return v_id;
end $$;

-- ── Grup sohbeti aç ────────────────────────────────────────────────────────
create or replace function public.grup_sohbet_ac(p_ad text, p_katilimci_idler bigint[])
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare
  v_ben bigint; v_rol text; v_id bigint; v_kid bigint;
begin
  select id, rol into v_ben, v_rol from kullanicilar where auth_id = auth.uid() limit 1;
  if v_ben is null then raise exception 'Oturum bulunamadı'; end if;
  if v_rol not in ('admin','personel') then raise exception 'Yetkin yok'; end if;
  if coalesce(trim(p_ad), '') = '' then raise exception 'Grup adı gerekli'; end if;

  insert into sohbetler (tip, ad, olusturan_id) values ('grup', trim(p_ad), v_ben) returning id into v_id;
  insert into sohbet_katilimcilar (sohbet_id, kullanici_id) values (v_id, v_ben);

  foreach v_kid in array coalesce(p_katilimci_idler, '{}')
  loop
    if v_kid <> v_ben
       and exists (select 1 from kullanicilar where id = v_kid and rol in ('admin','personel')) then
      insert into sohbet_katilimcilar (sohbet_id, kullanici_id)
      values (v_id, v_kid) on conflict do nothing;
    end if;
  end loop;
  return v_id;
end $$;

-- ── Gruba katılımcı ekle (yalnız mevcut katılımcı ekleyebilir) ─────────────
create or replace function public.sohbete_katilimci_ekle(p_sohbet_id bigint, p_kullanici_id bigint)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_ben bigint; v_tip text;
begin
  select id into v_ben from kullanicilar where auth_id = auth.uid() limit 1;
  if v_ben is null then raise exception 'Oturum bulunamadı'; end if;
  select tip into v_tip from sohbetler where id = p_sohbet_id;
  if v_tip is null then raise exception 'Sohbet bulunamadı'; end if;
  if v_tip <> 'grup' then raise exception 'Birebir sohbete kişi eklenemez'; end if;
  if not exists (select 1 from sohbet_katilimcilar
                  where sohbet_id = p_sohbet_id and kullanici_id = v_ben and ayrildi = false) then
    raise exception 'Bu sohbetin katılımcısı değilsin';
  end if;
  if not exists (select 1 from kullanicilar where id = p_kullanici_id and rol in ('admin','personel')) then
    raise exception 'Kişi bulunamadı';
  end if;
  insert into sohbet_katilimcilar (sohbet_id, kullanici_id)
  values (p_sohbet_id, p_kullanici_id)
  on conflict (sohbet_id, kullanici_id) do update set ayrildi = false, gizlendi_tarih = null;
  return true;
end $$;

revoke execute on function public.birebir_sohbet_ac(bigint) from anon;
revoke execute on function public.grup_sohbet_ac(text, bigint[]) from anon;
revoke execute on function public.sohbete_katilimci_ekle(bigint, bigint) from anon;
grant execute on function public.birebir_sohbet_ac(bigint) to authenticated;
grant execute on function public.grup_sohbet_ac(text, bigint[]) to authenticated;
grant execute on function public.sohbete_katilimci_ekle(bigint, bigint) to authenticated;

-- ── Mesaj gönderme: yalnız katılımcı olduğun sohbete ───────────────────────
drop policy if exists mesajlar_insert_self on public.mesajlar;
create policy mesajlar_insert_self on public.mesajlar
  for insert to authenticated
  with check (
    gonderici_id in (select id from kullanicilar where auth_id = auth.uid())
    and sohbet_id is not null
    and (select public.sohbet_katilimcisi_mi(sohbet_id))
  );

commit;
