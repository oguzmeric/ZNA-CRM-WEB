// Rota haritası — bir aracın seçilen gündeki izi.
// Çizgi = gidilen yol, P işaretleri = park duraklamaları, yeşil/kırmızı
// damla = günün ilk ve son noktası.

import { useEffect, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const saat = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}

const sureKisa = (dk) => {
  if (!dk || dk < 1) return '<1 dk'
  const s = Math.floor(dk / 60), d = Math.round(dk % 60)
  return s > 0 ? `${s} sa ${d} dk` : `${d} dk`
}

// Park işareti — süreye göre büyüyen P rozeti. Hâlâ park halindeyse
// (bitis yok) kenarlığı canlı renkte yanar.
const parkIkonu = (dk, acik) => {
  const boy = dk >= 120 ? 34 : dk >= 30 ? 30 : 26
  const renk = acik ? '#7c3aed' : '#475569'
  return new L.DivIcon({
    className: '',
    html: `<div style="
      width:${boy}px;height:${boy}px;border-radius:50%;
      background:${renk};color:#fff;border:2.5px solid #fff;
      display:flex;align-items:center;justify-content:center;
      font:700 ${Math.round(boy * 0.45)}px/1 system-ui;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
    ">P</div>`,
    iconSize: [boy, boy], iconAnchor: [boy / 2, boy / 2], popupAnchor: [0, -boy / 2],
  })
}

const uctaIkon = (renk, etiket) => new L.DivIcon({
  className: '',
  html: `<div style="
    width:30px;height:30px;background:${renk};
    border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);
  "><div style="transform:rotate(45deg);color:#fff;font:700 11px/1 system-ui;">${etiket}</div></div>`,
  iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
})

const baslangicIkon = uctaIkon('#10b981', 'B')
const bitisIkon     = uctaIkon('#dc2626', 'S')

// Rota değişince haritayı tüm izi kapsayacak şekilde ayarla
function RotayaSigdir({ noktalar }) {
  const map = useMap()
  useEffect(() => {
    if (!noktalar.length) return
    if (noktalar.length === 1) map.flyTo(noktalar[0], 15, { duration: 0.6 })
    else map.fitBounds(noktalar, { padding: [45, 45], maxZoom: 16 })
  }, [noktalar, map])
  return null
}

export default function RotaHarita({ izler = [], parklar = [], yukleniyor, yolHatlari = null }) {
  const noktalar = izler
    .filter(i => i.enlem && i.boylam)
    .map(i => [Number(i.enlem), Number(i.boylam)])

  const varsayilanMerkez = [41.0082, 28.9784]   // İstanbul

  // Yola oturtulmuş güzergâh varsa asıl çizgi odur; ham noktalar arası düz
  // hat yalnız SOLUK REFERANS olarak kalır (gerçek ölçüm noktaları görünsün).
  const yolVar = Array.isArray(yolHatlari) && yolHatlari.length > 0

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', minHeight: 460 }}>
    <MapContainer
      center={noktalar[0] || varsayilanMerkez}
      zoom={noktalar.length ? 13 : 10}
      style={{ height: '100%', width: '100%', minHeight: 460, borderRadius: 12 }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap"
      />
      <RotayaSigdir noktalar={noktalar} />

      {/* Rota çizgisi.
          Yola oturtma başarılıysa: sokaklara oturan hat ana çizgi olur,
          ham GPS noktaları arası düz bağlantı soluk kesikli çizgiye iner.
          Başarısızsa (yol servisi erişilemiyor): eski davranış, düz hat. */}
      {noktalar.length > 1 && (
        yolVar ? (
          <Polyline
            positions={noktalar}
            pathOptions={{ color: '#94a3b8', weight: 1.5, opacity: 0.5, dashArray: '4 6' }}
          />
        ) : (
          <>
            <Polyline positions={noktalar} pathOptions={{ color: '#fff', weight: 7, opacity: 0.9 }} />
            <Polyline positions={noktalar} pathOptions={{ color: '#2563eb', weight: 3.5, opacity: 0.95 }} />
          </>
        )
      )}

      {/* Yola oturtulmuş güzergâh */}
      {yolVar && yolHatlari.map((hat, i) => (
        <Fragment key={`yol-${i}`}>
          <Polyline positions={hat} pathOptions={{ color: '#fff', weight: 8, opacity: 0.9 }} />
          <Polyline positions={hat} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.95 }} />
        </Fragment>
      ))}

      {/* Gerçek ölçüm noktaları — tahmin ile ölçümü ayırt edebilmek için */}
      {yolVar && noktalar.map((n, i) => (
        <CircleMarker
          key={`n-${i}`}
          center={n}
          radius={3.5}
          pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#1d4ed8', fillOpacity: 1 }}
        >
          <Popup>
            <div style={{ fontFamily: 'system-ui', fontSize: 12 }}>
              <b>{saat(izler[i]?.olcum_zamani)}</b> · {Math.round(Number(izler[i]?.hiz || 0))} km/s
              <div style={{ color: '#888', marginTop: 3 }}>ölçülen konum</div>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Park işaretleri */}
      {parklar.map(p => {
        if (!p.enlem || !p.boylam) return null
        const acik = !p.bitis
        return (
          <Marker
            key={`p-${p.id}`}
            position={[Number(p.enlem), Number(p.boylam)]}
            icon={parkIkonu(p.sure_dk || 0, acik)}
          >
            <Popup>
              <div style={{ fontFamily: 'system-ui', minWidth: 190 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: acik ? '#7c3aed' : '#334155' }}>
                  {acik ? 'Hâlâ burada' : 'Park'}
                </div>
                <div style={{ fontSize: 13 }}>
                  {saat(p.baslangic)} → {p.bitis ? saat(p.bitis) : 'devam ediyor'}
                </div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                  Süre: {acik ? '—' : sureKisa(p.sure_dk)}
                </div>
                {p.adres && (
                  <div style={{ fontSize: 11, color: '#888', marginTop: 5 }}>{p.adres}</div>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}

      {/* Günün ilk ve son noktası */}
      {noktalar.length > 0 && (
        <Marker position={noktalar[0]} icon={baslangicIkon}>
          <Popup>
            <div style={{ fontFamily: 'system-ui' }}>
              <b>Başlangıç</b><br />{saat(izler[0]?.olcum_zamani)}
              {izler[0]?.adres && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{izler[0].adres}</div>}
            </div>
          </Popup>
        </Marker>
      )}
      {noktalar.length > 1 && (
        <Marker position={noktalar[noktalar.length - 1]} icon={bitisIkon}>
          <Popup>
            <div style={{ fontFamily: 'system-ui' }}>
              <b>Son konum</b><br />{saat(izler[izler.length - 1]?.olcum_zamani)}
              {izler[izler.length - 1]?.adres && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{izler[izler.length - 1].adres}</div>
              )}
            </div>
          </Popup>
        </Marker>
      )}

    </MapContainer>

    {/* Boş durum bindirmesi — MapContainer'ın DIŞINDA: içine konan düz HTML
        Leaflet'in kendi katman alanına girer ve konumlandırması bozulur. */}
    {!yukleniyor && noktalar.length === 0 && (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.72)', pointerEvents: 'none',
        borderRadius: 12,
      }}>
        <div style={{
          background: '#fff', padding: '14px 20px', borderRadius: 10,
          border: '1px solid var(--border-default)', textAlign: 'center',
          font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)',
          boxShadow: '0 4px 16px rgba(0,0,0,.08)',
        }}>
          Bu gün için kayıt yok.
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Rota kaydı 4 Ağustos 2026'da başladı — öncesi için veri yok.
          </div>
        </div>
      </div>
    )}
    </div>
  )
}
