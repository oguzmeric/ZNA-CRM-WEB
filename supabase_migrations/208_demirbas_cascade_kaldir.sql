-- 208: demirbas_zimmet.kullanici_id cascade → restrict
-- OLAY (2026-07-20): kullanıcı id 39 ve 42 Kullanıcı Yönetimi'nden kalıcı silinince
-- "on delete cascade" üzerlerindeki 43 demirbaş zimmet kaydını da sildi (17.07 girilmişti).
-- Fotoğraflar demirbas-foto bucket'ında duruyor (storage cascade'e dahil değil).
-- Artık: üzerinde demirbaş kaydı olan kullanıcı silinemez — önce demirbaş iade/aktarılmalı.

begin;

alter table demirbas_zimmet
  drop constraint if exists demirbas_zimmet_kullanici_id_fkey;

alter table demirbas_zimmet
  add constraint demirbas_zimmet_kullanici_id_fkey
  foreign key (kullanici_id) references kullanicilar(id) on delete restrict;

commit;

select confdeltype from pg_constraint where conname = 'demirbas_zimmet_kullanici_id_fkey';
