// Blob'u kullanıcıya kaydettirir. Modern tarayıcılarda (Chrome/Edge)
// yerel "Farklı Kaydet" penceresi açar — kullanıcı klasörü seçer.
// Desteklenmezse (Safari/Firefox) ya da izin verilmezse eskisi gibi
// Downloads klasörüne otomatik indirir.

const mimeMap = {
  pdf:  { desc: 'PDF Belgesi',    ext: '.pdf',  type: 'application/pdf' },
  xlsx: { desc: 'Excel Belgesi',  ext: '.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv:  { desc: 'CSV Dosyası',    ext: '.csv',  type: 'text/csv' },
  txt:  { desc: 'Metin Dosyası',  ext: '.txt',  type: 'text/plain' },
  json: { desc: 'JSON Dosyası',   ext: '.json', type: 'application/json' },
  png:  { desc: 'PNG Görsel',     ext: '.png',  type: 'image/png' },
  jpg:  { desc: 'JPEG Görsel',    ext: '.jpg',  type: 'image/jpeg' },
}

function uzantidanTip(dosyaAdi) {
  const m = /\.([a-z0-9]+)$/i.exec(dosyaAdi || '')
  const uz = m ? m[1].toLowerCase() : ''
  return mimeMap[uz] || { desc: 'Dosya', ext: uz ? '.' + uz : '', type: 'application/octet-stream' }
}

// Modern akış: showSaveFilePicker → kullanıcı klasör seçer.
async function farkliKaydet(blob, dosyaAdi) {
  const bilgi = uzantidanTip(dosyaAdi)
  const handle = await window.showSaveFilePicker({
    suggestedName: dosyaAdi,
    types: [{ description: bilgi.desc, accept: { [bilgi.type]: [bilgi.ext] } }],
  })
  const yazar = await handle.createWritable()
  await yazar.write(blob)
  await yazar.close()
}

// Fallback: <a download> ile otomatik Downloads'a düşür.
function otomatikIndir(blob, dosyaAdi) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dosyaAdi
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Ana giriş: önce Farklı Kaydet dene, olmazsa/iptal edilirse otomatik indir.
export async function dosyayiKaydet(blob, dosyaAdi) {
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      await farkliKaydet(blob, dosyaAdi)
      return { yol: 'kullanici' }
    } catch (e) {
      // Kullanıcı iptal ettiyse sessizce geç, aksi halde loglayıp fallback'e düş
      if (e?.name === 'AbortError') return { yol: 'iptal' }
      console.warn('[dosyayiKaydet] showSaveFilePicker hata:', e?.message)
    }
  }
  otomatikIndir(blob, dosyaAdi)
  return { yol: 'oto' }
}
