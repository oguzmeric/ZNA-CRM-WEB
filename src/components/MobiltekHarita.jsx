// Mobiltek haritası — react-leaflet ile OSM tabanlı. Token gerekmez.
// Araç konumlarını marker olarak yerleştirir; seçili aracın markerı vurgulanır.

import { useEffect, useRef, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
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

// Yakınlık rozeti — iki aracın orta noktasında mesafe/süre etiketi.
// Alarm verilmişse kırmızı + nabız animasyonu, değilse sarı izleme etiketi.
const yakinlikIcon = (alarm, mesafe, dk) => new L.DivIcon({
  className: '',
  html: `
    <style>@keyframes znaYakinlikNabiz{0%{box-shadow:0 0 0 0 rgba(220,38,38,.45)}70%{box-shadow:0 0 0 14px rgba(220,38,38,0)}100%{box-shadow:0 0 0 0 rgba(220,38,38,0)}}</style>
    <div style="
      transform:translate(-50%,-50%);
      display:inline-flex;align-items:center;gap:5px;
      padding:4px 10px;border-radius:999px;white-space:nowrap;
      background:${alarm ? '#dc2626' : '#f59e0b'};color:#fff;
      font:700 11px/14px system-ui;border:2px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.25);
      ${alarm ? 'animation:znaYakinlikNabiz 1.6s ease-out infinite;' : ''}
    ">${alarm ? '⚠' : '👁'} ${mesafe}m · ${dk} dk</div>`,
  iconSize: [0, 0], iconAnchor: [0, 0],
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

export default function MobiltekHarita({ araclar = [], kameralar = [], yakinliklar = [], seciliArac, onAracSec }) {
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
      {/* Yakınlık çiftleri — kesikli hat + orta noktada mesafe rozeti */}
      {yakinliklar.map(y => {
        const a1 = araclar.find(a => a.plateNo === y.arac1_plaka)
        const a2 = araclar.find(a => a.plateNo === y.arac2_plaka)
        if (!a1?.lat || !a2?.lat) return null
        const p1 = [Number(a1.lat), Number(a1.lng)]
        const p2 = [Number(a2.lat), Number(a2.lng)]
        const orta = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
        const alarm = !!y.alarm_verildi
        const renk = alarm ? '#dc2626' : '#f59e0b'
        const dk = Math.max(0, Math.round((Date.now() - new Date(y.ilk_zaman)) / 60000))
        return (
          <Fragment key={`y-${y.id}`}>
            <Polyline positions={[p1, p2]} pathOptions={{ color: renk, weight: 3, dashArray: '6 8', opacity: 0.85 }} />
            <Marker position={orta} icon={yakinlikIcon(alarm, y.son_mesafe_m, dk)}>
              <Popup>
                <div style={{ fontFamily: 'system-ui', minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: renk }}>
                    {alarm ? '🚨 Yakınlık Alarmı' : '👁 Yakınlık İzleniyor'}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{y.arac1_plaka} ↔ {y.arac2_plaka}</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                    {y.son_mesafe_m} m mesafe · {dk} dakikadır birlikte
                  </div>
                  {y.son_adres && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{y.son_adres}</div>}
                </div>
              </Popup>
            </Marker>
          </Fragment>
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
