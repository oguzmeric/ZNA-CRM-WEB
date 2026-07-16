// Yorum/görev ekleri — public bucket urun-gorselleri, klasörlü.
// Dönen nesne: { url, name, type, size } (public URL — doğrudan <img>/<a>).
// Authenticated SDK upload (storage RLS is_staff geçer; ANON bearer yasak —
// bkz. reference_mobil_storage_upload / perf oturumu).
import { supabase } from './supabase'

const BUCKET = 'urun-gorselleri'
export const MAX_EK_BOYUT = 25 * 1024 * 1024 // 25MB

export async function ekleriYukle(klasor, files) {
  const sonuc = []
  for (const f of files) {
    if (f.size > MAX_EK_BOYUT) throw new Error(`${f.name}: 25MB üstü dosya eklenemez`)
    const safe = f.name.replace(/[^\w.\-]/g, '_')
    const yol = `${klasor}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safe}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(yol, f, { contentType: f.type || undefined, upsert: false })
    if (error) throw new Error(`${f.name}: ${error.message}`)
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(yol)
    sonuc.push({ url: data.publicUrl, name: f.name, type: f.type || '', size: f.size ?? null })
  }
  return sonuc
}
