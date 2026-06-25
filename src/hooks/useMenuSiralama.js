// Menü sıralaması kullanıcı bazlı — drag-drop ile yeniden sıralanabilir.
// localStorage'da {kullaniciId: [menuId1, menuId2, ...]} olarak tutulur.
//
// Yeni eklenen menüler (kaydedilmemiş id) varsayılan listenin sonundaki sırasında
// orjinal yerinde kalır — yani kullanıcı yeni özellikleri kaçırmaz.

import { useState, useEffect, useMemo, useCallback } from 'react'

const STORAGE_KEY = 'menu-siralama'

function tumStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function kaydet(kullaniciId, idListe) {
  try {
    const tum = tumStored()
    tum[kullaniciId] = idListe
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tum))
  } catch {}
}
function sil(kullaniciId) {
  try {
    const tum = tumStored()
    delete tum[kullaniciId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tum))
  } catch {}
}

/**
 * @param {Array<{id:string}>} menuItems - rendered menu items (zaten yetki filtrelenmiş)
 * @param {string|number} kullaniciId
 * @returns {{ siralanmis: Array, yenidenSirala: (newIds:string[]) => void, ozellestirildiMi: boolean, sifirla: () => void }}
 */
export function useMenuSiralama(menuItems, kullaniciId) {
  const key = String(kullaniciId ?? 'anon')
  const [storedIds, setStoredIds] = useState(() => {
    return tumStored()[key] ?? null
  })

  // Kullanıcı değişirse stored yenile
  useEffect(() => {
    setStoredIds(tumStored()[key] ?? null)
  }, [key])

  const siralanmis = useMemo(() => {
    if (!storedIds || !Array.isArray(storedIds) || storedIds.length === 0) {
      return menuItems
    }
    // Kaydedilen sıraya göre sırala; storedIds'de olmayan yeni öğeler en sona
    const idx = new Map(storedIds.map((id, i) => [id, i]))
    const sirali = [...menuItems].sort((a, b) => {
      const ai = idx.has(a.id) ? idx.get(a.id) : Number.MAX_SAFE_INTEGER
      const bi = idx.has(b.id) ? idx.get(b.id) : Number.MAX_SAFE_INTEGER
      if (ai === bi) return 0
      return ai - bi
    })
    return sirali
  }, [menuItems, storedIds])

  const yenidenSirala = useCallback((newIds) => {
    setStoredIds(newIds)
    kaydet(key, newIds)
  }, [key])

  const sifirla = useCallback(() => {
    setStoredIds(null)
    sil(key)
  }, [key])

  const ozellestirildiMi = !!storedIds && storedIds.length > 0

  return { siralanmis, yenidenSirala, ozellestirildiMi, sifirla }
}
