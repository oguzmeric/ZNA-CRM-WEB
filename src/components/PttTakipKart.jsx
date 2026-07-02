// PTT gönderi son durum ve hareket geçmişi kartı — Kargo Detay'da gösterilir.
// Sadece kargo firması 'ptt' ve takipNo dolu ise renderlanır.

import { useEffect, useState } from 'react'
import { RefreshCw, MapPin, Package, Truck, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { pttTakipGetir, pttTakipCacheTemizle } from '../services/pttTakipService'
import { Card, CardTitle, Button, Badge } from './ui'

const DURUM_IKON = {
  kabul:        Package,
  transfer:     Truck,
  dagitimda:    Truck,
  teslim_edildi: CheckCircle2,
}

function tarihFormat(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('tr-TR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export default function PttTakipKart({ takipNo }) {
  const [yukleniyor, setYukleniyor] = useState(false)
  const [veri, setVeri] = useState(null)
  const [hata, setHata] = useState(null)

  const yukle = async (yenile = false) => {
    setYukleniyor(true); setHata(null)
    try {
      const r = await pttTakipGetir(takipNo, { yenile })
      if (r?.ok) setVeri(r)
      else setHata(r?.hata || 'Bilinmeyen hata')
    } catch (e) {
      setHata(e?.message || 'Bağlantı hatası')
    } finally { setYukleniyor(false) }
  }

  useEffect(() => {
    if (takipNo) yukle(false)
  }, [takipNo])

  return (
    <Card style={{ marginTop: 12, borderLeft: '3px solid #3b82f6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div>
          <CardTitle style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Truck size={16} strokeWidth={1.5} style={{ color: '#3b82f6' }} />
            PTT Gönderi Durumu
            {veri?.demo && <Badge tone="beklemede">DEMO</Badge>}
          </CardTitle>
          {veri?.sonGuncelleme && (
            <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4 }}>
              Son güncelleme: {tarihFormat(veri.sonGuncelleme)}
              {veri?.kaynak === 'cache' && <span style={{ marginLeft: 8, color: 'var(--text-tertiary)' }}>· önbellekten</span>}
            </div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<RefreshCw size={12} strokeWidth={1.5} />}
          onClick={() => { pttTakipCacheTemizle(takipNo); yukle(true) }}
          disabled={yukleniyor}
        >
          {yukleniyor ? 'Yükleniyor…' : 'Yenile'}
        </Button>
      </div>

      {veri?.demo && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B',
          borderRadius: 8, padding: 8, marginBottom: 12,
          font: '500 11.5px/16px var(--font-sans)', color: '#B45309',
        }}>
          Bu bir <b>demo veri</b>. Gerçek PTT API anahtarı geldiğinde canlı veriler burada görünecek.
        </div>
      )}

      {hata && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid #EF4444',
          borderRadius: 8, padding: 10,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <AlertTriangle size={14} strokeWidth={1.5} style={{ color: '#DC2626', flexShrink: 0 }} />
          <span style={{ font: '500 12px/16px var(--font-sans)', color: '#991B1B' }}>{hata}</span>
        </div>
      )}

      {yukleniyor && !veri && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 12px/16px var(--font-sans)' }}>
          Son durum sorgulanıyor…
        </div>
      )}

      {veri?.sonDurum && (
        <>
          <div style={{
            padding: 12, borderRadius: 8,
            background: 'rgba(59,130,246,0.06)',
            border: '1px solid rgba(59,130,246,0.15)',
            marginBottom: 14,
          }}>
            <div style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Şu Anki Durum
            </div>
            <div style={{ font: '700 15px/20px var(--font-sans)', color: '#1E40AF' }}>
              {veri.sonDurum}
            </div>
          </div>

          {veri.hareketler?.length > 0 && (
            <div>
              <div style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Hareket Geçmişi
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {veri.hareketler.map((h, i) => {
                  const Ikon = DURUM_IKON[h.durum] || Clock
                  const sonMu = i === 0
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%',
                          background: sonMu ? '#3b82f6' : 'var(--surface-sunken)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: sonMu ? 'none' : '1px solid var(--border-default)',
                        }}>
                          <Ikon size={12} strokeWidth={1.8} style={{ color: sonMu ? '#fff' : 'var(--text-secondary)' }} />
                        </div>
                        {i < veri.hareketler.length - 1 && (
                          <div style={{ width: 2, flex: 1, minHeight: 20, background: 'var(--border-subtle)' }} />
                        )}
                      </div>
                      <div style={{ paddingBottom: 12, flex: 1 }}>
                        <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                          {h.aciklama || 'Durum güncellendi'}
                        </div>
                        {h.konum && (
                          <div style={{ font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={10} strokeWidth={1.5} />
                            {h.konum}
                          </div>
                        )}
                        <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {tarihFormat(h.tarih)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
