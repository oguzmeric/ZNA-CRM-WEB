-- Serviste malzeme girişi iki ayrı yerde tutuluyordu ve İKİSİ BİRBİRİNDEN HABERSİZDİ:
--
--   servis_malzemeleri (mig 153)   -> gerçek stok, S/N, teknisyen deposundan düşüm
--                                     ama müşteri formuna HİÇ yansımıyordu
--   servis_talepleri.yedek_parcalar -> müşteri formunda basılan liste (mig 045)
--                                     elle yazılan serbest metin + fiyat
--
-- Sonuç: teknisyen stoktan malzeme eklese bile form boş basıyordu; formu
-- doldurmak için aynı şeyi ikinci kez elle yazmak gerekiyordu. Kullanıcı
-- "serviste kullanılacak malzeme ekleyemedim" derken tam olarak bunu yaşadı
-- (canlıda servis_malzemeleri'nde HİÇ satır yok — özellik bir kez bile
-- kullanılmamış).
--
-- Karar: TEK KAYNAK = servis_malzemeleri. yedek_parcalar artık elle yazılan bir
-- alan değil, bu tablodan TÜRETİLEN bir anlık görüntü; trigger tutar. Böylece
-- müşteri formu (yazdırma + anon /p/:token paylaşım yolu dahil) hiç
-- değişmeden doğru listeyi basar.
-- Bkz. [[reference-belge-no-trigger]] — bu projede "iki istemci aynı mantıksal
-- alanı yazıyorsa tek DB trigger'ına indir" dersi.

-- 1) Fiyat + planlama alanları
alter table servis_malzemeleri
  add column if not exists birim_fiyat numeric(14,2) not null default 0,
  add column if not exists durum       text          not null default 'kullanildi',
  add column if not exists siralama    integer       not null default 0,
  add column if not exists notlar      text;

-- Keşiften gelen kalemler 'planlanan' düşer: teknisyen kullandıkça 'kullanildi'
-- yapar. Sadece 'kullanildi' olanlar müşteri formuna basılır.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'servis_malzemeleri_durum_check'
  ) then
    alter table servis_malzemeleri
      add constraint servis_malzemeleri_durum_check
      check (durum in ('planlanan', 'kullanildi'));
  end if;
end $$;

-- Tutar hesaplanan kolon: istemcinin yanlış hesaplaması mümkün olmasın.
alter table servis_malzemeleri
  add column if not exists tutar numeric(14,2)
    generated always as (round(miktar * birim_fiyat, 2)) stored;

-- İşçilik/hizmet gibi stokta olmayan satırlar için stok_kodu boş kalabilir
-- (zaten nullable) — urun_adi açıklama olarak kullanılır.

create index if not exists idx_servis_malzemeleri_servis_durum
  on servis_malzemeleri (servis_id, durum);

-- 2) Müşteri formundaki liste artık TÜRETİLİYOR
create or replace function servis_yedek_parca_senkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servis bigint;
begin
  v_servis := coalesce(new.servis_id, old.servis_id);

  update servis_talepleri t
     set yedek_parcalar = coalesce((
           select jsonb_agg(
                    jsonb_build_object(
                      'aciklama',    m.urun_adi || coalesce(' — S/N: ' || m.seri_no, ''),
                      'birim_fiyat', m.birim_fiyat,
                      'miktar',      m.miktar,
                      'tutar',       m.tutar
                    )
                    order by m.siralama, m.id
                  )
             from servis_malzemeleri m
            where m.servis_id = v_servis
              and m.durum = 'kullanildi'
         ), '[]'::jsonb)
   where t.id = v_servis;

  return null;
end $$;

drop trigger if exists trg_servis_yedek_parca on servis_malzemeleri;
create trigger trg_servis_yedek_parca
  after insert or update or delete on servis_malzemeleri
  for each row execute function servis_yedek_parca_senkron();

-- 3) Eskiden elle yazılmış yedek_parcalar satırlarını tabloya taşı.
--    Canlıda tek kayıt var (TLP-2026-0016 · "kamera"). Taşınmazsa ilk malzeme
--    eklendiğinde trigger listeyi baştan kurar ve bu satır SESSİZCE kaybolurdu.
insert into servis_malzemeleri (servis_id, urun_adi, miktar, birim, birim_fiyat, durum, tarih, notlar)
select t.id,
       coalesce(nullif(trim(p->>'aciklama'), ''), 'Malzeme'),
       coalesce((p->>'miktar')::numeric, 1),
       'Adet',
       coalesce((p->>'birim_fiyat')::numeric, 0),
       'kullanildi',
       now(),
       'mig 170 — form alanından taşındı'
  from servis_talepleri t,
       lateral jsonb_array_elements(t.yedek_parcalar) p
 where jsonb_array_length(coalesce(t.yedek_parcalar, '[]'::jsonb)) > 0
   and not exists (select 1 from servis_malzemeleri m where m.servis_id = t.id);

comment on column servis_talepleri.yedek_parcalar is
  'TÜRETİLMİŞ — servis_malzemeleri (durum=kullanildi) tablosundan trg_servis_yedek_parca ile üretilir. ELLE YAZMAYIN: bir sonraki malzeme değişikliğinde üzerine yazılır. Tek kaynak servis_malzemeleri (mig 170).';

comment on column servis_malzemeleri.durum is
  'planlanan = keşiften geldi, henüz kullanılmadı (müşteri formuna BASILMAZ) · kullanildi = serviste kullanıldı (forma basılır)';

notify pgrst, 'reload schema';
