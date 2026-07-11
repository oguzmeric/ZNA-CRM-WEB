-- 140: Keşif Modülü spec genişletmesi.
-- Kullanıcı spec'i: keşif görüşmeden oluşturulur (bilgiler otomatik aktarılır),
-- KSF-YYYY-NNNNNN (6 hane), genişletilmiş genel bilgiler, çoklu keşif türü,
-- öncelik seviyesi. Keşif ekranında FİYAT GİRİŞİ YOK (metraj fiyatsız).

-- ── Görüşme bağlantısı + otomatik aktarılan bilgiler ─────────────────
alter table kesifler add column if not exists gorusme_id bigint;
alter table kesifler add column if not exists gorusme_no text;

-- ── Genel bilgiler (spec §3) ─────────────────────────────────────────
alter table kesifler add column if not exists proje_adi text;
alter table kesifler add column if not exists kesif_basligi text;
-- lokasyon kolonu "Keşif adresi" olarak kullanılıyor (UI etiketi)
alter table kesifler add column if not exists harita_konumu text;          -- koordinat veya harita linki
alter table kesifler add column if not exists musteri_yetkilisi text;
alter table kesifler add column if not exists yetkili_telefon text;
alter table kesifler add column if not exists yetkili_email text;
alter table kesifler add column if not exists satis_personeli text;        -- ilgili satış personeli
alter table kesifler add column if not exists oncelik text not null default 'normal';
alter table kesifler drop constraint if exists kesifler_oncelik_check;
alter table kesifler add constraint kesifler_oncelik_check
  check (oncelik in ('dusuk','normal','yuksek','acil'));
alter table kesifler add column if not exists tahmini_proje_tarihi date;
alter table kesifler add column if not exists ozel_talepler text;          -- müşteri talepleri
alter table kesifler add column if not exists mevcut_sistem text;
alter table kesifler add column if not exists rakip_firma text;
alter table kesifler add column if not exists ic_notlar text;              -- şirket içi notlar

-- ── Keşif türleri (spec §4) — çoklu seçim + tür bazlı teknik notlar ──
alter table kesifler add column if not exists turler text[] not null default '{}';
alter table kesifler add column if not exists teknik_detaylar jsonb not null default '{}'::jsonb;

create index if not exists kesif_gorusme_idx on kesifler(gorusme_id);
create index if not exists kesif_turler_gin on kesifler using gin (turler);

-- ── Keşif no formatı: KSF-YYYY-NNNNNN (6 hane — spec örneği KSF-2026-000145)
create or replace function kesif_no_uret()
returns trigger
language plpgsql
as $$
declare
  v_yil int := extract(year from coalesce(new.olusturma_tarih, now()))::int;
  v_son int;
  v_pattern text;
begin
  if new.kesif_no is not null and new.kesif_no <> '' then
    return new;
  end if;
  v_pattern := '^KSF-' || v_yil || '-(\d+)$';
  select coalesce(max(substring(kesif_no from v_pattern)::int), 0)
    into v_son
    from kesifler
   where kesif_no ~ v_pattern;
  new.kesif_no := 'KSF-' || v_yil || '-' || lpad((v_son + 1)::text, 6, '0');
  return new;
end;
$$;

notify pgrst, 'reload schema';
