// OneDrive dosya seçici entegrasyonu (Microsoft OneDrive File Picker v7.2).
//
// Gereksinim: Azure (Entra ID) uygulama kaydı — Client ID `uygulama_ayarlari`
// tablosunda 'onedrive_client_id' anahtarıyla tutulur (admin, Dokümanlarım'daki
// kurulum ekranından yapıştırır). Redirect URI olarak uygulamanın origin'i
// Azure'da SPA platformuna eklenmiş olmalıdır.
//
// Akış: OneDrive.open(action:'download') → seçilen öğeler @microsoft.graph.downloadUrl
// (ön yetkili, CORS-açık) içerir → fetch ile indirilir → File objesi döner →
// mevcut dokumanEkle() yoluyla CRM deposuna (kisi-dokuman bucket) kopyalanır.

const SDK_URL = 'https://js.live.net/v7.2/OneDrive.js'

let sdkPromise = null

export const oneDriveSdkYukle = () => {
  if (window.OneDrive) return Promise.resolve(window.OneDrive)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    s.onload = () => window.OneDrive
      ? resolve(window.OneDrive)
      : reject(new Error('OneDrive SDK yüklenemedi.'))
    s.onerror = () => {
      sdkPromise = null
      reject(new Error('OneDrive SDK indirilemedi — ağ/CSP engeli olabilir.'))
    }
    document.head.appendChild(s)
  })
  return sdkPromise
}

/**
 * Seçiciyi açar; kullanıcının seçtiği öğeleri döner.
 * mod:
 *  - 'link'  → action:'share': OneDrive paylaşım linki üretilir (dosya KOPYALANMAZ,
 *              Supabase deposunda yer kaplamaz; linki ekip de açabilir)
 *  - 'kopya' → action:'download': ön yetkili indirme URL'i döner (CRM'e kopyalamak için)
 * Dönen her öğe: { name, size, downloadUrl, webUrl, paylasimUrl }
 * Kullanıcı vazgeçerse boş dizi döner.
 */
export const oneDriveSec = async (clientId, mod = 'link') => {
  const OneDrive = await oneDriveSdkYukle()
  return new Promise((resolve, reject) => {
    OneDrive.open({
      clientId,
      action: mod === 'kopya' ? 'download' : 'share',
      multiSelect: true,
      advanced: {
        redirectUri: window.location.origin,
        filter: 'folder,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.zip',
      },
      success: (resp) => {
        const ogeler = (resp?.value || []).map(v => ({
          name: v.name,
          size: v.size || 0,
          downloadUrl: v['@microsoft.graph.downloadUrl'] || v['@content.downloadUrl'] || null,
          webUrl: v.webUrl || null,
          // action:'share' yanıtında üretilen paylaşım linki permissions altında gelir
          paylasimUrl: v.permissions?.[0]?.link?.webUrl || v.webUrl || null,
        }))
        resolve(ogeler)
      },
      cancel: () => resolve([]),
      error: (e) => reject(new Error(e?.message || 'OneDrive seçici hatası')),
    })
  })
}

/** Seçilen öğeyi indirip File objesine çevirir (CRM deposuna kopyalamak için). */
export const oneDriveDosyaIndir = async (oge) => {
  if (!oge.downloadUrl) throw new Error(`"${oge.name}" için indirme bağlantısı alınamadı.`)
  const res = await fetch(oge.downloadUrl)
  if (!res.ok) throw new Error(`"${oge.name}" indirilemedi (${res.status}).`)
  const blob = await res.blob()
  return new File([blob], oge.name, { type: blob.type || 'application/octet-stream' })
}

export const ONEDRIVE_AYAR_ANAHTARI = 'onedrive_client_id'

// Azure kurulum adımları — kurulum modalında gösterilir
export const ONEDRIVE_KURULUM_ADIMLARI = [
  'portal.azure.com → Microsoft Entra ID → App registrations → New registration',
  'İsim: "ZNA CRM". Hesap türü: şirkette Microsoft 365 varsa "Accounts in this organizational directory + personal", yalnız kişisel OneDrive ise "Personal Microsoft accounts"',
  'Redirect URI: platform "Single-page application (SPA)" seçin, değer olarak bu sitenin adresini girin',
  'Kayıt sonrası Overview sayfasındaki "Application (client) ID" değerini kopyalayın',
  'API permissions → Add a permission → Microsoft Graph → Delegated → Files.Read ekleyin',
  'Kopyaladığınız Client ID\'yi aşağıya yapıştırıp kaydedin',
]
