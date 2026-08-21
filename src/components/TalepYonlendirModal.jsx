// Portal talebi YÖNLENDİRME modalı (21.08): Portal Talepleri kuyruğundaki bir
// talep tek noktadan türüne göre yönlendirilir — Görüşme / Keşif / Görev /
// Teklif talebi. Servis işiyse mevcut atama akışı kullanılır (bu modal değil).
// Talep AÇIK KALIR: müşteri portalda takibini sürdürür, iş kendi modülünde akar.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle, Compass, CheckSquare, Briefcase, CornerUpRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useBildirim } from '../context/BildirimContext'
import {
  talebiGorusmeyeYonlendir, talebiKesfeYonlendir,
  talebiGoreveYonlendir, talebiTeklifeYonlendir,
} from '../services/talepYonlendirmeService'
import { Modal, Button, Label, CodeBadge } from './ui'
import CustomSelect from './CustomSelect'

const HEDEFLER = [
  {
    id: 'gorusme', isim: 'Görüşme', Ikon: MessageCircle,
    aciklama: 'Satış / iletişim konusu — görüşme kaydı (ACT) açılır, temsilci takip eder.',
  },
  {
    id: 'kesif', isim: 'Keşif', Ikon: Compass,
    aciklama: 'Yerinde inceleme gerekiyor — saha keşfi (KSF) açılır.',
  },
  {
    id: 'gorev', isim: 'Görev', Ikon: CheckSquare,
    aciklama: 'İç iş — personele görev olarak düşer, talep göreve bağlanır.',
  },
  {
    id: 'teklif', isim: 'Teklif talebi', Ikon: Briefcase,
    aciklama: 'Fiyat isteği — Teklifler > Müşteri Talepleri kuyruğuna taşınır.',
  },
]

export default function TalepYonlendirModal({ acik, talep, onKapat }) {
  const { kullanici, kullanicilar } = useAuth()
  const { toast } = useToast()
  const { bildirimEkle } = useBildirim()
  const navigate = useNavigate()
  const [hedef, setHedef] = useState(null)
  const [atananId, setAtananId] = useState('')
  const [sonTarih, setSonTarih] = useState('')
  const [calisiyor, setCalisiyor] = useState(false)

  if (!acik || !talep) return null

  // Zaten kurulu bağlar — üzerine ikinci kayıt açılmasın
  const engeller = {
    gorusme: talep.gorusmeId ? 'Bu talep zaten bir görüşmeye bağlı.' : null,
    gorev: talep.gorevId ? 'Bu talep zaten bir göreve bağlı.' : null,
  }

  const personeller = (kullanicilar || []).filter(
    (k) => k.tip !== 'musteri' && !k.hesapSilindi && k.rol !== 'musteri'
  )

  const kapat = () => {
    if (calisiyor) return
    setHedef(null); setAtananId(''); setSonTarih('')
    onKapat()
  }

  const yonlendir = async () => {
    if (!hedef || calisiyor) return
    setCalisiyor(true)
    try {
      let sonuc
      if (hedef === 'gorusme') sonuc = await talebiGorusmeyeYonlendir(talep, kullanici)
      else if (hedef === 'kesif') sonuc = await talebiKesfeYonlendir(talep, kullanici)
      else if (hedef === 'teklif') sonuc = await talebiTeklifeYonlendir(talep, kullanici)
      else {
        const atanan = personeller.find((k) => String(k.id) === String(atananId))
        sonuc = await talebiGoreveYonlendir(talep, kullanici, {
          atananId: atanan?.id || null,
          atananAd: atanan?.ad || '',
          sonTarih: sonTarih || null,
        })
        if (sonuc.atananId) {
          bildirimEkle(sonuc.atananId, 'Yeni Görev Atandı',
            `"${sonuc.baslik}" görevi size atandı (portal talebinden).`, 'gorev', '/gorevler')
        }
      }
      toast.success(`${sonuc.no} oluşturuldu ve ${talep.talepNo || 'talebe'} bağlandı.`)
      kapat()
      navigate(sonuc.yol)
    } catch (e) {
      console.error('[talep yönlendir]', e)
      toast.error(e?.message || 'Yönlendirme tamamlanamadı, lütfen tekrar deneyin.')
      setCalisiyor(false)
    }
  }

  return (
    <Modal
      open={acik}
      onClose={kapat}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CornerUpRight size={16} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
          <span>Talebi Yönlendir</span>
          <CodeBadge>{talep.talepNo || `#${talep.id}`}</CodeBadge>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={kapat} disabled={calisiyor}>Vazgeç</Button>
          <Button
            variant="primary"
            iconLeft={<CornerUpRight size={14} strokeWidth={1.8} />}
            onClick={yonlendir}
            disabled={!hedef || calisiyor}
          >
            {calisiyor ? 'Yönlendiriliyor…' : 'Yönlendir'}
          </Button>
        </>
      }
      width={560}
    >
      <p style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
        <b>{talep.firmaAdi || talep.musteriAd}</b> — {talep.konu || '—'}.
        Yönlendirme sonrası talep <b>açık kalır</b>: müşteri portalda takibini sürdürür,
        iş seçtiğiniz modülde ilerler ve talebe bağlanır.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {HEDEFLER.map(({ id, isim, aciklama, ...h }) => {
          const Ikon = h.Ikon
          const engel = engeller[id]
          const secili = hedef === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => !engel && setHedef(id)}
              disabled={!!engel}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                border: `1.5px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                cursor: engel ? 'not-allowed' : 'pointer',
                opacity: engel ? 0.55 : 1,
              }}
            >
              <Ikon size={17} strokeWidth={1.7} style={{
                color: secili ? 'var(--brand-primary)' : 'var(--text-secondary)', flexShrink: 0, marginTop: 1,
              }} />
              <span style={{ minWidth: 0 }}>
                <span style={{
                  display: 'block',
                  font: `${secili ? 600 : 500} 13px/18px var(--font-sans)`,
                  color: secili ? 'var(--brand-primary)' : 'var(--text-primary)',
                }}>
                  {isim}
                </span>
                <span style={{ display: 'block', font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 1 }}>
                  {engel || aciklama}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Görev seçildiyse atama alanları — opsiyonel; boş kalırsa görev atanmadan açılır */}
      {hedef === 'gorev' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <div>
            <Label>Atanacak kişi <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(isteğe bağlı)</span></Label>
            <CustomSelect value={atananId} onChange={(e) => setAtananId(e.target.value)}>
              <option value="">— Sonra atanacak —</option>
              {personeller.map((k) => (
                <option key={k.id} value={k.id}>{k.ad}</option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <Label>Son tarih <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(isteğe bağlı)</span></Label>
            <input
              type="date"
              value={sonTarih}
              onChange={(e) => setSonTarih(e.target.value)}
              style={{
                width: '100%', height: 36, padding: '0 10px',
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                font: '400 13px/20px var(--font-sans)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
