-- 245 — Sohbet mesajı gelince PUSH bildirimi
--
-- Kullanıcı (30.07): "Telefondan chat üzerinden gelen mesajlarda bildirim
-- geliyor mu? sanki gelmiyor" — gelmiyordu. Uygulama AÇIKKEN realtime ile
-- düşüyordu, kapalıyken hiçbir şey yoktu.
--
-- Mevcut push zinciri: `bildirimler` INSERT → tr_bildirim_push
-- (bildirim_push_trigger) → net.http_post → edge fn push-gonder → Expo.
-- Yani push için bildirim satırı ŞART; zinciri değiştirmiyoruz.
--
-- TASARIM: satır `tip='mesaj'` VE **okundu=true, okunma_tarih=now()** doğar.
--   * push-gonder `okundu` durumuna BAKMIYOR (index.ts) → push yine gider.
--   * push-gonder badge'i okunmamış sayısından hesaplıyor → uygulama ikonu
--     rozeti sohbet mesajıyla ŞİŞMEZ.
--   * bildirim zili/listesi ayrıca istemci tarafında `tip='mesaj'` eleyecek.
--   İki bağımsız katman: biri unutulsa diğeri tutar.
--
-- Bildirim satırını İSTEMCİDEN yazmıyoruz — RLS RETURNING tuzağı (29.07'de
-- mobilden gönderilen tüm bildirimler aylarca sessizce kayboldu). Yazma tek
-- yerden: bu trigger.

begin;

create or replace function public.mesaj_bildirim_olustur()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_tip text;            -- sohbet tipi (birebir|grup)
  v_ad  text;            -- grup adı
  v_gonderen text;
  v_json jsonb;
  v_govde text;
  v_baslik text;
  v_link text;
  v_alici bigint;
begin
  select coalesce(nullif(btrim(ad), ''), 'Bilinmeyen') into v_gonderen
    from kullanicilar where id = new.gonderici_id;

  -- Gövde. DİKKAT: dosya mesajının icerik'i JSON STRING'dir (mig 244):
  -- {"tip":"dosya","dosyaAdi":...}. Ham JSON push gövdesine BASILMAMALI.
  if left(btrim(coalesce(new.icerik, '')), 1) = '{' then
    begin
      v_json := new.icerik::jsonb;
    exception when others then
      v_json := null;    -- bozuk JSON → düz metin gibi davran
    end;
  end if;

  if v_json is not null and jsonb_typeof(v_json) = 'object' and v_json->>'tip' = 'dosya' then
    v_govde := '📎 ' || coalesce(nullif(v_json->>'dosyaAdi', ''), 'Dosya');
  else
    -- 140 karakter: OS zaten kırpıyor, DB satırı ve push yükü şişmesin
    v_govde := left(coalesce(nullif(btrim(new.icerik), ''), 'Yeni mesaj'), 140);
  end if;

  -- Sohbet bağlamı. sohbet_id NULL olabilir (mig 242 geri uyum yolu).
  -- v_tip'i ayrı değişkende tutuyoruz: atanmamış record'un alanına erişmek
  -- PL/pgSQL'de hata verir.
  if new.sohbet_id is not null then
    select tip, ad into v_tip, v_ad from sohbetler where id = new.sohbet_id;
  end if;

  if v_tip = 'grup' then
    v_baslik := coalesce(nullif(btrim(v_ad), ''), 'Grup');
    v_govde  := v_gonderen || ': ' || v_govde;
    v_link   := '/sohbet/grup/' || new.sohbet_id;
  else
    v_baslik := v_gonderen;                       -- baslik NOT NULL
    v_link   := '/sohbet/kisi/' || new.gonderici_id;
  end if;

  -- Bildirim yazımı mesaj gönderimini ASLA düşürmemeli: AFTER INSERT aynı
  -- transaction'da, patlarsa mesaj da rollback olur. Uyarı ile yutuyoruz.
  begin
    if new.sohbet_id is not null then
      -- Grup + birebir ortak yol. gizlendi_tarih'e KESİNLİKLE filtre YOK:
      -- "sohbeti sil" demiş kişi YENİ mesajı görmeli (mig 243), dolayısıyla
      -- bildirimini de almalı. Filtre koyulsa o kişi bir daha hiç bildirim
      -- almaz ve bu sessizce fark edilmez.
      for v_alici in
        select k.kullanici_id
          from sohbet_katilimcilar k
          join kullanicilar u on u.id = k.kullanici_id
         where k.sohbet_id = new.sohbet_id
           and k.kullanici_id <> new.gonderici_id      -- kendine bildirim yok
           and k.ayrildi = false
           and coalesce(u.hesap_silindi, false) = false
      loop
        insert into bildirimler
          (alici_id, gonderen_id, baslik, mesaj, tip, link, okundu, okunma_tarih)
        values
          (v_alici, new.gonderici_id, v_baslik, v_govde, 'mesaj', v_link, true, now());
      end loop;
    elsif new.alici_id is not null and new.alici_id <> new.gonderici_id then
      -- Eski istemci (sohbet_id göndermeyen) — birebir kabul
      insert into bildirimler
        (alici_id, gonderen_id, baslik, mesaj, tip, link, okundu, okunma_tarih)
      values
        (new.alici_id, new.gonderici_id, v_baslik, v_govde, 'mesaj', v_link, true, now());
    end if;
  exception when others then
    raise warning '[mesaj_bildirim_olustur] hata: %', sqlerrm;
  end;

  return new;
end $$;

-- force RLS açık; INSERT'in geçmesi owner'ın (postgres) BYPASSRLS'ine bağlı —
-- mig 070 bildirim_ekle ile aynı desen.
alter function public.mesaj_bildirim_olustur() owner to postgres;

drop trigger if exists tr_mesaj_bildirim on public.mesajlar;
create trigger tr_mesaj_bildirim
  after insert on public.mesajlar
  for each row execute function public.mesaj_bildirim_olustur();

-- Retention: sohbet bildirimi geçmişinin işlevsel değeri yok (liste zaten
-- göstermiyor). 10 kişilik grupta her mesaj 9 satır → temizlik şart.
create index if not exists ix_bildirimler_tip_tarih
  on public.bildirimler (tip, olusturma_tarih);

commit;
