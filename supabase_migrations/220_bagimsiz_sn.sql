-- 220 — Bağımsız (dahili) SN üretimi + etiket kuyruğu.
--
-- Sahada seri numarası OLMAYAN ürünlere ZNA- ön ekli benzersiz SN üretilir;
-- müşteri cihaz envanterine (musteri_cihazlari) bağlanır (client cihazEkle ile),
-- etiket ofiste mevcut A4 3×8 barkod motoruyla (BarkodEtiketYazdir) basılır.
--
-- SN üretimi DB sequence ile ATOMİK — istemci sayacı yarış/duplikasyon üretirdi
-- (bkz. belge_no_trigger dersi). ZNA-00000001 formatı, CODE128 barkod dostu.

create sequence if not exists bagimsiz_sn_seq;

create table if not exists bagimsiz_snler (
  id                 bigint generated always as identity primary key,
  seri_no            text not null unique,
  urun_adi           text,
  stok_kodu          text,
  musteri_id         bigint,
  cihaz_id           bigint,   -- musteri_cihazlari.id (client set eder)
  servis_talep_id    bigint,
  etiket_basildi     boolean not null default false,
  etiket_basim_tarih timestamptz,
  olusturan_id       bigint,
  olusturan_ad       text,
  olusturma_tarih    timestamptz not null default now()
);

create index if not exists ix_bagimsiz_sn_basilmamis on bagimsiz_snler (etiket_basildi, olusturma_tarih desc);
create index if not exists ix_bagimsiz_sn_servis on bagimsiz_snler (servis_talep_id);

alter table bagimsiz_snler enable row level security;
drop policy if exists bagimsiz_snler_staff on bagimsiz_snler;
create policy bagimsiz_snler_staff on bagimsiz_snler
  for all using (is_staff()) with check (is_staff());

-- SN üret: ZNA-NNNNNNNN üretir + kuyruğa işler. Cihaz/müşteri bağını client yazar.
create or replace function bagimsiz_sn_uret(
  p_urun_adi        text   default null,
  p_stok_kodu       text   default null,
  p_musteri_id      bigint default null,
  p_servis_talep_id bigint default null,
  p_olusturan_id    bigint default null,
  p_olusturan_ad    text   default null
) returns bagimsiz_snler
language plpgsql security definer set search_path = public as $$
declare
  v_sn  text;
  v_row bagimsiz_snler;
begin
  if not is_staff() then
    raise exception 'yetkisiz';
  end if;
  v_sn := 'ZNA-' || lpad(nextval('bagimsiz_sn_seq')::text, 8, '0');
  insert into bagimsiz_snler (seri_no, urun_adi, stok_kodu, musteri_id, servis_talep_id, olusturan_id, olusturan_ad)
  values (v_sn, nullif(trim(p_urun_adi), ''), nullif(trim(p_stok_kodu), ''), p_musteri_id, p_servis_talep_id, p_olusturan_id, nullif(trim(p_olusturan_ad), ''))
  returning * into v_row;
  return v_row;
end $$;

revoke all on function bagimsiz_sn_uret(text, text, bigint, bigint, bigint, text) from anon, public;
grant execute on function bagimsiz_sn_uret(text, text, bigint, bigint, bigint, text) to authenticated;

notify pgrst, 'reload schema';
