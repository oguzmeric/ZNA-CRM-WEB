-- 157: uygulama_ayarlari — anahtar/değer entegrasyon ayarları
-- (sistem_ayarlari zaten var ve id=1 satırlı farklı bir yapı — ona dokunulmaz.)
-- İlk kullanım: OneDrive uygulama (client) ID'si.
-- Okuma: staff (client tarafı entegrasyonlar için gerekli), yazma: admin.

create table if not exists uygulama_ayarlari (
  anahtar          text primary key,
  deger            text,
  guncelleyen_id   bigint,
  guncelleme_tarih timestamptz not null default now()
);

alter table uygulama_ayarlari enable row level security;
drop policy if exists uyg_ayar_sel on uygulama_ayarlari;
create policy uyg_ayar_sel on uygulama_ayarlari for select using (is_staff());
drop policy if exists uyg_ayar_ins on uygulama_ayarlari;
create policy uyg_ayar_ins on uygulama_ayarlari for insert with check (is_admin());
drop policy if exists uyg_ayar_upd on uygulama_ayarlari;
create policy uyg_ayar_upd on uygulama_ayarlari for update using (is_admin());

notify pgrst, 'reload schema';
