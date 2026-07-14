// Not içeriği köprüsü — web Notlarım ReactQuill ile HTML kaydeder
// (<p>, <br>, &nbsp;...), mobil ise düz metin editörü kullanır.
// Mobilde: HTML → okunur düz metin. Kaydederken: düz metin → basit HTML
// (satır başına <p>) ki web Quill'de satırlar kaybolmasın.

const ENTITY_MAP = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

export const htmlMi = (s) => /<\/?[a-z][^>]*>|&nbsp;|&amp;|&lt;/i.test(String(s || ''))

// HTML → düz metin: blok kapanışları satır sonu olur, listeler madde işareti alır
export const htmlToDuzMetin = (s) => {
  if (!s) return ''
  let t = String(s)
  if (!htmlMi(t)) return t
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<li[^>]*>/gi, '• ')
  t = t.replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
  t = t.replace(/<[^>]+>/g, '')
  for (const [ent, ch] of Object.entries(ENTITY_MAP)) {
    t = t.split(ent).join(ch)
  }
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

// Düz metin → basit HTML (web Quill uyumlu): her satır bir <p>
export const duzMetinToHtml = (s) => {
  if (!s) return ''
  const kacir = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return String(s)
    .split('\n')
    .map((satir) => (satir.trim() ? `<p>${kacir(satir)}</p>` : '<p><br></p>'))
    .join('')
}
