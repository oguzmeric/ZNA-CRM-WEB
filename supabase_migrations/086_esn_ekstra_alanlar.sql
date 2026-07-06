-- servis_raporlari — esnweb ServisDetayi API'sinden gelen ekstra alanlar
alter table servis_raporlari
  add column if not exists servis_tipi text,           -- arzkod
  add column if not exists yukumluluk text,             -- arzkod2
  add column if not exists statu_esn text,              -- arzokod1
  add column if not exists servis_yeri text,            -- arzokod2
  add column if not exists evrak_no text,               -- evrakno
  add column if not exists adres_kodu text,             -- adreskod
  add column if not exists sistem_marka text,           -- xmarka
  add column if not exists sistem_model text,           -- xmodel
  add column if not exists teslim_alan text,            -- pdaseri
  add column if not exists varis_saati timestamptz,     -- vsaat
  add column if not exists ayrilis_saati timestamptz,   -- asaat
  add column if not exists yol_masraf numeric,          -- masrafyol
  add column if not exists yemek_masraf numeric,        -- masrafyemek
  add column if not exists konak_masraf numeric,        -- masrafkonak
  add column if not exists mesafe_km numeric,           -- mesafekm
  add column if not exists imza_url text,               -- storage path
  add column if not exists esn_senkron timestamptz;     -- son senkron zamanı

notify pgrst, 'reload schema';
