-- 099: RLS "Always True" policy'lerini gerçek sahiplik kontrolüne daralt
-- Advisor: "RLS Policy Always True" (9 warning) → 0
--
-- Etkilenen tablolar:
--   - notlarim                       (kişisel not — kullanici_id)
--   - kullanici_push_tokenlari       (push token — kullanici_id)
--   - kullanici_takvim_baglantilari  (takvim bağlantısı — kullanici_id)
--   - servis_formu_arsivi            (staff-only arşiv — is_staff)
--
-- Öncesi: `USING (true)` — herhangi bir authenticated kullanıcı hepsini görebilir
-- Sonrası: sahiplik ya da is_staff() kontrolü

-- ══════════════════════════════════════════════════════════════════════
-- notlarim: sadece sahibi CRUD yapabilir
-- ══════════════════════════════════════════════════════════════════════
drop policy if exists "auth_select_notlarim" on public.notlarim;
drop policy if exists "auth_insert_notlarim" on public.notlarim;
drop policy if exists "auth_update_notlarim" on public.notlarim;
drop policy if exists "auth_delete_notlarim" on public.notlarim;

create policy "notlarim_owner_select" on public.notlarim
  for select to authenticated
  using (kullanici_id = current_kullanici_id());

create policy "notlarim_owner_insert" on public.notlarim
  for insert to authenticated
  with check (kullanici_id = current_kullanici_id());

create policy "notlarim_owner_update" on public.notlarim
  for update to authenticated
  using (kullanici_id = current_kullanici_id())
  with check (kullanici_id = current_kullanici_id());

create policy "notlarim_owner_delete" on public.notlarim
  for delete to authenticated
  using (kullanici_id = current_kullanici_id());

-- ══════════════════════════════════════════════════════════════════════
-- kullanici_push_tokenlari: sadece sahibi CRUD yapabilir
-- ══════════════════════════════════════════════════════════════════════
drop policy if exists "auth_select_own_tokens" on public.kullanici_push_tokenlari;
drop policy if exists "auth_insert_tokens" on public.kullanici_push_tokenlari;
drop policy if exists "auth_update_own_tokens" on public.kullanici_push_tokenlari;
drop policy if exists "auth_delete_own_tokens" on public.kullanici_push_tokenlari;

create policy "push_tokens_owner_select" on public.kullanici_push_tokenlari
  for select to authenticated
  using (kullanici_id = current_kullanici_id());

create policy "push_tokens_owner_insert" on public.kullanici_push_tokenlari
  for insert to authenticated
  with check (kullanici_id = current_kullanici_id());

create policy "push_tokens_owner_update" on public.kullanici_push_tokenlari
  for update to authenticated
  using (kullanici_id = current_kullanici_id())
  with check (kullanici_id = current_kullanici_id());

create policy "push_tokens_owner_delete" on public.kullanici_push_tokenlari
  for delete to authenticated
  using (kullanici_id = current_kullanici_id());

-- ══════════════════════════════════════════════════════════════════════
-- kullanici_takvim_baglantilari: sadece sahibi CRUD yapabilir
-- ══════════════════════════════════════════════════════════════════════
drop policy if exists "auth_select_own_baglantilar" on public.kullanici_takvim_baglantilari;
drop policy if exists "auth_delete_own_baglantilar" on public.kullanici_takvim_baglantilari;
drop policy if exists "auth_update_own_baglantilar" on public.kullanici_takvim_baglantilari;

create policy "takvim_baglanti_owner_select" on public.kullanici_takvim_baglantilari
  for select to authenticated
  using (kullanici_id = current_kullanici_id());

create policy "takvim_baglanti_owner_update" on public.kullanici_takvim_baglantilari
  for update to authenticated
  using (kullanici_id = current_kullanici_id())
  with check (kullanici_id = current_kullanici_id());

create policy "takvim_baglanti_owner_delete" on public.kullanici_takvim_baglantilari
  for delete to authenticated
  using (kullanici_id = current_kullanici_id());

-- INSERT: frontend'de kullanici_id zorunlu, sahiplik kontrolü
create policy "takvim_baglanti_owner_insert" on public.kullanici_takvim_baglantilari
  for insert to authenticated
  with check (kullanici_id = current_kullanici_id());

-- ══════════════════════════════════════════════════════════════════════
-- servis_formu_arsivi: staff-only okuma+ekleme
-- (Servis form PDF arşivi — bütün personel erişebilmeli)
-- ══════════════════════════════════════════════════════════════════════
drop policy if exists "auth_select_arsiv" on public.servis_formu_arsivi;
drop policy if exists "auth_insert_arsiv" on public.servis_formu_arsivi;

create policy "arsiv_staff_select" on public.servis_formu_arsivi
  for select to authenticated
  using (is_staff());

create policy "arsiv_staff_insert" on public.servis_formu_arsivi
  for insert to authenticated
  with check (is_staff() and olusturan_id = current_kullanici_id());
