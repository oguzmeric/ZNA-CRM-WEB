// Ofis konumu — Oğuz-only. Haritadan pin sürükle, tolerans/sert limit ayarla.
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Save, Crosshair } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card, Button } from '../components/ui'

// Leaflet default icon fix (Vite serve)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Haritaya tıkla → pin taşı
function PinYerlestirici({ onDegistir }) {
  useMapEvents({ click(e) { onDegistir([e.latlng.lat, e.latlng.lng]) } })
  return null
}

// Merkezi güncelleyen yardımcı
function Ortala({ merkez }) {
  const map = useMap()
  useEffect(() => { if (merkez) map.setView(merkez, map.getZoom() < 12 ? 16 : map.getZoom()) }, [merkez, map])
  return null
}

export default function OfisKonumu() {
  const [ofis, setOfis] = useState(null)
  const [konum, setKonum] = useState(null)
  const [tolerans, setTolerans] = useState(150)
  const [sertLimit, setSertLimit] = useState(400)
  const [ad, setAd] = useState('Merkez Ofis')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [mesaj, setMesaj] = useState(null)

  useEffect(() => {
    supabase.from('ofis_konumu').select('*').limit(1).single().then(({ data }) => {
      if (!data) return
      setOfis(data)
      setAd(data.ad ?? 'Merkez Ofis')
      setTolerans(data.tolerans_metre ?? 150)
      setSertLimit(data.sert_limit_metre ?? 400)
      if (data.lat && data.lng) setKonum([Number(data.lat), Number(data.lng)])
    })
  }, [])

  const kaydet = async () => {
    if (!konum) { setMesaj({ tip: 'hata', txt: 'Haritadan bir nokta seç' }); return }
    if (Number(sertLimit) <= Number(tolerans)) {
      setMesaj({ tip: 'hata', txt: 'Sert limit toleranstan büyük olmalı' }); return
    }
    setKaydediliyor(true)
    setMesaj(null)
    const { error } = await supabase.from('ofis_konumu').update({
      ad,
      lat: konum[0],
      lng: konum[1],
      tolerans_metre: Number(tolerans),
      sert_limit_metre: Number(sertLimit),
      guncelleme_zamani: new Date().toISOString(),
    }).eq('id', ofis.id)
    setKaydediliyor(false)
    if (error) setMesaj({ tip: 'hata', txt: 'Hata: ' + error.message })
    else setMesaj({ tip: 'basari', txt: 'Kaydedildi ✓' })
  }

  const tarayiciKonumumaGit = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      p => setKonum([p.coords.latitude, p.coords.longitude]),
      () => setMesaj({ tip: 'hata', txt: 'Konum alınamadı' }),
    )
  }

  const varsMerkez = konum ?? [39.0, 35.0]

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="t-h1" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <MapPin size={22} strokeWidth={1.75} /> Ofis Konumu
        </h1>
        <p className="t-caption" style={{ marginTop: 4 }}>
          Mesai QR'ının doğrulama merkezi. Haritada bir noktaya tıkla ya da tarayıcı konumumu al de.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
        <Card padding={0} style={{ overflow: 'hidden', minHeight: 500 }}>
          <MapContainer
            center={varsMerkez}
            zoom={konum ? 16 : 6}
            style={{ height: 500, width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap'
            />
            <PinYerlestirici onDegistir={setKonum} />
            {konum && <Ortala merkez={konum} />}
            {konum && <Marker position={konum} />}
          </MapContainer>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Ofis adı
                </label>
                <input
                  type="text" value={ad} onChange={e => setAd(e.target.value)}
                  style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Seçili koordinat
                </label>
                <p style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', margin: 0, marginTop: 4 }}>
                  {konum
                    ? <>{konum[0].toFixed(6)}, {konum[1].toFixed(6)}</>
                    : <span style={{ color: 'var(--text-tertiary)' }}>Haritadan bir nokta seç</span>}
                </p>
              </div>

              <Button
                variant="secondary"
                iconLeft={<Crosshair size={14} strokeWidth={1.5} />}
                onClick={tarayiciKonumumaGit}
                size="sm"
              >
                Tarayıcı konumumu al
              </Button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>Tolerans (m)</label>
                  <input
                    type="number" min={20} max={1000} value={tolerans}
                    onChange={e => setTolerans(e.target.value)}
                    style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}
                  />
                  <p style={{ font: '400 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Bu mesafeden uzaksa "Ofis dışı" uyarısı.
                  </p>
                </div>
                <div>
                  <label style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>Sert limit (m)</label>
                  <input
                    type="number" min={100} max={5000} value={sertLimit}
                    onChange={e => setSertLimit(e.target.value)}
                    style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface-sunken)', color: 'var(--text-primary)' }}
                  />
                  <p style={{ font: '400 10px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Bu mesafe aşılırsa mesai kesinlikle açılamaz.
                  </p>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={kaydet}
                disabled={kaydediliyor}
                iconLeft={<Save size={14} strokeWidth={1.5} />}
              >
                {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>

              {mesaj && (
                <div style={{
                  padding: 10, borderRadius: 8, fontSize: 12,
                  background: mesaj.tip === 'basari' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                  color: mesaj.tip === 'basari' ? 'var(--success)' : 'var(--danger)',
                }}>
                  {mesaj.txt}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <p style={{ font: '600 12px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, margin: 0 }}>
              QR Kodu
            </p>
            <p style={{ font: '400 12px/18px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 6 }}>
              QR ofis id'sine bağlı olarak sabit. Yeni QR üretmek gerekiyorsa (secret rotasyonu vs.), Claude ile birlikte yapılır. Aktif QR PDF'i Downloads klasöründe.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
