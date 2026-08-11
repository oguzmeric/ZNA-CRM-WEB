import { YAS_KOVALARI, kisaTutar, tamTutar } from '../lib/teklifTakip'

// ─── AÇIK TEKLİF TAKİP ŞERİDİ ───
// Canlı ölçüm (11.08.2026): 914 açık teklif, ₺25,1M; 442'si (₺8,2M) 31-90,
// 386'sı (₺15M) 90+ gündür bekliyor. Hiçbir ekranda görünmüyordu.
//
// Düzen kuralları (kullanıcı "profesyonellikten uzak" geri bildirimi sonrası):
//  • Hücreler eşit genişlikte GRID — flex + gap düzensiz görünüyordu.
//  • Her hücrede tek hiyerarşi: etiket (10px) → adet (19px) → tutar (11px).
//  • Kritik kovalarda sinyali ÜST KENAR ŞERİDİ taşır, rakam nötr kalır;
//    renkli rakam hem okunurluğu düşürüyor hem şeridi alacalı gösteriyordu.
//  • Kişi bandı kendi satırında — üst satıra sıkıştırılınca hizalama bozuluyordu.

const ETIKET = {
  font: '600 10px/14px var(--font-sans)',
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  whiteSpace: 'nowrap',
}
const ADET = {
  font: '700 19px/24px var(--font-sans)',
  color: 'var(--text-primary)',
  fontVariantNumeric: 'tabular-nums',
}
const TUTAR = {
  font: '500 11px/16px var(--font-sans)',
  color: 'var(--text-secondary)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}

export default function AcikTeklifSeridi({ ozet, kisiYuku = [], yasFiltresi, aktif, onKovaSec }) {
  if (!ozet || ozet.toplamAdet === 0) return null

  const tarihsizVar = ozet.tarihsiz.adet > 0
  const kovalar = tarihsizVar
    ? [...YAS_KOVALARI, { id: 'tarihsiz', etiket: 'Tarihsiz', ton: null }]
    : YAS_KOVALARI

  return (
    <div style={{
      marginBottom: 12,
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `minmax(150px, 1.4fr) repeat(${kovalar.length}, minmax(94px, 1fr))`,
        overflowX: 'auto',
      }}>
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 1, borderTop: '2px solid transparent' }}>
          <span style={ETIKET}>Açık teklif</span>
          <span style={ADET}>{ozet.toplamAdet}</span>
          <span style={TUTAR}>{tamTutar(ozet.toplamTutar)}</span>
        </div>

        {kovalar.map(k => {
          const v = k.id === 'tarihsiz' ? ozet.tarihsiz : ozet.kovalar[k.id]
          const secili = yasFiltresi === k.id && aktif
          // Nötr kovalarda üst şerit saydam kalır — yer kaplar, hizayı korur
          const vurgu = k.ton && k.ton !== 'var(--text-secondary)' ? k.ton : null
          return (
            <button
              key={k.id}
              onClick={() => onKovaSec(k.id)}
              title={k.id === 'tarihsiz'
                ? `Teklif tarihi girilmemiş açık teklifler — ${v.adet} teklif`
                : `${k.etiket} bekleyen açık teklifleri listele — ${v.adet} teklif, ${tamTutar(v.tutar)}`}
              style={{
                padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: 1,
                border: 'none', borderLeft: '1px solid var(--border-default)',
                borderTop: `2px solid ${vurgu || 'transparent'}`,
                background: secili ? 'var(--surface-sunken)' : 'transparent',
                opacity: v.adet === 0 ? 0.5 : 1,
                transition: 'background 120ms',
              }}
            >
              <span style={{ ...ETIKET, color: secili ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                {k.etiket}
              </span>
              <span style={ADET}>{v.adet}</span>
              <span style={TUTAR}>{k.id === 'tarihsiz' ? ' ' : kisaTutar(v.tutar)}</span>
            </button>
          )
        })}
      </div>

      {/* ⚠️ Atıf HAZIRLAYAN'a göre (bkz. teklifSahibi). Hesap sahibine bakan
          eski sürüm Ali'ye 334 teklif yazıyordu; gerçekte 26'sı onundu, geri
          kalanı onun hesabından girilen Sadık/Tarık/Salih teklifleriydi. */}
      {kisiYuku.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '7px 14px', borderTop: '1px solid var(--border-default)',
          background: 'var(--surface-sunken)',
        }}>
          <span style={ETIKET}>Hazırlayana göre</span>
          {kisiYuku.map(k => (
            <span
              key={k.kisi}
              title={`${k.kisi} — ${k.adet} açık teklif · ${tamTutar(k.tutar)} · en eskisi ${k.enEskiGun} gündür bekliyor`}
              style={{ font: '500 11px/16px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
            >
              {k.kisi.split(' ')[0]}{' '}
              <b style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{k.adet}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
