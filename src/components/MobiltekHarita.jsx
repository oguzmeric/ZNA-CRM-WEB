// Mobiltek haritası — react-leaflet ile OSM tabanlı. Token gerekmez.
// Araç konumlarını marker olarak yerleştirir; seçili aracın markerı vurgulanır.

import { useEffect, useRef } from 'react'
// useRef zaten yukarıda import edildi
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet default icon yolları — Vite'ta broken oluyor, elle set edelim
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Renkli marker — motor durumuna göre yeşil/gri
const yesilIcon = new L.DivIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#10b981;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(16,185,129,0.5);border:2px solid #fff;">
    <div style="transform:rotate(45deg);color:#fff;font-size:16px;font-weight:700;">🚚</div>
  </div>`,
  iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -30],
})

const griIcon = new L.DivIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#64748b;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.3);border:2px solid #fff;">
    <div style="transform:rotate(45deg);color:#fff;font-size:16px;">🚚</div>
  </div>`,
  iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -30],
})

const kameraIcon = new L.DivIcon({
  className: '',
  html: `<div style="width:24px;height:24px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(59,130,246,0.5);border:2px solid #fff;color:#fff;font-size:12px;">📹</div>`,
  iconSize: [24, 24], iconAnchor: [12, 12],
})

// Seçili araç değişince haritayı ortala
function OrtalayiciKontrol({ merkez, zoom = 13 }) {
  const map = useMap()
  useEffect(() => {
    if (merkez) map.flyTo(merkez, zoom, { duration: 0.7 })
  }, [merkez, zoom])
  return null
}

// Seçili araç yoksa tüm araçları içeren bounds'a otomatik zoom (bir kez)
function HepsiniGosterKontrol({ araclar, aktif }) {
  const map = useMap()
  const yapildi = useRef(false)
  useEffect(() => {
    if (!aktif || yapildi.current) return
    const noktalar = araclar.filter(a => a.lat && a.lng).map(a => [Number(a.lat), Number(a.lng)])
    if (noktalar.length === 0) return
    if (noktalar.length === 1) {
      map.flyTo(noktalar[0], 13, { duration: 0.7 })
    } else {
      map.fitBounds(noktalar, { padding: [40, 40], maxZoom: 12 })
    }
    yapildi.current = true
  }, [araclar, aktif, map])
  return null
}

export default function MobiltekHarita({ araclar = [], kameralar = [], seciliArac, onAracSec }) {
  // Türkiye ortasını başlangıç yap
  const varsayilanMerkez = [39.0, 35.0]
  const merkez = seciliArac?.lat && seciliArac?.lng
    ? [Number(seciliArac.lat), Number(seciliArac.lng)]
    : (araclar[0]?.lat ? [Number(araclar[0].lat), Number(araclar[0].lng)] : varsayilanMerkez)

  return (
    <MapContainer
      center={merkez}
      zoom={araclar.length ? 11 : 6}
      style={{ height: '100%', width: '100%', minHeight: 340, borderRadius: 12 }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© OpenStreetMap'
      />
      {seciliArac && seciliArac.lat && (
        <OrtalayiciKontrol merkez={[Number(seciliArac.lat), Number(seciliArac.lng)]} zoom={13} />
      )}
      <HepsiniGosterKontrol araclar={araclar} aktif={!seciliArac} />

      {araclar.map(a => {
        if (!a.lat || !a.lng) return null
        const kontak = a.ignition === '1' || a.engineStatus === 'on'
        return (
          <Marker
            key={a.id}
            position={[Number(a.lat), Number(a.lng)]}
            icon={kontak ? yesilIcon : griIcon}
            eventHandlers={{ click: () => onAracSec?.(a) }}
          >
            <Popup>
              <div style={{ fontFamily: 'system-ui', minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{a.plateNo}</div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  {Number(a.gpsSpeed || 0)} km/s · {kontak ? 'kontak açık' : 'kontak kapalı'}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{a.gpsTime}</div>
              </div>
            </Popup>
          </Marker>
        )
      })}
      {kameralar.map((k, i) => {
        if (!k.lat || !k.lng) return null
        return (
          <Marker key={`k-${i}`} position={[Number(k.lat), Number(k.lng)]} icon={kameraIcon}>
            <Popup>
              <div style={{ fontFamily: 'system-ui' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Kamera {i + 1}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{k.gpsTime}</div>
                {k.urlCamera && (
                  <a href={k.urlCamera} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: 12 }}>
                    Yeni sekmede aç →
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
