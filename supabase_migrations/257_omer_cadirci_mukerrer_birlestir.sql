-- 257 — Ömer Çadırcı mükerrer hesabı: envanteri gerçek hesaba taşı, eskisini kapat
--
-- DURUM (2026-08-04 canlı tespit):
--   id=41  @omer_cadirci      omercadirci@zna.local   → ESKİ hesap (sentetik e-posta)
--                             son giriş 9 Temmuz, 27 demirbaş zimmeti + 1 stok kalemi
--   id=60  @omercadirci989    omercadirci989@gmail.com → GERÇEK hesap (aktif kullanımda)
--                             4 Ağustos'ta mobilden giriş + mesai başlattı
--
-- SORUN: Ömer'in tüm zimmeti kullanmadığı hesapta duruyor → zimmet takibi kopuk.
-- Ayrıca eski hesap silinemiyordu (demirbas_zimmet FK'si RESTRICT).
--
-- YAPILAN: id=41'e bağlı TÜM referanslar id=60'a taşınır, sonra id=41 silinir.
-- Referanslar tek tek elle yazılmıyor — kullanicilar'a bağlı 88 FK'nin tamamı
-- katalogdan gezilir. Böylece gözden kaçan bir tablo kalmaz.
--
-- ⚠️ Bu dosya İKİ MODLUDUR. Prova için son satırdaki commit'i rollback yapın.

begin;

do $$
declare
  v_eski   bigint := 41;
  v_yeni   bigint := 60;
  v_auth   uuid;
  r        record;
  u        record;
  v_diger  text[];
  v_adet   bigint;
  v_rapor  text := '';
begin
  -- Taşıma dökümünü sonda görebilmek için (raise notice bu araçta görünmüyor)
  create temp table if not exists _tasima_raporu (bilgi text);
  -- Güvenlik: her iki kayıt da gerçekten var mı?
  if not exists (select 1 from kullanicilar where id = v_eski) then
    raise notice 'id=% zaten yok — migration daha önce uygulanmış olabilir.', v_eski;
    return;
  end if;
  if not exists (select 1 from kullanicilar where id = v_yeni) then
    raise exception 'Hedef hesap id=% bulunamadı — taşıma iptal.', v_yeni;
  end if;

  select auth_id into v_auth from kullanicilar where id = v_eski;

  -- kullanicilar'a bağlı HER yabancı anahtarı gez ve eski id'yi yeniye çevir.
  -- kullanicilar'ın KENDİ self-FK'si (onaylayan_id) de bu listeye dahildir;
  -- silinecek satırın kendisi zaten en sonda silineceği için sorun olmaz.
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join unnest(c.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and c.confrelid = 'public.kullanicilar'::regclass
    order by 1, 2
  loop
    -- Normal yol: düz taşıma. Katalog sorgusu YOK — 88 tablo için ayrı ayrı
    -- kısıt sorgulamak bağlantıyı zaman aşımına düşürüyordu.
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
        using v_yeni, v_eski;
      get diagnostics v_adet = row_count;
      if v_adet > 0 then
        v_rapor := v_rapor || r.tbl || '.' || r.col || '=' || v_adet || '  ';
      end if;

    exception when unique_violation then
      -- Kullanıcı kolonu bir BENZERSİZ kısıtın parçası ve aynı anahtar her iki
      -- hesapta da var (prova bunu menu_yetkileri'nde yakaladı: "stok" yetkisi
      -- ikisinde de vardı). Hedefteki kayıt zaten güncel olan; eski hesabın
      -- çakışan satırlarını düşürüp kalanı taşıyoruz. Pahalı katalog sorgusu
      -- SADECE bu nadir durumda çalışır.
      for u in
        select array_agg(a2.attname order by k2.ord) as kolonlar
        from pg_constraint c2
        join unnest(c2.conkey) with ordinality k2(attnum, ord) on true
        join pg_attribute a2 on a2.attrelid = c2.conrelid and a2.attnum = k2.attnum
        where c2.contype in ('u', 'p') and c2.conrelid = r.tbl::regclass
        group by c2.oid
        having r.col = any (array_agg(a2.attname))
      loop
        v_diger := array_remove(u.kolonlar, r.col);
        if coalesce(array_length(v_diger, 1), 0) > 0 then
          execute format(
            'delete from %s e where e.%I = $1 and exists (select 1 from %s y where y.%I = $2 and %s)',
            r.tbl, r.col, r.tbl, r.col,
            (select string_agg(format('y.%I is not distinct from e.%I', kol, kol), ' and ')
               from unnest(v_diger) kol)
          ) using v_eski, v_yeni;
          get diagnostics v_adet = row_count;
          if v_adet > 0 then
            v_rapor := v_rapor || '[cakisan-silindi] ' || r.tbl || '=' || v_adet || '  ';
          end if;
        end if;
      end loop;

      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
        using v_yeni, v_eski;
      get diagnostics v_adet = row_count;
      if v_adet > 0 then
        v_rapor := v_rapor || r.tbl || '.' || r.col || '=' || v_adet || '  ';
      end if;
    end;
  end loop;

  insert into _tasima_raporu values ('TASINAN → ' || coalesce(nullif(v_rapor, ''), 'hicbiri'));

  -- Eski profil satırını sil (artık hiçbir tablo ona bakmıyor)
  delete from kullanicilar where id = v_eski;
  raise notice 'id=% profil satiri silindi.', v_eski;

  -- Eski auth kaydını da sil — yoksa o e-posta ile giriş denemesi mümkün kalır
  if v_auth is not null then
    delete from auth.users where id = v_auth;
    raise notice 'auth.users kaydi silindi (%).', v_auth;
  end if;

  -- Gerçek hesabın adını Türkçe yazımıyla düzelt (listede "Omer Cadirci" görünüyordu)
  update kullanicilar set ad = 'Ömer Çadırcı' where id = v_yeni and ad <> 'Ömer Çadırcı';
end $$;

-- Doğrulama
select bilgi from _tasima_raporu
union all
select 'KALAN Omer kaydi: ' || coalesce(string_agg('id=' || id || ' @' || coalesce(kullanici_adi,'-')
       || ' ad=' || ad, ' | '), 'YOK')
from kullanicilar where id in (41, 60) or kullanici_adi ilike '%cadirci%'
union all
select 'id=60 envanteri: zimmet=' || (select count(*) from demirbas_zimmet where kullanici_id = 60)
    || '  stok=' || (select count(*) from stok_kalemleri where teknisyen_id = 60)
    || '  mesai=' || (select count(*) from mesai_kayitlari where kullanici_id = 60);

commit;
