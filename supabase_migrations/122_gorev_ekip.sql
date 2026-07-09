-- 122: Görevlere çoklu atama (ekip) desteği.
-- Backward compat: atanan_id (birincil atanan) korunur.
-- Yeni: ekip bigint[] — ekstra atananlar.

alter table gorevler
  add column if not exists ekip bigint[] not null default '{}';

-- Ekip listesinde arama için GIN index (kullanıcı görev listesi filtresi hızlansın)
create index if not exists gorevler_ekip_gin_idx on gorevler using gin (ekip);

comment on column gorevler.ekip is
  'Birincil atanan (atanan_id) haricinde göreve dahil edilen ek kullanıcı id''leri. Bildirim ve SMS bu kişilere de gider.';

notify pgrst, 'reload schema';
