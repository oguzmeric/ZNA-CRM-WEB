// KAYDEDİLMEMİŞ FORM KORUMASI — merkez (22.08 denetimi).
//
// Sorun: 17.08 vakası — kullanıcı uzun formu doldurup Kaydet'e basmadan
// sidebar'dan başka sayfaya geçti, veri sessizce gitti. Mevcut korumalar
// yalnız `beforeunload` (sekme kapatma) dinliyordu; uygulama İÇİ geçişleri
// (sidebar, Ctrl+K paleti, bildirim tıklaması, sayfa içi Geri) hiçbiri
// kapsamıyordu. react-router'ın useBlocker'ı YALNIZ data router'da çalışır;
// uygulama BrowserRouter kullanıyor (main.jsx) — o yüzden koruma burada:
// formlar kendilerini "kirli mi?" fonksiyonuyla kaydeder, geçiş yapan yerler
// (MainLayout, KomutPaleti, geri butonları) navigate'ten ÖNCE `cikisOnayi()`
// sorar. Tarayıcı geri tuşu (popstate) bu mimaride kapsanmaz — bilinçli sınır.
import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import { useConfirm } from './ConfirmContext'

const KirliFormContext = createContext(null)

export function KirliFormProvider({ children }) {
  const { confirm } = useConfirm()
  const kayitlar = useRef(new Map())   // key -> () => boolean

  const kayitEt = useCallback((key, kirliMiFn) => { kayitlar.current.set(key, kirliMiFn) }, [])
  const kaldir = useCallback((key) => { kayitlar.current.delete(key) }, [])
  const kirliMi = useCallback(() => {
    for (const fn of kayitlar.current.values()) { try { if (fn()) return true } catch { /* yut */ } }
    return false
  }, [])

  // true = geçiş serbest (kirli form yok ya da kullanıcı "yine de çık" dedi)
  const cikisOnayi = useCallback(async () => {
    if (!kirliMi()) return true
    return confirm({
      baslik: 'Kaydedilmemiş değişiklikler var',
      mesaj: 'Bu sayfadaki form kaydedilmedi. Çıkarsan yazdıkların KAYBOLUR.',
      onayMetin: 'Yine de çık',
      iptalMetin: 'Kalıp kaydedeyim',
      tip: 'tehlikeli',
    })
  }, [kirliMi, confirm])

  const deger = useMemo(() => ({ kayitEt, kaldir, kirliMi, cikisOnayi }), [kayitEt, kaldir, kirliMi, cikisOnayi])
  return <KirliFormContext.Provider value={deger}>{children}</KirliFormContext.Provider>
}

// Provider dışında (ör. yazdır sayfaları, portal) çağrılırsa korumasız ama KIRILMAZ.
// eslint-disable-next-line react-refresh/only-export-components -- hook, context ile aynı dosyada (ConfirmContext deseni)
export function useKirliForm() {
  const ctx = useContext(KirliFormContext)
  return ctx || { kayitEt: () => {}, kaldir: () => {}, kirliMi: () => false, cikisOnayi: async () => true }
}
