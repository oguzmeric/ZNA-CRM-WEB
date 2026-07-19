import { Input, Select } from './Input'

// Basit tarih + saat seçici — native datetime-local'in uzun saat/dakika scroll'una alternatif.
// Değer sözleşmesi datetime-local ile birebir aynı: 'YYYY-MM-DDTHH:mm' (ya da boş string).
// onChange(yeniDeger:string) — event DEĞİL, doğrudan string döner.
//
// Tarih için native takvim (scroll yok), saat 00-23 dropdown, dakika 5'er adım dropdown.
// Böylece hiç kaydırma gerekmeden hızlıca tarih+saat seçilir.

const pad = (n) => String(n).padStart(2, '0')

function parcala(value) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value || '')
  return m ? { tarih: m[1], saat: m[2], dakika: m[3] } : { tarih: '', saat: '', dakika: '' }
}

export function TarihSaatSecici({
  value,
  onChange,
  min,
  varsayilanSaat = '09',
  varsayilanDakika = '00',
  dakikaAdim = 5,
  style,
  id,
  disabled,
}) {
  const { tarih, saat, dakika } = parcala(value)

  const emit = (t, s, d) => {
    if (!t) { onChange(''); return }               // tarih yoksa değer boş
    onChange(`${t}T${s || varsayilanSaat}:${d || varsayilanDakika}`)
  }

  // Saat 00-23
  const saatler = Array.from({ length: 24 }, (_, i) => pad(i))
  // Dakika: adımlı liste + mevcut değer adıma denk gelmiyorsa onu da ekle
  const dakikalar = []
  for (let i = 0; i < 60; i += dakikaAdim) dakikalar.push(pad(i))
  if (dakika && !dakikalar.includes(dakika)) {
    dakikalar.push(dakika)
    dakikalar.sort()
  }

  const selStyle = { height: 36, width: 'auto', minWidth: 72, paddingRight: 30, flex: '0 0 auto' }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', ...style }}>
      <Input
        id={id}
        type="date"
        value={tarih}
        disabled={disabled}
        min={min ? String(min).slice(0, 10) : undefined}
        onChange={(e) => emit(e.target.value, saat, dakika)}
        style={{ flex: '1 1 150px', minWidth: 140, colorScheme: 'light' }}
      />
      <Select
        aria-label="Saat"
        value={saat || ''}
        disabled={disabled || !tarih}
        onChange={(e) => emit(tarih, e.target.value, dakika)}
        style={selStyle}
      >
        {!saat && <option value="" disabled>Saat</option>}
        {saatler.map((h) => <option key={h} value={h}>{h}</option>)}
      </Select>
      <span style={{ color: 'var(--text-tertiary)', fontWeight: 600, margin: '0 -2px' }}>:</span>
      <Select
        aria-label="Dakika"
        value={dakika || ''}
        disabled={disabled || !tarih}
        onChange={(e) => emit(tarih, saat, e.target.value)}
        style={selStyle}
      >
        {!dakika && <option value="" disabled>Dk</option>}
        {dakikalar.map((mm) => <option key={mm} value={mm}>{mm}</option>)}
      </Select>
    </div>
  )
}

export default TarihSaatSecici
