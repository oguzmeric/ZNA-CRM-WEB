// Depodaki SN'leri doğrudan MÜŞTERİYE/LOKASYONA takma modalı (21.08).
// Model Detay'ın toplu barından açılır: müşteri ara-seç → (varsa) tanımlı
// lokasyonunu seç → Tak. Kalemler 'sahada' olur, defteri köprü trigger yazar.
import { useEffect, useMemo, useState } from 'react'
import { Home, Search } from 'lucide-react'
import { musterileriGetir } from '../services/musteriService'
import { musteriLokasyonlariniGetir } from '../services/musteriLokasyonService'
import { Modal, Button, Label, SearchInput } from './ui'
import LokasyonSecici from './LokasyonSecici'

const musteriEtiket = (m) =>
  m.firma?.trim() || [m.ad, m.soyad].filter(Boolean).join(' ').trim() || `#${m.id}`

export default function MusteriyeTakModal({ acik, adet, onKapat, onTak }) {
  const [musteriler, setMusteriler] = useState([])
  const [arama, setArama] = useState('')
  const [seciliMusteri, setSeciliMusteri] = useState(null)
  const [lokasyonlar, setLokasyonlar] = useState([])
  const [lokasyonId, setLokasyonId] = useState(null)
  const [calisiyor, setCalisiyor] = useState(false)

  useEffect(() => {
    if (!acik) return
    musterileriGetir().then(d => setMusteriler(d || [])).catch(() => setMusteriler([]))
  }, [acik])

  // Müşteri seçilince tanımlı lokasyonları yükle (yoksa seçici hiç çıkmaz).
  // Sıfırlama setState'leri async sınırın İÇİNDE — effect gövdesinde senkron
  // setState cascade render uyarısı veriyor (kural: react-hooks/set-state-in-effect).
  useEffect(() => {
    let iptal = false
    ;(async () => {
      if (!seciliMusteri?.id) {
        if (!iptal) { setLokasyonlar([]); setLokasyonId(null) }
        return
      }
      const l = await musteriLokasyonlariniGetir(seciliMusteri.id).catch(() => [])
      if (!iptal) {
        setLokasyonId(null)
        setLokasyonlar((l || []).filter(x => x.aktif !== false))
      }
    })()
    return () => { iptal = true }
  }, [seciliMusteri?.id])

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    if (!q) return musteriler.slice(0, 30)
    return musteriler
      .filter(m => `${m.firma || ''} ${m.ad || ''} ${m.soyad || ''}`.toLocaleLowerCase('tr').includes(q))
      .slice(0, 30)
  }, [musteriler, arama])

  const kapat = () => {
    if (calisiyor) return
    setArama(''); setSeciliMusteri(null); setLokasyonId(null)
    onKapat()
  }

  const tak = async () => {
    if (!seciliMusteri || calisiyor) return
    setCalisiyor(true)
    try {
      await onTak({
        musteriId: seciliMusteri.id,
        musteriLokasyonId: lokasyonId || null,
        etiket: musteriEtiket(seciliMusteri),
      })
      kapat()
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <Modal
      open={acik}
      onClose={kapat}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Home size={16} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
          Müşteriye Tak ({adet} S/N)
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={kapat} disabled={calisiyor}>Vazgeç</Button>
          <Button
            variant="primary"
            iconLeft={<Home size={14} strokeWidth={1.8} />}
            onClick={tak}
            disabled={!seciliMusteri || calisiyor}
          >
            {calisiyor ? 'Takılıyor…' : `Tak (${adet})`}
          </Button>
        </>
      }
      width={520}
    >
      <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
        Seçili S/N'ler <b>sahada</b> durumuna geçer, müşterinin envanterine
        (Cihazlarım) düşer ve stok defterine çıkış kaydı işlenir.
      </p>

      <Label required>Müşteri</Label>
      {seciliMusteri ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '9px 12px', borderRadius: 'var(--radius-sm)',
          background: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary)',
        }}>
          <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--brand-primary)' }}>
            {musteriEtiket(seciliMusteri)}
          </span>
          <button
            type="button"
            onClick={() => setSeciliMusteri(null)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--brand-primary)', font: '600 12px/16px var(--font-sans)',
              textDecoration: 'underline',
            }}
          >
            Değiştir
          </button>
        </div>
      ) : (
        <>
          <SearchInput
            value={arama}
            onChange={e => setArama(e.target.value)}
            placeholder="Firma veya kişi adıyla ara…"
            autoFocus
          />
          <div style={{
            maxHeight: 220, overflowY: 'auto', marginTop: 6,
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
          }}>
            {filtreli.length === 0 ? (
              <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-tertiary)', padding: 12, margin: 0 }}>
                <Search size={12} strokeWidth={1.8} style={{ verticalAlign: -2, marginRight: 4 }} />
                Aramaya uyan müşteri yok.
              </p>
            ) : filtreli.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSeciliMusteri(m)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border-default)',
                  cursor: 'pointer',
                  font: '400 13px/18px var(--font-sans)', color: 'var(--text-primary)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {musteriEtiket(m)}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Tanımlı lokasyonu olan müşteride seçici — yoksa bölüm hiç çıkmaz */}
      {seciliMusteri && lokasyonlar.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Label>Lokasyon <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(isteğe bağlı)</span></Label>
          <LokasyonSecici
            lokasyonlar={lokasyonlar}
            value={lokasyonId}
            onChange={(id) => setLokasyonId(id ?? null)}
            bosEtiket="— Lokasyon belirtmeden tak —"
            placeholder="Lokasyon ara ve seç…"
            ipucuVer={(l) => l.adres || null}
          />
        </div>
      )}
    </Modal>
  )
}
