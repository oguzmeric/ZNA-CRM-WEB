// Görev listesi filtre ÇEKİRDEĞİ — saf fonksiyonlar (React/DOM yok).
//
// Neden ayrı dosya (10.08 denetimi): filtre mantığı JSX'in içine dağılmıştı;
// sekme rozetleri bir kümeden, tablo başka bir kümeden sayılıyordu. Sonuç
// kullanıcıya "rozet 37 · liste 0" diye yansıyordu. Artık ikisi de aynı
// fonksiyondan (sekmeKumesi) geçer — ayrışmaları YAPISAL olarak imkânsız.
//
// Buradaki her fonksiyon saf olduğu için `scripts/test-gorev-filtre.mjs` ile
// tarayıcısız doğrulanır. Filtre davranışı değiştirilecekse ÖNCE o testi
// güncelle.

// NOT: uzantı BİLEREK yazıldı — bu modül `node scripts/test-gorev-filtre.mjs`
// ile tarayıcısız çalıştırılıyor, Node uzantısız yolu çözemez.
import {
  ACIK_DURUMLAR, KAPALI_DURUMLAR, durumBilgi,
  gorevGecikti, etkinSonTarih, bugunStr,
} from './gorevSabitleri.js'

// ─── Sekmeler (madde 30) ────────────────────────────────────────────────────
export const SEKME_LISTESI = [
  { id: 'bana',         isim: 'Bana Atananlar' },
  { id: 'olusturdugum', isim: 'Oluşturduklarım' },
  { id: 'alt',          isim: 'Alt Görevlerim' },
  { id: 'onay',         isim: 'Onay Bekleyenler' },
  { id: 'geciken',      isim: 'Gecikenler' },
  { id: 'bugun',        isim: 'Bugün Bitecekler' },
  { id: 'hafta',        isim: 'Bu Hafta Bitecekler' },
  { id: 'tamamlanan',   isim: 'Tamamlananlar' },
  { id: 'tumu',         isim: 'Tümü' },
]

// ⚠️ Kişi boyutunu ya SEKME ('Bana Atananlar', 'Oluşturduklarım'…) ya da kişi
// açılırı belirler — başka kontrol YOK. Eskiden bir de "Tümü | Görevlerim"
// anahtarı vardı; sekmelerin kopyasıydı ve kişisel sekmelerle AND'lenmesin
// diye kilitleniyordu. Varsayılan sekme de kişisel olduğu için sayfa her
// açılışta kilitli geliyor, kullanıcıya "bozuk" görünüyordu (10.08 geri
// bildirimi). Anahtar kaldırıldı; kalan tek kontrolün varsayılanı boş olduğu
// için hiçbir listeyi sessizce daraltmaz.

// ─── Kişi eşleşmesi ─────────────────────────────────────────────────────────
// Bir görev kişiye "ait" sayılır: sorumlusuysa VEYA ekibindeyse. Kapsam
// anahtarı ile kişi açılırı AYNI tanımı kullanır (eskiden açılır yalnız
// sorumluya bakıyordu — aynı kişi iki kontrolde farklı sayı veriyordu).
export const kisiyeAit = (g, id) => {
  const s = id != null ? String(id) : ''
  if (!s || !g) return false
  return String(g.atanan ?? '') === s
    || String(g.atananId ?? '') === s
    || (Array.isArray(g.ekip) && g.ekip.some(x => String(x) === s))
}

export const banaAitGorev = (g, ctx) => kisiyeAit(g, ctx?.uid)

// ⚠️ Ada düşme yalnız olusturanId BOŞSA (eski kayıtlar). id doluyken ada
// düşmek, aynı isimli iki kullanıcıda BAŞKASININ taslağını açıyordu.
export const benOlusturdum = (g, ctx) => {
  const uid = ctx?.uid
  if (!uid || !g) return false
  const oid = g.olusturanId
  if (oid != null && oid !== '') return String(oid) === String(uid)
  return !!g.olusturanAd && (g.olusturanAd === ctx.ad || g.olusturanAd === ctx.kullaniciAdi)
}

// Görünürlük: herkes tüm görevleri görür (mig 174 — RLS SELECT is_staff()).
// TEK istisna: taslak yalnız oluşturana görünür (madde 30/8).
export const gorunurMu = (g, ctx) => !!g && (g.durum !== 'taslak' || benOlusturdum(g, ctx))

// ─── Takvim ─────────────────────────────────────────────────────────────────
// Pzt–Paz aralığı. bugunStr() TR gününü verdiği için hafta da TR gününden
// türer; aritmetik UTC'de yapılır ki tarayıcı saat dilimi sonucu kaydırmasın.
export const haftaAraligi = (bugun = bugunStr()) => {
  const [y, ay, gun] = String(bugun).split('-').map(Number)
  if (!y || !ay || !gun) return { bas: '', son: '' }
  const idx = (new Date(Date.UTC(y, ay - 1, gun)).getUTCDay() + 6) % 7 // Pzt = 0
  const iso = (offset) => new Date(Date.UTC(y, ay - 1, gun + offset)).toISOString().slice(0, 10)
  return { bas: iso(-idx), son: iso(-idx + 6) }
}

// Sekme bağlamı — kullanıcı kimliği + o anki takvim. Tek yerden üretilir ki
// rozet, liste ve KPI aynı "bugün"ü konuşsun.
export const sekmeBaglami = (kullanici) => {
  const bugun = bugunStr()
  const { bas, son } = haftaAraligi(bugun)
  return {
    uid: kullanici?.id != null ? String(kullanici.id) : '',
    ad: kullanici?.ad,
    kullaniciAdi: kullanici?.kullaniciAdi,
    bugun, haftaBas: bas, haftaSon: son,
  }
}

// ─── Sekme eşleşmesi (madde 30) ─────────────────────────────────────────────
export const sekmeEsle = (g, sekmeId, ctx) => {
  if (!g) return false
  // ⚠️ Bekleme telafisi (mig 221) DAHİL bitiş. 'Gecikenler' etkin tarihe,
  // 'Bugün/Bu Hafta' ham tarihe bakıyordu; etkin bitişi bugün olan görev
  // ikisinin arasından düşüp hiçbir sekmede görünmüyor, ertesi gün doğrudan
  // "gecikmiş" beliriyordu.
  const sonT = etkinSonTarih(g) || ''
  const acikMi = !KAPALI_DURUMLAR.includes(durumBilgi(g.durum).id)
  switch (sekmeId) {
    case 'bana': return banaAitGorev(g, ctx)
    case 'olusturdugum': return benOlusturdum(g, ctx)
    case 'alt': return !!g.ustGorevId && banaAitGorev(g, ctx)
    case 'onay':
      return g.durum === 'onay_bekliyor' && (
        String(g.onaylayiciId ?? '') === ctx.uid ||
        (g.onayGerekli && !g.onaylayiciId && benOlusturdum(g, ctx))
      )
    // ⚠️ Nötr adlı sekmeler NÖTR kapsamdadır. Eskiden gizlice "benimle ilgili"ye
    // daralıyordu; yönetici "geciken iş yok" sanıyordu. Daraltmak isteyen
    // kapsam anahtarını kullanır — iki boyut birbirine karışmaz.
    case 'geciken': return gorevGecikti(g)
    case 'bugun': return acikMi && !!sonT && sonT === ctx.bugun
    case 'hafta': return acikMi && !!sonT && sonT >= ctx.haftaBas && sonT <= ctx.haftaSon
    case 'tamamlanan': return g.durum === 'tamamlandi'
    default: return true // 'tumu'
  }
}

// ─── Kapsam (kişi açılırı) ──────────────────────────────────────────────────
// Boşken hiçbir şeyi daraltmaz; bir kişi seçmek BİLİNÇLİ bir daraltmadır ve
// her sekmede aynı şekilde uygulanır (artık istisna yok — istisna, kilitli
// görünen kontroller demekti).
export const kapsamEsle = (g, ctx) => {
  if (ctx?.kisiFiltre) return kisiyeAit(g, ctx.kisiFiltre)
  return true
}

// ⭐ TEK KAYNAK — sekme rozeti de tablo da buradan geçer.
export const sekmeKumesi = (liste, sekmeId, ctx) =>
  (liste || []).filter(g => kapsamEsle(g, ctx) && sekmeEsle(g, sekmeId, ctx))

// ─── Durum chip'leri (sekme İÇİNDE ikincil filtre) ──────────────────────────
// Görsel sunum (ikon/renk) Gorevler.jsx'te; eşleşme kuralı burada.
export const CHIP_DURUMLARI = {
  // ⚠️ 'atandi' eskiden taslağı da kapsıyordu: atanmamış taslak "Atandı"
  // başlığında görünüyor, chip toplamları "Tümü"yü tutmuyordu.
  atandi:    ['bekliyor'],
  taslak:    ['taslak'],
  devam:     ['devam', 'revize'],
  beklemede: ['beklemede'],
  bilgi:     ['bilgi_bekleniyor'],
  onay:      ['onay_bekliyor'],
  tamam:     ['tamamlandi'],
  iptal:     ['iptal', 'reddedildi'],
}

export const durumEsle = (g, filtre) => {
  if (!filtre || filtre === 'hepsi') return true
  if (filtre === 'gecmis') return gorevGecikti(g)
  const dId = durumBilgi(g?.durum).id
  if (filtre === 'acik') return ACIK_DURUMLAR.includes(dId)
  if (filtre === 'kapali') return KAPALI_DURUMLAR.includes(dId)
  const durumlar = CHIP_DURUMLARI[filtre]
  return durumlar ? durumlar.includes(dId) : true
}

// ─── Metin / tarih arama yardımcıları (sütun filtreleri) ────────────────────
export const inSearch = (val, q) =>
  !q || String(val ?? '').toLocaleLowerCase('tr').includes(String(q).toLocaleLowerCase('tr'))

export const inDateEq = (val, q) => {
  if (!q) return true
  if (!val) return false
  return String(val).slice(0, 10) === q
}

// Listede "Bit. Tarih" sütununda GÖRÜNEN değer — sütun filtresi de bununla
// eşleşmeli (eskiden filtre g.sonTarih'e bakıyordu, hücre bitisTarih'i
// yazıyordu: kullanıcı gördüğü tarihi yazınca satır kayboluyordu).
export const bitisGorunen = (g) => String(g?.bitisTarih || g?.sonTarih || '').slice(0, 10)

// ─── Alt görevleri üstlerinin altına dizme (madde 32) ───────────────────────
export const hiyerarsikSirala = (liste) => {
  const idSet = new Set(liste.map(g => g.id))
  const cocukMap = new Map()
  const kokler = []
  for (const g of liste) {
    if (g.ustGorevId && idSet.has(g.ustGorevId)) {
      if (!cocukMap.has(g.ustGorevId)) cocukMap.set(g.ustGorevId, [])
      cocukMap.get(g.ustGorevId).push(g)
    } else {
      kokler.push(g)
    }
  }
  const sonuc = []
  const ekle = (g) => {
    sonuc.push(g)
    ;(cocukMap.get(g.id) || [])
      .slice()
      .sort((a, b) => String(a.gorevNo || '').localeCompare(String(b.gorevNo || '')))
      .forEach(ekle)
  }
  kokler.forEach(ekle)
  return sonuc
}
