// Puantaj mesai ücreti hesabı — TEK KAYNAK (teklifHesap.js dersi).
// Formül kaynağı: "Mesai ücreti hesaplanırken çalışılan günün niteliği.docx"
// (17.08.2026, kullanıcı verdi):
//   saat ücreti   = brüt maaş ÷ bölen (varsayılan 225)
//   hafta içi FM  = saat ücreti × 1,5 · Pazar × 2,5 · resmî tatil × 2,0
// Ara değerler YUVARLANMAZ, yalnız satır sonuçları kuruşa yuvarlanır
// (belgedeki örnek: 98,20889 ara değeri × 15 = 2.207,70 sonuç).

export const kurus = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const VARSAYILAN_AYAR = {
  aylikSaatBolen: 225,
  haftaIciKatsayi: 1.5,
  pazarKatsayi: 2.5,
  resmiTatilKatsayi: 2.0,
}

// Döneme (yil, ay) o tarihte geçerli brüt maaşı seç: gecerliBaslangic ay
// SONUNU aşmayan kayıtların en yenisi. Kayıt yoksa null (UI uyarı basar).
export const donemMaasiSec = (maaslar = [], yil, ay) => {
  const aySonu = new Date(Date.UTC(yil, ay, 0)).toISOString().slice(0, 10)
  const uygun = maaslar
    .filter(m => m.gecerliBaslangic && m.gecerliBaslangic <= aySonu)
    .sort((a, b) => (a.gecerliBaslangic < b.gecerliBaslangic ? 1 : -1))
  return uygun[0] || null
}

// Dakikaları ve brüt maaşı ücrete çevirir. brutTutar yoksa tutarlar null
// (0 DEĞİL — "maaş girilmedi" ile "mesai yok" ayrımı kaybolmasın;
// alis_fiyat "not null default 0" tuzağının dersi).
export const puantajSatirHesapla = ({
  brutTutar,
  haftaIciDakika = 0,
  pazarDakika = 0,
  resmiTatilDakika = 0,
  ayar = VARSAYILAN_AYAR,
}) => {
  const hiSaat = (Number(haftaIciDakika) || 0) / 60
  const pzSaat = (Number(pazarDakika) || 0) / 60
  const rtSaat = (Number(resmiTatilDakika) || 0) / 60
  if (brutTutar == null || !(Number(brutTutar) > 0)) {
    return {
      saatUcreti: null, hiSaat, pzSaat, rtSaat,
      hiTutar: null, pzTutar: null, rtTutar: null,
      mesaiToplam: null, genelToplam: null,
    }
  }
  const brut = Number(brutTutar)
  const saatUcreti = brut / Number(ayar.aylikSaatBolen || 225)
  const hiTutar = kurus(hiSaat * saatUcreti * Number(ayar.haftaIciKatsayi))
  const pzTutar = kurus(pzSaat * saatUcreti * Number(ayar.pazarKatsayi))
  const rtTutar = kurus(rtSaat * saatUcreti * Number(ayar.resmiTatilKatsayi))
  const mesaiToplam = kurus(hiTutar + pzTutar + rtTutar)
  return {
    saatUcreti: kurus(saatUcreti), hiSaat, pzSaat, rtSaat,
    hiTutar, pzTutar, rtTutar,
    mesaiToplam,
    genelToplam: kurus(brut + mesaiToplam),
  }
}

// Otomatik dakika + varsa elle düzeltme → geçerli dakikalar.
// Düzeltmede NULL alan = otomatik değer korunur (kısmi düzeltme).
export const gecerliDakikalar = (oto = {}, duzeltme = null) => ({
  haftaIciDakika: duzeltme?.haftaIciDakika ?? (oto.haftaIciDakika || 0),
  pazarDakika: duzeltme?.pazarDakika ?? (oto.pazarDakika || 0),
  resmiTatilDakika: duzeltme?.resmiTatilDakika ?? 0,
  duzeltilmis: duzeltme != null && (
    duzeltme.haftaIciDakika != null || duzeltme.pazarDakika != null
    || (duzeltme.resmiTatilDakika || 0) > 0
  ),
})

export const saatBicim = (saat) =>
  (Math.round((Number(saat) || 0) * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
