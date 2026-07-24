// Bridge Talepleri — Başakşehir Belediyesi Bridge API'sinden çekilen talepler.
// Read-only entegrasyon: veriyi edge fn 'bridge-senkron' 10 dk'da bir yazar
// (taskTypeIdList filtresi belediyeden gelince); burası liste + iç triyaj.
// Test Bağlantısı butonu filtre gerektirmeden tek kayıtla uçtan uca doğrular.
import { useState, useEffect, useCallback } from 'react'
import { Landmark, RefreshCw, MapPin, MessageSquare, X, ExternalLink, Zap } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { kullanicilariGetir } from '../services/kullaniciService'
import {
  bridgeTalepleriGetir, bridgeTalepGuncelle, bridgeSenkronDurumGetir,
  bridgeSenkronCalistir, bridgeDurumBilgi, crmDurumBilgi, bridgeTarihTR,
  CRM_DURUM,
} from '../services/bridgeService'
import { Button, Card, EmptyState, Select } from '../components/ui'

const SEKMELER = [
  { id: 'tumu', isim: 'Tümü' },
  { id: 'yeni', isim: 'Yeni' },
  { id: 'incelendi', isim: 'İncelendi' },
  { id: 'gorev_acildi', isim: 'Görev Açıldı' },
  { id: 'kapandi', isim: 'Kapandı' },
]

function DurumRozet({ id, kaynak = 'bridge' }) {
  const m = kaynak === 'crm' ? crmDurumBilgi(id) : bridgeDurumBilgi(id)
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-pill)',
      background: `${m.renk}1a`, color: m.renk, whiteSpace: 'nowrap',
    }}>
      {kaynak === 'crm' ? `${m.ikon} ` : ''}{m.isim}
    </span>
  )
}

export default function BridgeTalepler() {
  const { toast } = useToast()
  const [sekme, setSekme] = useState('tumu')
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [durum, setDurum] = useState(null)
  const [testCalisiyor, setTestCalisiyor] = useState(false)
  const [detay, setDetay] = useState(null)
  const [personel, setPersonel] = useState([])

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    const [l, d] = await Promise.all([
      bridgeTalepleriGetir({ crmDurum: sekme }),
      bridgeSenkronDurumGetir(),
    ])
    setListe(l)
    setDurum(d)
    setYukleniyor(false)
  }, [sekme])

  useEffect(() => { yukle() }, [yukle])
  useEffect(() => {
    kullanicilariGetir().then((k) => setPersonel((k || []).filter((u) => u.rol !== 'musteri'))).catch(() => {})
  }, [])

  const testBaglanti = async () => {
    setTestCalisiyor(true)
    const r = await bridgeSenkronCalistir('test')
    setTestCalisiyor(false)
    if (r?.ok) {
      const gt = r.getTask
      toast?.success?.(`Bağlantı başarılı — getTask kod ${gt?.code}, ${gt?.alanlar?.length ?? 0} alan geldi` +
        (r.kaydedildi ? `, ${r.kaydedildi} kayıt yazıldı` : ''))
    } else {
      toast?.error?.(`Bağlantı hatası: ${r?.hata || 'bilinmeyen'}${r?.aciklama ? ' — ' + r.aciklama : ''}`)
    }
    yukle()
  }

  const topluCek = async () => {
    setTestCalisiyor(true)
    const r = await bridgeSenkronCalistir('liste')
    setTestCalisiyor(false)
    if (r?.ok) toast?.success?.(`Toplu çekim: ${r.kaydedilen}/${r.cekilen} kaydedildi (uzak ${r.uzakToplam})`)
    else if (r?.hata === 'filtre_yok') toast?.warning?.('Toplu çekim kapalı — belediyeden görev tipi filtresi (taskTypeIdList) bekleniyor.')
    else toast?.error?.(`Toplu çekim hatası: ${r?.hata || 'bilinmeyen'}`)
    yukle()
  }

  const triyajKaydet = async (id, patch) => {
    const g = await bridgeTalepGuncelle(id, patch)
    if (g) {
      setListe((prev) => prev.map((t) => (t.id === id ? { ...t, ...g } : t)))
      setDetay((prev) => (prev && prev.id === id ? { ...prev, ...g } : prev))
      toast?.success?.('Güncellendi')
    } else {
      toast?.error?.('Güncellenemedi')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Başlık + aksiyonlar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Landmark size={22} strokeWidth={1.8} style={{ color: 'var(--brand-primary)' }} />
          <div>
            <h2 style={{ margin: 0, font: '700 20px/26px var(--font-sans)', color: 'var(--text-primary)' }}>Bridge Talepleri</h2>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Başakşehir Belediyesi — Bridge Task Operation API</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={testBaglanti} disabled={testCalisiyor}>
            <Zap size={15} /> {testCalisiyor ? 'Çalışıyor…' : 'Test Bağlantısı'}
          </Button>
          <Button variant="secondary" onClick={topluCek} disabled={testCalisiyor}>
            <RefreshCw size={15} /> Toplu Çek
          </Button>
        </div>
      </div>

      {/* Senkron durum şeridi */}
      <Card style={{ marginBottom: 16, padding: '10px 14px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          <strong>Son senkron:</strong> {durum?.sonCalismaTarih ? bridgeTarihTR(durum.sonCalismaTarih) : '—'}
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          <strong>Oturum:</strong> {durum?.sessionId ? '✅ açık' : '⚠️ yok'}
        </span>
        {durum?.sonSonuc && <span style={{ color: 'var(--text-tertiary)' }}>{durum.sonSonuc}</span>}
      </Card>

      {/* Filtre sekmeleri */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {SEKMELER.map((s) => (
          <button
            key={s.id}
            onClick={() => setSekme(s.id)}
            style={{
              padding: '6px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
              border: '1px solid var(--border-default)',
              background: sekme === s.id ? 'var(--brand-primary)' : 'var(--surface-card)',
              color: sekme === s.id ? '#fff' : 'var(--text-secondary)',
              font: '600 12px/16px var(--font-sans)',
            }}
          >
            {s.isim}
          </button>
        ))}
      </div>

      {/* Liste */}
      {yukleniyor ? (
        <Card style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</Card>
      ) : liste.length === 0 ? (
        <EmptyState
          icon={<Landmark size={40} />}
          title="Henüz talep yok"
          description="Belediyeden ZNA görev tipi filtresi (taskTypeIdList) gelince 10 dk'da bir otomatik çekim başlayacak. Şimdilik 'Test Bağlantısı' ile bağlantıyı doğrulayabilirsiniz."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {liste.map((t) => (
            <Card
              key={t.id}
              onClick={() => setDetay(t)}
              style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-tertiary)' }}>{t.taskSerialNumber || `#${t.bridgeTaskId}`}</span>
                  <DurumRozet id={t.taskStatusId} />
                  <DurumRozet id={t.crmDurum} kaynak="crm" />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{bridgeTarihTR(t.insertDatetime)}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{t.subject || '(konu yok)'}</div>
              {(t.taskAddress || t.district) && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} /> {[t.district, t.town, t.taskAddress].filter(Boolean).join(' · ')}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {detay && (
        <TalepDetayModal
          talep={detay}
          personel={personel}
          onKapat={() => setDetay(null)}
          onTriyaj={triyajKaydet}
        />
      )}
    </div>
  )
}

function TalepDetayModal({ talep, personel, onKapat, onTriyaj }) {
  const [not, setNot] = useState(talep.crmNot || '')
  const konum = talep.latitude && talep.longitude
    ? `https://www.google.com/maps?q=${talep.latitude},${talep.longitude}` : null

  return (
    <div
      onClick={onKapat}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 'var(--z-modal)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)',
          width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '1px solid var(--border-default)', position: 'sticky', top: 0, background: 'var(--surface-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-tertiary)' }}>{talep.taskSerialNumber || `#${talep.bridgeTaskId}`}</span>
            <DurumRozet id={talep.taskStatusId} />
          </div>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{talep.subject || '(konu yok)'}</div>
            {talep.content && (
              talep.contentIsHtml
                ? <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }} dangerouslySetInnerHTML={{ __html: talep.content }} />
                : <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{talep.content}</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, fontSize: 12 }}>
            <Alan etiket="Talep Tipi" deger={talep.taskTypeDescription} />
            <Alan etiket="Departman" deger={talep.departmentDescription} />
            <Alan etiket="Kaynak Kanal" deger={talep.taskSourceChannelDescription} />
            <Alan etiket="Öncelik" deger={talep.priorityDescription} />
            <Alan etiket="Açılış" deger={bridgeTarihTR(talep.insertDatetime)} />
            <Alan etiket="Termin" deger={bridgeTarihTR(talep.deadline)} />
            <Alan etiket="Tamamlanma" deger={talep.completedPercent != null ? `%${talep.completedPercent}` : '—'} />
            <Alan etiket="Yorum" deger={talep.commentCount != null ? String(talep.commentCount) : '—'} />
          </div>

          {(talep.taskAddress || talep.district) && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={14} /> {[talep.city, talep.town, talep.district, talep.taskAddress].filter(Boolean).join(' · ')}
              {konum && <a href={konum} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-primary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><ExternalLink size={12} /> Harita</a>}
            </div>
          )}

          {talep.lastComment && (
            <Card style={{ padding: '8px 12px', fontSize: 12, background: 'var(--surface-sunken)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)', fontWeight: 600 }}><MessageSquare size={12} /> Son yorum</span>
              <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>{talep.lastComment}</div>
            </Card>
          )}

          {/* İç triyaj — Bridge'e yansımaz */}
          <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>İç Triyaj <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(sadece CRM — Bridge'e gitmez)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>Durum</label>
                <Select value={talep.crmDurum || 'yeni'} onChange={(e) => onTriyaj(talep.id, { crmDurum: e.target.value })}>
                  {Object.entries(CRM_DURUM).map(([k, v]) => <option key={k} value={k}>{v.ikon} {v.isim}</option>)}
                </Select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>Atanan</label>
                <Select value={talep.atananId || ''} onChange={(e) => onTriyaj(talep.id, { atananId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— Atanmadı —</option>
                  {personel.map((u) => <option key={u.id} value={u.id}>{u.ad}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>Not</label>
              <textarea
                value={not}
                onChange={(e) => setNot(e.target.value)}
                onBlur={() => { if (not !== (talep.crmNot || '')) onTriyaj(talep.id, { crmNot: not }) }}
                placeholder="İç not (opsiyonel)"
                style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', background: 'var(--surface-bg)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Alan({ etiket, deger }) {
  return (
    <div>
      <div style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{etiket}</div>
      <div style={{ color: 'var(--text-primary)' }}>{deger || '—'}</div>
    </div>
  )
}
