import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Trash2, Building2, Handshake, ArrowRight, CheckSquare, FileText,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { gorevGetir, gorevGuncelle } from '../services/gorevService'
import { useServisTalebi } from '../context/ServisTalebiContext'
import {
  Button, Textarea, Card, CardTitle, Badge, Avatar, EmptyState, SegmentedControl,
} from '../components/ui'

const oncelikler = [
  { id: 'dusuk',  isim: 'Düşük',  tone: 'pasif' },
  { id: 'orta',   isim: 'Orta',   tone: 'beklemede' },
  { id: 'yuksek', isim: 'Yüksek', tone: 'kayip' },
]

const durumlar = [
  { id: 'bekliyor',   isim: 'Bekliyor',     tone: 'pasif' },
  { id: 'devam',      isim: 'Devam Ediyor', tone: 'lead' },
  { id: 'tamamlandi', isim: 'Tamamlandı',   tone: 'aktif' },
]

function GorevDetay() {
  const { id } = useParams()
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { talepOlusturGorevden } = useServisTalebi()
  const [servisOlusturuluyor, setServisOlusturuluyor] = useState(false)
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [gorev, setGorev] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [yeniYorum, setYeniYorum] = useState('')
  const [duzenleYorumId, setDuzenleYorumId] = useState(null)
  const [duzenleIcerik, setDuzenleIcerik] = useState('')

  useEffect(() => {
    gorevGetir(id)
      .then(d => setGorev(d))
      .catch(err => console.error('[GorevDetay yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [id])

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  if (!gorev) return (
    <div style={{ padding: 24 }}>
      <EmptyState
        icon={<CheckSquare size={32} strokeWidth={1.5} />}
        title="Görev bulunamadı"
        action={
          <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate('/gorevler')}>
            Görevlere dön
          </Button>
        }
      />
    </div>
  )

  const oncelik = oncelikler.find(o => o.id === gorev.oncelik)
  const durum   = durumlar.find(d => d.id === gorev.durum)
  const atananKisi = kullanicilar.find(k => k.id?.toString() === gorev.atanan?.toString())

  const durumGuncelle = async (yeniDurum) => {
    await gorevGuncelle(gorev.id, { durum: yeniDurum })
    setGorev(prev => ({ ...prev, durum: yeniDurum }))
    toast.success('Durum güncellendi.')
  }

  const yorumEkle = async () => {
    if (!yeniYorum.trim()) return
    const yorum = {
      id: crypto.randomUUID(),
      yazar: kullanici.ad, yazarId: kullanici.id,
      icerik: yeniYorum,
      tarih: new Date().toLocaleString('tr-TR'),
    }
    const yeniYorumlar = [...(gorev.yorumlar || []), yorum]
    await gorevGuncelle(gorev.id, { yorumlar: yeniYorumlar })
    setGorev(prev => ({ ...prev, yorumlar: yeniYorumlar }))
    setYeniYorum('')
    toast.success('Yorum eklendi.')
  }

  const duzenlemeBaslat = (yorum) => { setDuzenleYorumId(yorum.id); setDuzenleIcerik(yorum.icerik) }
  const duzenlemeIptal  = () => { setDuzenleYorumId(null); setDuzenleIcerik('') }

  const yorumGuncelle = async () => {
    if (!duzenleIcerik.trim()) return
    const yeniYorumlar = (gorev.yorumlar || []).map(y =>
      y.id === duzenleYorumId
        ? { ...y, icerik: duzenleIcerik.trim(), duzenlendi: true, duzenlemeTarihi: new Date().toLocaleString('tr-TR') }
        : y
    )
    await gorevGuncelle(gorev.id, { yorumlar: yeniYorumlar })
    setGorev(prev => ({ ...prev, yorumlar: yeniYorumlar }))
    duzenlemeIptal()
    toast.success('Yorum güncellendi.')
  }

  const yorumSil = async (yorumId) => {
    const onay = await confirm({
      baslik: 'Yorumu Sil',
      mesaj: 'Bu yorum kalıcı olarak silinecek. Emin misiniz?',
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const yeniYorumlar = (gorev.yorumlar || []).filter(y => y.id !== yorumId)
    await gorevGuncelle(gorev.id, { yorumlar: yeniYorumlar })
    setGorev(prev => ({ ...prev, yorumlar: yeniYorumlar }))
    toast.success('Yorum silindi.')
  }

  const kendisiMi = (yorum) => {
    if (yorum.yazarId && kullanici.id) return String(yorum.yazarId) === String(kullanici.id)
    return yorum.yazar === kullanici.ad
  }

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto' }}>

      {/* Geri */}
      <button
        onClick={() => navigate('/gorevler')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-tertiary)', font: '500 13px/18px var(--font-sans)',
          marginBottom: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--brand-primary)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> Görevlere dön
      </button>

      {/* Başlık kartı */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {oncelik && <Badge tone={oncelik.tone}>{oncelik.isim}</Badge>}
          {durum   && <Badge tone={durum.tone}>{durum.isim}</Badge>}
        </div>
        <h1 className="t-h1" style={{ marginBottom: 8 }}>{gorev.baslik}</h1>
        {gorev.aciklama && (
          <p style={{ font: '400 14px/20px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
            {gorev.aciklama}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, paddingTop: 16, marginTop: 16, borderTop: '1px solid var(--border-default)' }}>
          <div>
            <div className="t-label" style={{ marginBottom: 4 }}>ATANAN</div>
            {atananKisi ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                <Avatar name={atananKisi.ad} size="xs" />
                {atananKisi.ad}
              </span>
            ) : <span style={{ color: 'var(--text-tertiary)' }}>Bilinmiyor</span>}
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 4 }}>SON TARİH</div>
            <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{gorev.sonTarih || '—'}</span>
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 4 }}>OLUŞTURAN</div>
            <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{gorev.olusturanAd || '—'}</span>
          </div>
          {gorev.musteriAdi && (
            <div>
              <div className="t-label" style={{ marginBottom: 4 }}>İLGİLİ MÜŞTERİ</div>
              <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{gorev.musteriAdi}</div>
              {gorev.firmaAdi && (
                <button
                  onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(gorev.firmaAdi)}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)', marginTop: 2 }}
                >
                  <Building2 size={11} strokeWidth={1.5} /> {gorev.firmaAdi}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bağlı görüşme */}
        {gorev.gorusmeId && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <div className="t-label" style={{ marginBottom: 8 }}>BAĞLI GÖRÜŞME</div>
            <button
              onClick={() => navigate(`/gorusmeler/${gorev.gorusmeId}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--brand-primary-soft)',
                border: '1px solid var(--border-default)',
                cursor: 'pointer',
                transition: 'border-color 120ms',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
            >
              <Handshake size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{gorev.gorusmeFirma}</span>
              {gorev.gorusmeAktNo && (
                <span style={{ font: '400 12px/16px var(--font-mono)', color: 'var(--text-tertiary)' }}>{gorev.gorusmeAktNo}</span>
              )}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)' }}>
                Görüşmeye git <ArrowRight size={12} strokeWidth={1.5} />
              </span>
            </button>
          </div>
        )}

        {/* Bağlı / Oluşturulacak servis talebi */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
          <div className="t-label" style={{ marginBottom: 8 }}>SERVİS TALEBİ</div>
          {gorev.servisTalepId ? (
            <button
              onClick={() => navigate(`/servis-talepleri/${gorev.servisTalepId}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--brand-primary-soft)',
                border: '1px solid var(--border-default)',
                cursor: 'pointer',
                transition: 'border-color 120ms',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
            >
              <FileText size={16} strokeWidth={1.5} style={{ color: 'var(--brand-primary)' }} />
              <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>Bağlı servis talebi</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-primary)', font: '500 12px/16px var(--font-sans)' }}>
                Servis talebine git <ArrowRight size={12} strokeWidth={1.5} />
              </span>
            </button>
          ) : gorev.musteriId ? (
            <Button
              variant="primary"
              iconLeft={<FileText size={14} strokeWidth={1.5} />}
              disabled={servisOlusturuluyor}
              onClick={async () => {
                setServisOlusturuluyor(true)
                try {
                  const atananKisi = kullanicilar?.find(k => k.id?.toString() === gorev.atananId?.toString())
                  const yeni = await talepOlusturGorevden(gorev, kullanici, atananKisi)
                  if (yeni) {
                    toast.success('Servis talebi oluşturuldu.')
                    navigate(`/servis-talepleri/${yeni.id}`)
                  } else {
                    toast.error('Servis talebi oluşturulamadı.')
                  }
                } catch (err) {
                  console.error('[Servis talebine dönüştür]', err)
                  toast.error('Hata: ' + (err?.message || 'bilinmeyen'))
                } finally {
                  setServisOlusturuluyor(false)
                }
              }}
            >
              {servisOlusturuluyor ? 'Oluşturuluyor…' : 'Servis talebine dönüştür'}
            </Button>
          ) : (
            <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              Servis talebi oluşturmak için önce göreve bir müşteri bağlamalısınız.
            </p>
          )}
        </div>
      </Card>

      {/* Durum güncelle */}
      <Card style={{ marginBottom: 16 }}>
        <p className="t-label" style={{ marginBottom: 8 }}>DURUMU GÜNCELLE</p>
        <SegmentedControl
          options={durumlar.map(d => ({ value: d.id, label: d.isim }))}
          value={gorev.durum}
          onChange={durumGuncelle}
        />
      </Card>

      {/* Yorumlar */}
      <Card>
        <div style={{ marginBottom: 16 }}>
          <CardTitle>Yorumlar</CardTitle>
          <p className="t-caption" style={{ marginTop: 2 }}>
            <span className="tabular-nums">{gorev.yorumlar?.length || 0}</span> yorum
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {(gorev.yorumlar || []).length === 0 && (
            <p className="t-caption">Henüz yorum yok.</p>
          )}
          {(gorev.yorumlar || []).map(yorum => {
            const benimMi = kendisiMi(yorum)
            const duzenlemede = duzenleYorumId === yorum.id
            return (
              <div
                key={yorum.id}
                className="group"
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Avatar name={yorum.yazar} size="xs" />
                    <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{yorum.yazar}</span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      {yorum.tarih}
                      {yorum.duzenlendi && <span style={{ fontStyle: 'italic', marginLeft: 4 }}>(düzenlendi)</span>}
                    </span>
                    {benimMi && !duzenlemede && (
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          aria-label="Düzenle"
                          onClick={() => duzenlemeBaslat(yorum)}
                          style={{
                            width: 24, height: 24,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Pencil size={11} strokeWidth={1.5} />
                        </button>
                        <button
                          aria-label="Sil"
                          onClick={() => yorumSil(yorum.id)}
                          style={{
                            width: 24, height: 24,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Trash2 size={11} strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {duzenlemede ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <Textarea value={duzenleIcerik} onChange={e => setDuzenleIcerik(e.target.value)} rows={3} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="primary" size="sm" onClick={yorumGuncelle}>Kaydet</Button>
                      <Button variant="secondary" size="sm" onClick={duzenlemeIptal}>İptal</Button>
                    </div>
                  </div>
                ) : (
                  <p style={{ font: '400 13px/20px var(--font-sans)', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                    {yorum.icerik}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
          <Textarea
            value={yeniYorum}
            onChange={e => setYeniYorum(e.target.value)}
            rows={3}
            placeholder="Yorum yaz…"
            style={{ marginBottom: 8 }}
          />
          <Button variant="primary" onClick={yorumEkle}>Yorum ekle</Button>
        </div>
      </Card>
    </div>
  )
}

export default GorevDetay
