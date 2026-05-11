// Profil/Ayarlar altında: kullanıcının harici takvim bağlantıları.
// Şu an Gmail destekleniyor. Outlook ileride.

import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, Trash2, AlertCircle, CheckCircle2, Loader2, Calendar } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Card, Button, Badge } from '../components/ui'
import {
  takvimBaglantilariniGetir,
  takvimBaglantisiKaldir,
  takvimSyncTetikle,
  googleOAuthBaslat,
} from '../services/takvimBaglantiService'

function formatTarih(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function gectiHedef(tarih) {
  if (!tarih) return null
  const ms = Date.now() - new Date(tarih).getTime()
  const dk = Math.floor(ms / 60000)
  if (dk < 1) return 'şimdi'
  if (dk < 60) return `${dk} dk önce`
  const sa = Math.floor(dk / 60)
  if (sa < 24) return `${sa} saat önce`
  const gun = Math.floor(sa / 24)
  return `${gun} gün önce`
}

export default function TakvimBaglantilari() {
  const { kullanici } = useAuth()
  const { toast } = useToast()
  const [baglantilar, setBaglantilar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [syncEden, setSyncEden] = useState(null)  // hangi baglantiId şu an sync ediliyor

  const yukle = useCallback(async () => {
    if (!kullanici?.id) { setYukleniyor(false); return }
    setYukleniyor(true)
    try {
      const data = await takvimBaglantilariniGetir(kullanici.id)
      setBaglantilar(data)
    } finally {
      setYukleniyor(false)
    }
  }, [kullanici?.id])

  useEffect(() => { yukle() }, [yukle])

  const gmailBagla = () => {
    if (!kullanici?.id) {
      toast.error('Önce giriş yap.')
      return
    }
    const url = googleOAuthBaslat(kullanici.id, window.location.origin)
    window.location.href = url
  }

  const sync = async (baglantiId) => {
    setSyncEden(baglantiId)
    try {
      const sonuc = await takvimSyncTetikle(baglantiId)
      toast.success(`${sonuc.upserted ?? 0} etkinlik senkronize edildi`)
      await yukle()
    } catch (e) {
      toast.error('Senkronizasyon hatası: ' + (e?.message ?? 'bilinmeyen'))
    } finally {
      setSyncEden(null)
    }
  }

  const kaldir = async (baglantiId, email) => {
    if (!window.confirm(`${email} bağlantısı kaldırılsın mı? Senkronize edilen etkinlikler de silinir.`)) return
    try {
      await takvimBaglantisiKaldir(baglantiId)
      toast.success('Bağlantı kaldırıldı.')
      await yukle()
    } catch (e) {
      toast.error('Kaldırılamadı: ' + (e?.message ?? 'bilinmeyen'))
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ font: '700 24px/32px var(--font-sans)', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={24} /> Takvim Bağlantıları
        </h1>
        <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 6 }}>
          Gmail (ve gelecekte Outlook) takvimlerini CRM'in takvim ekranıyla senkronize et.
          Bağladığın hesabın etkinlikleri Takvim sekmesinde gösterilir.
        </p>
      </div>

      {/* Yeni bağlantı ekle */}
      <Card padding={16} style={{ marginBottom: 16 }}>
        <h3 style={{ font: '700 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0, marginBottom: 12 }}>
          Yeni Bağlantı Ekle
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={gmailBagla}>
            <Mail size={16} style={{ marginRight: 6 }} /> Gmail / Google Takvim Bağla
          </Button>
          <Button variant="secondary" disabled title="Yakında — Microsoft Graph entegrasyonu">
            Outlook Bağla (yakında)
          </Button>
        </div>
        <p style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 8 }}>
          Bağlandığında yalnızca okuma yetkisi alınır — etkinliklerini değiştirmiyoruz, sadece görüntülüyoruz.
        </p>
      </Card>

      {/* Mevcut bağlantılar */}
      <Card padding={16}>
        <h3 style={{ font: '700 14px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0, marginBottom: 12 }}>
          Bağlı Hesaplar
        </h3>

        {yukleniyor ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-tertiary)' }} />
          </div>
        ) : baglantilar.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
            Henüz bağlı hesap yok. Yukarıdan bir tane ekle.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {baglantilar.map((b) => (
              <div
                key={b.id}
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Mail size={16} color="var(--brand-primary)" />
                    <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                      {b.hesap_email}
                    </span>
                    <Badge tone={b.saglayici === 'google' ? 'aktif' : 'beklemede'}>
                      {b.saglayici === 'google' ? 'Google' : 'Outlook'}
                    </Badge>
                    {!b.aktif && <Badge tone="pasif">Devre dışı</Badge>}
                  </div>
                  <div style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {b.son_sync_hatasi ? (
                      <>
                        <AlertCircle size={11} color="var(--danger)" />
                        <span style={{ color: 'var(--danger)' }}>{b.son_sync_hatasi}</span>
                      </>
                    ) : b.son_sync_zamani ? (
                      <>
                        <CheckCircle2 size={11} color="var(--success)" />
                        Son senkronizasyon: {gectiHedef(b.son_sync_zamani)} ({formatTarih(b.son_sync_zamani)})
                      </>
                    ) : (
                      <span>Henüz senkronize edilmedi — manuel başlat</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => sync(b.id)}
                    disabled={syncEden === b.id}
                  >
                    {syncEden === b.id ? (
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    <span style={{ marginLeft: 4 }}>Senkronize</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => kaldir(b.id, b.hesap_email)}
                  >
                    <Trash2 size={14} color="var(--danger)" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
