// Yeni sürüm yayınlandığında açık kalan sekmeleri kurtarır.
//
// SORUN (19.08, Ahmet'in "CRM çalışmıyor" bildirimi): Uygulama 96 sayfayı
// lazy chunk olarak yüklüyor. Yeni sürüm yayına alınınca Vercel eski build'in
// dosyalarını siliyor — ölçüldü, eski `index-*.js` 404 dönüyor. Dünden kalan
// sekmede kullanıcı bir menüye tıklıyor, chunk 404 alıyor, sayfa hiç açılmıyor.
// Ekranda hata da çıkmıyor: Suspense fallback'inde asılı kalıyor. Kullanıcı
// gözünden bu "sistem çalışmıyor"dur. Çözümü sayfayı yenilemek — ama kullanıcı
// bunu bilmiyor.
//
// ⚠️ BURADAKİ TEK GERÇEK TEHLİKE SONSUZ YENİLEME DÖNGÜSÜ. Chunk gerçekten
// yoksa (bozuk deploy) "hata → yenile → hata → yenile" herkesin tarayıcısını
// kilitler; özgün arızadan çok daha kötüsü olur. Üç ayrı kilit var:
//
//   1) `elealindi` — aynı sayfa ömründe en fazla bir kez tetiklenir.
//   2) sessionStorage damgası — son yenilemenin üstünden TEKRAR_ARALIK_MS
//      geçmediyse BİR DAHA yenilemez, kullanıcıya şerit gösterir.
//   3) Damga YAZILAMIYORSA (özel mod / storage kapalı) yenileme HİÇ yapılmaz.
//      Damgasız yenileme, 2. kilidi işlevsiz bırakacağı için döngü demektir.
//      Bu durumda doğrudan şeride düşülür.
//
// Şerit React'e dokunmadan düz DOM ile kurulur: chunk hatası çoğu kez React
// ağacının kendisini yükleyemediği anda olur, o noktada React'e güvenilemez.

const DAMGA_ANAHTAR = 'zna-surum-tazeleme'
const TEKRAR_ARALIK_MS = 60_000

// Tarayıcı/paket ayrımı olmadan chunk hatasını tanıyan kalıplar.
// Chrome: "Failed to fetch dynamically imported module"
// Firefox: "error loading dynamically imported module"
// Safari: "Importing a module script failed"
const CHUNK_KALIPLARI = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
]

let elealindi = false

const damgaOku = () => {
  try { return parseInt(sessionStorage.getItem(DAMGA_ANAHTAR) || '0', 10) || 0 }
  catch { return 0 }
}

// Yazabildiyse true. false dönerse yenileme YAPILMAZ (yukarıdaki 3. kilit).
const damgaYaz = () => {
  try {
    sessionStorage.setItem(DAMGA_ANAHTAR, String(Date.now()))
    return sessionStorage.getItem(DAMGA_ANAHTAR) !== null
  } catch { return false }
}

const chunkHatasiMi = (deger) => {
  const metin = String(deger?.message || deger || '').toLowerCase()
  return CHUNK_KALIPLARI.some(k => metin.includes(k))
}

function seritGoster() {
  if (typeof document === 'undefined' || !document.body) return
  if (document.getElementById('zna-surum-serit')) return

  const serit = document.createElement('div')
  serit.id = 'zna-surum-serit'
  serit.setAttribute('role', 'alert')
  // Sabit renkler bilerek: bu şerit CSS yüklenememişken de okunabilmeli.
  serit.style.cssText = [
    'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:2147483647',
    'display:flex', 'align-items:center', 'justify-content:center',
    'flex-wrap:wrap', 'gap:14px', 'padding:11px 18px',
    'background:#133B70', 'color:#ffffff',
    'font:500 13px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'box-shadow:0 2px 12px rgba(0,0,0,.22)',
  ].join(';')

  const metin = document.createElement('span')
  metin.textContent = 'Yeni sürüm yayınlandı. Kaldığınız yerden devam etmek için sayfayı yenileyin.'

  const dugme = document.createElement('button')
  dugme.type = 'button'
  dugme.textContent = 'Şimdi yenile'
  dugme.style.cssText = [
    'padding:6px 16px', 'border:none', 'border-radius:6px',
    'background:#ffffff', 'color:#133B70', 'cursor:pointer',
    'font:500 13px/18px inherit',
  ].join(';')
  // Damgaya DOKUNULMAZ: yenilenen sayfada hata sürerse 2. kilit devrede
  // kalsın, tekrar otomatik yenilemeye dönmesin.
  dugme.addEventListener('click', () => window.location.reload())

  serit.append(metin, dugme)
  document.body.appendChild(serit)
}

function eleAl(kaynak) {
  if (elealindi) return
  elealindi = true

  const gecen = Date.now() - damgaOku()
  if (gecen < TEKRAR_ARALIK_MS) {
    // Az önce yenilendi ve hâlâ hata var — yenilemek çözmüyor demektir.
    console.warn('[surum] yenileme çözmedi, karar kullanıcıya bırakılıyor:', kaynak)
    seritGoster()
    return
  }

  if (!damgaYaz()) {
    console.warn('[surum] damga yazılamadı, otomatik yenileme yapılmıyor:', kaynak)
    seritGoster()
    return
  }

  console.warn('[surum] yeni sürüm algılandı, sayfa yenileniyor:', kaynak)
  window.location.reload()
}

export function surumTazelemeKur() {
  if (typeof window === 'undefined') return

  // Vite'ın kendi sinyali: modulepreload başarısız olduğunda fırlar.
  // preventDefault çağrılmazsa Vite varsayılan olarak hatayı yeniden fırlatır.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    eleAl('vite:preloadError')
  })

  // React.lazy import'u reddedildiğinde buradan gelir. Kalıp eşleşmesi dar
  // tutuldu — her yakalanmamış reddi sayfa yenilemesine çevirmek çok tehlikeli.
  window.addEventListener('unhandledrejection', (e) => {
    if (chunkHatasiMi(e.reason)) eleAl('unhandledrejection')
  })

  window.addEventListener('error', (e) => {
    if (chunkHatasiMi(e.error || e.message)) eleAl('error')
  })
}

// Testlerin/konsolun davranışı doğrulayabilmesi için açıldı.
export const _icTest = { chunkHatasiMi, DAMGA_ANAHTAR, TEKRAR_ARALIK_MS }
