-- SMS gönderim log tablosu.
-- Amaç: Her SMS denemesini kayıt altına almak → başarısız denemeleri de görmek.
-- Frontend'ten smsGonder çağrıldığında bir satır INSERT, edge function'dan
-- dönen sonuçla UPDATE. Böylece tam olarak "kimin telefonuna ne gitti" izlenebilir.

create table if not exists public.sms_gonderim_log (
  id bigserial primary key,
  gsm text not null,                   -- normalize edilmemiş, kullanıcının girdiği
  mesaj text not null,
  amac text,                            -- örn 'on_siparis_bildirim' | 'siparis_onay_bildirim'
  ref_tablo text,                       -- örn 'on_siparisler'
  ref_id bigint,                        -- örn on_siparis.id
  alici_kullanici_id bigint references kullanicilar(id) on delete set null,
  alici_ad text,
  gonderen_kullanici_id bigint references kullanicilar(id) on delete set null,
  sonuc text,                           -- 'basarili' | 'hata' | 'atlandi' (telefon yok)
  hata_mesaji text,                     -- fail olduysa detay
  netgsm_jobid text,                    -- başarılıysa jobid
  netgsm_code text,                     -- fail olduysa NetGSM code
  cevap_ham text,                       -- edge function ham cevap (debug için)
  olusturma_tarih timestamptz not null default now()
);

create index if not exists sms_gonderim_log_tarih_idx on sms_gonderim_log (olusturma_tarih desc);
create index if not exists sms_gonderim_log_alici_idx on sms_gonderim_log (alici_kullanici_id);
create index if not exists sms_gonderim_log_amac_idx on sms_gonderim_log (amac);

-- RLS: personel/admin okur, personel/admin insert
alter table public.sms_gonderim_log enable row level security;
alter table public.sms_gonderim_log force row level security;

drop policy if exists "sms_log_staff_select" on public.sms_gonderim_log;
drop policy if exists "sms_log_staff_insert" on public.sms_gonderim_log;
drop policy if exists "sms_log_staff_update" on public.sms_gonderim_log;

create policy "sms_log_staff_select" on public.sms_gonderim_log
  for select using (is_staff());
create policy "sms_log_staff_insert" on public.sms_gonderim_log
  for insert with check (is_staff());
create policy "sms_log_staff_update" on public.sms_gonderim_log
  for update using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';
