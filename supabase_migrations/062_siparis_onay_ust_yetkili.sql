-- Siparis onay yetkilisinde "ust yetkili" kavramini eklemek icin yeni kolon.
-- Ali Aktepe en yetkili (ust yetkili). Diger onaycilar (Ahmet AGUN gibi)
-- onayladiklarinda gerekce girmek zorunda.

alter table public.kullanicilar
  add column if not exists siparis_onay_ust_yetkili boolean not null default false;

-- Ali Aktepe (id=1) ust yetkili
update public.kullanicilar
   set siparis_onay_ust_yetkili = true
 where id = 1;

-- Ahmet AGUN (id=29) sipariş onay yetkisi alir (ust yetkili degil — gerekce verecek)
update public.kullanicilar
   set siparis_onay_yetkilisi = true
 where id = 29;

notify pgrst, 'reload schema';
