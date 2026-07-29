-- 242 — ACİL: mesaj gönderme geriye uyumlu hale getirildi
--
-- 241'de mesajlar INSERT politikası `sohbet_id is not null` şartı koydu.
-- Ama CANLIDAKİ arayüz (Vercel'de yayında olan sürüm) henüz sohbet_id
-- göndermiyor — bu haliyle kimse mesaj gönderemez. Şema göçü ile istemci
-- dağıtımı aynı anda olmuyor; politika ikisini de kabul etmeli.
--
-- Kural: sohbet_id verilmişse katılımcı olmak ŞART (yeni yol).
--        verilmemişse eski birebir davranışı (gönderen kendisi) — geçiş dönemi.
-- Arayüz sohbet_id göndermeye başlayınca bu esneklik kaldırılabilir.

begin;

drop policy if exists mesajlar_insert_self on public.mesajlar;
create policy mesajlar_insert_self on public.mesajlar
  for insert to authenticated
  with check (
    gonderici_id in (select id from kullanicilar where auth_id = auth.uid())
    and (
      sohbet_id is null                                   -- eski istemci
      or (select public.sohbet_katilimcisi_mi(sohbet_id)) -- yeni istemci
    )
  );

commit;
