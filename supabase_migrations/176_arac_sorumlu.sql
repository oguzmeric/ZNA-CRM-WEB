-- 176 — Araca sorumlu(lar) atama: muayene/sigorta/kasko bitiş hatırlatmaları
-- sabit yönetim listesi yerine (veya ona ek olarak) araca atanan sorumlulara da
-- gitsin. arac-km-sync bu diziyi okuyup her aracın kendi sorumlularına bildirir.

alter table sirket_araclari
  add column if not exists sorumlu_kullanici_idler bigint[] not null default '{}';

comment on column sirket_araclari.sorumlu_kullanici_idler is
  'Bu aracın muayene/sigorta/kasko bitiş hatırlatmalarını alacak kullanıcı idleri (yönetime EK).';
