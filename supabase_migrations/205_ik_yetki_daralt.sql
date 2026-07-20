-- 205: İK yetkisi daraltma — SADECE ik_yonetim modülü olanlar (admin rolü BYPASS EDEMEZ).
-- Kullanıcı kararı (2026-07-20): İK modülüne yalnız Ali (1), Oğuz (2), Abdullah (44).
-- Yeni kişi eklemek istenirse Kullanıcı Yönetimi'nden 'ik_yonetim' modülü verilir.

create or replace function public.ik_yetkili()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from kullanicilar
    where auth_id = auth.uid()
      and 'ik_yonetim' = any(coalesce(moduller, '{}'))
  );
$$;

-- Ali (1) ve Oğuz (2) — Abdullah (44) mig 204'te aldı
update public.kullanicilar
   set moduller = array_append(coalesce(moduller, '{}'), 'ik_yonetim')
 where id in (1, 2)
   and not ('ik_yonetim' = any(coalesce(moduller, '{}')));

notify pgrst, 'reload schema';

select id, ad from kullanicilar where 'ik_yonetim' = any(coalesce(moduller,'{}')) order by id;
