// Idle timeout'un "son aktivite" damgası — IdleTimeoutContext ve AuthContext
// ortak kullanır. Ayrı modül olmasının sebebi: IdleTimeoutContext zaten
// AuthContext'i import ediyor, ters yönde import dairesel bağımlılık olurdu.

export const AKTIVITE_KEY = 'zna-son-aktivite'

export const aktiviteDamgala = (zaman = Date.now()) => {
  try { localStorage.setItem(AKTIVITE_KEY, String(zaman)) } catch { /* ignore */ }
}

export const aktiviteOku = () => {
  try {
    const ham = localStorage.getItem(AKTIVITE_KEY)
    if (!ham) return null
    const zaman = parseInt(ham, 10)
    return Number.isNaN(zaman) ? null : zaman
  } catch { return null }
}

export const aktiviteTemizle = () => {
  try { localStorage.removeItem(AKTIVITE_KEY) } catch { /* ignore */ }
}
