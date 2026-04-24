import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useBildirim } from '../context/BildirimContext'
import { useToast } from '../context/ToastContext'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Pencil, Trash2, LayoutGrid, List, AlertCircle, User, Building2, Clock,
} from 'lucide-react'
import {
  gorevleriGetir, gorevEkle, gorevGuncelle as dbGorevGuncelle, gorevSil as dbGorevSil,
} from '../services/gorevService'
import { musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'
import {
  Button, Card, Input, Textarea, Label,
  Badge, EmptyState, Avatar,
} from '../components/ui'

const oncelikler = [
  { id: 'dusuk',  isim: 'Düşük',  tone: 'pasif' },
  { id: 'orta',   isim: 'Orta',   tone: 'beklemede' },
  { id: 'yuksek', isim: 'Yüksek', tone: 'kayip' },
]

const kolonlar = [
  { id: 'bekliyor',   isim: 'Bekliyor',     renk: 'var(--info)'   },
  { id: 'devam',      isim: 'Devam Ediyor', renk: 'var(--warning)' },
  { id: 'tamamlandi', isim: 'Tamamlandı',   renk: 'var(--success)' },
]

const bosForm = {
  baslik: '', aciklama: '', atanan: '', oncelik: 'orta', sonTarih: '',
  musteriId: '', musteriAdi: '', firmaAdi: '',
}

function GorevKarti({ gorev, kullanicilar, onClick, overlay = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: gorev.id.toString() })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const oncelik = oncelikler.find(o => o.id === gorev.oncelik)
  const atananKisi = kullanicilar.find(k => k.id?.toString() === gorev.atanan)
  const gecikti = gorev.sonTarih && new Date(gorev.sonTarih) < new Date() && gorev.durum !== 'tamamlandi'
  const bugun = new Date().toISOString().split('T')[0]
  const bugunMu = gorev.sonTarih === bugun && gorev.durum !== 'tamamlandi'

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'var(--surface-card)',
        border: `1px solid ${gecikti ? 'var(--danger-border)' : 'var(--border-default)'}`,
        borderLeft: `3px solid ${gecikti ? 'var(--danger)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 14,
        marginBottom: 8,
        cursor: overlay ? 'grabbing' : 'grab',
        boxShadow: overlay ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        userSelect: 'none',
      }}
      onClick={overlay ? undefined : onClick}
      {...attributes}
      {...listeners}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6 }}>
        <Badge tone={oncelik?.tone}>{oncelik?.isim}</Badge>
        {gecikti && <Badge tone="kayip" icon={<AlertCircle size={11} strokeWidth={1.5} />}>Gecikti</Badge>}
        {bugunMu && !gecikti && <Badge tone="beklemede">Bugün</Badge>}
      </div>

      <div style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 4 }}>
        {gorev.baslik}
      </div>

      {gorev.aciklama && (
        <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {gorev.aciklama}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Avatar name={atananKisi?.ad} size="xs" />
          <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {atananKisi?.ad}
          </span>
        </div>
        {gorev.sonTarih && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            font: '400 12px/16px var(--font-sans)',
            color: gecikti ? 'var(--danger)' : 'var(--text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <Clock size={11} strokeWidth={1.5} />
            {gorev.sonTarih}
          </span>
        )}
      </div>
    </div>
  )
}

function DroppableKolon({ kolon, gorevler, kullanicilar, onGorevClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: kolon.id })

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', flex: 1,
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-sunken)',
        border: `1px solid ${isOver ? kolon.renk : 'var(--border-default)'}`,
        padding: 16,
        minHeight: 500,
        minWidth: 280,
        maxWidth: 380,
        transition: 'border-color 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: kolon.renk }} />
          <span style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>{kolon.isim}</span>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 20, height: 20, padding: '0 6px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-secondary)',
          font: '600 11px/1 var(--font-sans)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {gorevler.length}
        </span>
      </div>

      <SortableContext items={gorevler.map(g => g.id.toString())} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} style={{ flex: 1, minHeight: 120 }}>
          {gorevler.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 80,
              border: `1px dashed ${isOver ? kolon.renk : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-tertiary)',
              font: '400 12px/16px var(--font-sans)',
              padding: 16,
            }}>
              {isOver ? 'Bırakın' : 'Görev yok'}
            </div>
          )}
          {gorevler.map(gorev => (
            <GorevKarti key={gorev.id} gorev={gorev} kullanicilar={kullanicilar} onClick={() => onGorevClick(gorev.id)} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function Gorevler() {
  const { kullanici, kullanicilar } = useAuth()
  const navigate = useNavigate()
  const { bildirimEkle } = useBildirim()
  const { toast } = useToast()

  const [gorevler, setGorevler] = useState([])
  const [musteriler, setMusteriler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(bosForm)
  const [goster, setGoster] = useState(false)
  const [duzenleId, setDuzenleId] = useState(null)
  const [aktifGorev, setAktifGorev] = useState(null)
  const [gorunumModu, setGorunumModu] = useState('kanban')
  const [filtre, setFiltre] = useState('hepsi')
  const [kisiFiltre, setKisiFiltre] = useState('')

  useEffect(() => {
    Promise.all([gorevleriGetir(), musterileriGetir()])
      .then(([g, m]) => { setGorevler(g || []); setMusteriler(m || []) })
      .catch(err => console.error('[Gorevler yükle]', err))
      .finally(() => setYukleniyor(false))
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragStart = (event) => {
    const gorev = gorevler.find(g => g.id.toString() === event.active.id)
    setAktifGorev(gorev || null)
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setAktifGorev(null)
    if (!over) return
    const aktifId = active.id
    const hedefId = over.id
    const hedefKolon = kolonlar.find(k => k.id === hedefId)
    const hedefGorevKolonu = gorevler.find(g => g.id.toString() === hedefId)?.durum
    const yeniDurum = hedefKolon ? hedefKolon.id : hedefGorevKolonu
    if (!yeniDurum) return
    const mevcut = gorevler.find(g => g.id.toString() === aktifId)
    if (!mevcut || mevcut.durum === yeniDurum) return
    setGorevler(prev => prev.map(g => g.id.toString() === aktifId ? { ...g, durum: yeniDurum } : g))
    await dbGorevGuncelle(mevcut.id, { durum: yeniDurum })
  }

  const handleDragOver = (event) => {
    const { active, over } = event
    if (!over) return
    const aktifId = active.id
    const hedefId = over.id
    const hedefKolon = kolonlar.find(k => k.id === hedefId)
    const hedefGorevKolonu = gorevler.find(g => g.id.toString() === hedefId)?.durum
    const yeniDurum = hedefKolon ? hedefKolon.id : hedefGorevKolonu
    if (!yeniDurum) return
    const mevcut = gorevler.find(g => g.id.toString() === aktifId)
    if (!mevcut || mevcut.durum === yeniDurum) return
    setGorevler(prev => prev.map(g => g.id.toString() === aktifId ? { ...g, durum: yeniDurum } : g))
  }

  const formAc = () => { setForm(bosForm); setDuzenleId(null); setGoster(true) }

  const kaydet = async () => {
    if (!form.baslik || !form.atanan || !form.sonTarih) {
      toast.error('Başlık, atanacak kişi ve son tarih zorunludur.'); return
    }
    if (duzenleId) {
      const eski = gorevler.find(g => g.id === duzenleId)
      await dbGorevGuncelle(duzenleId, form)
      setGorevler(prev => prev.map(g => g.id === duzenleId ? { ...g, ...form } : g))
      toast.success('Görev güncellendi.')
      if (eski?.atanan !== form.atanan) {
        bildirimEkle(form.atanan, 'Görev Güncellendi', `"${form.baslik}" görevi size yeniden atandı.`, 'bilgi', '/gorevler')
      }
    } else {
      const yeniGorev = { ...form, durum: 'bekliyor', olusturanAd: kullanici.ad, olusturmaTarih: new Date().toISOString() }
      const eklenen = await gorevEkle(yeniGorev)
      if (eklenen) {
        setGorevler(prev => [eklenen, ...prev])
        toast.success('Görev eklendi.')
        const oncelik = oncelikler.find(o => o.id === form.oncelik)
        bildirimEkle(form.atanan, 'Yeni Görev Atandı', `"${form.baslik}" görevi size atandı. Öncelik: ${oncelik?.isim}. Son tarih: ${form.sonTarih}`, 'bilgi', '/gorevler')
      } else { toast.error('Görev kaydedilemedi.'); return }
    }
    setForm(bosForm); setDuzenleId(null); setGoster(false)
  }

  const iptal = () => { setForm(bosForm); setDuzenleId(null); setGoster(false) }

  const gorevSil = async (id, e) => {
    e.stopPropagation()
    await dbGorevSil(id)
    setGorevler(prev => prev.filter(g => g.id !== id))
    toast.success('Görev silindi.')
  }

  const duzenleAc = (g, e) => {
    e.stopPropagation()
    setForm({
      baslik: g.baslik, aciklama: g.aciklama || '', atanan: g.atanan, oncelik: g.oncelik,
      sonTarih: g.sonTarih, musteriId: g.musteriId || '', musteriAdi: g.musteriAdi || '', firmaAdi: g.firmaAdi || '',
    })
    setDuzenleId(g.id); setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Rol bazlı görünürlük — admin her şeyi görür, diğerleri kendi görevlerini
  // ("atanan" veya "olusturan" kullanıcı).
  const isAdmin = kullanici?.rol === 'admin'
  const gorunurGorevler = isAdmin
    ? gorevler
    : gorevler.filter(g => {
        if (!g) return false
        const banaAtanmis =
          String(g.atanan ?? '') === String(kullanici?.id ?? '___') ||
          String(g.atananId ?? '') === String(kullanici?.id ?? '___') ||
          g.atananAd === kullanici?.ad
        const benYarattim = g.olusturanAd === kullanici?.ad
        return banaAtanmis || benYarattim
      })

  const filtreliGorevler = gorunurGorevler.filter(g => {
    if (!g) return false
    if (kisiFiltre && g.atanan?.toString() !== kisiFiltre) return false
    if (gorunumModu === 'kanban') return true
    if (filtre === 'hepsi') return true
    return g.durum === filtre
  })

  if (yukleniyor) return <div style={{ padding: 24 }}><EmptyState title="Yükleniyor…" /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Görevler</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            {kisiFiltre
              ? <><span className="tabular-nums">{filtreliGorevler.length}</span> görev — {kullanicilar.find(k => k.id?.toString() === kisiFiltre)?.ad}</>
              : <><span className="tabular-nums">{gorunurGorevler.length}</span> görev{!isAdmin && ' (kendi görevleriniz)'}</>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <div style={{ minWidth: 180 }}>
              <CustomSelect value={kisiFiltre} onChange={e => setKisiFiltre(e.target.value)}>
                <option value="">Tüm kişiler</option>
                {kullanicilar.map(k => <option key={k.id} value={k.id?.toString()}>{k.ad}</option>)}
              </CustomSelect>
            </div>
          )}
          <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
            <button
              onClick={() => setGorunumModu('kanban')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                background: gorunumModu === 'kanban' ? 'var(--surface-card)' : 'transparent',
                boxShadow: gorunumModu === 'kanban' ? 'var(--shadow-sm)' : 'none',
                color: gorunumModu === 'kanban' ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
                font: '500 13px/18px var(--font-sans)',
              }}
            >
              <LayoutGrid size={14} strokeWidth={1.5} /> Kanban
            </button>
            <button
              onClick={() => setGorunumModu('liste')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                borderRadius: 'calc(var(--radius-sm) - 2px)',
                background: gorunumModu === 'liste' ? 'var(--surface-card)' : 'transparent',
                boxShadow: gorunumModu === 'liste' ? 'var(--shadow-sm)' : 'none',
                color: gorunumModu === 'liste' ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer',
                font: '500 13px/18px var(--font-sans)',
              }}
            >
              <List size={14} strokeWidth={1.5} /> Liste
            </button>
          </div>
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={formAc}>
            Yeni görev
          </Button>
        </div>
      </div>

      {/* Form */}
      {goster && (
        <Card style={{ marginBottom: 16 }}>
          <h2 className="t-h2" style={{ marginBottom: 16 }}>{duzenleId ? 'Görevi Düzenle' : 'Yeni Görev'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <Label required>Başlık</Label>
              <Input value={form.baslik} onChange={e => setForm({ ...form, baslik: e.target.value })} placeholder="Görev başlığı" />
            </div>
            <div>
              <Label required>Atanacak kişi</Label>
              <CustomSelect value={form.atanan} onChange={e => setForm({ ...form, atanan: e.target.value })}>
                <option value="">Kişi seç…</option>
                {kullanicilar.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label>İlgili müşteri</Label>
              <CustomSelect
                value={form.musteriId}
                onChange={e => {
                  const m = musteriler.find(x => x.id?.toString() === e.target.value)
                  setForm({
                    ...form,
                    musteriId: e.target.value,
                    musteriAdi: m ? `${m.ad} ${m.soyad}` : '',
                    firmaAdi: m ? m.firma : '',
                  })
                }}
              >
                <option value="">Müşteri seç (opsiyonel)…</option>
                {musteriler.map(m => <option key={m.id} value={m.id}>{m.ad} {m.soyad} — {m.firma}</option>)}
              </CustomSelect>
              {form.firmaAdi && (
                <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Building2 size={12} strokeWidth={1.5} /> {form.firmaAdi}
                </p>
              )}
            </div>
            <div>
              <Label>Öncelik</Label>
              <CustomSelect value={form.oncelik} onChange={e => setForm({ ...form, oncelik: e.target.value })}>
                {oncelikler.map(o => <option key={o.id} value={o.id}>{o.isim}</option>)}
              </CustomSelect>
            </div>
            <div>
              <Label required>Son tarih</Label>
              <Input type="date" value={form.sonTarih} onChange={e => setForm({ ...form, sonTarih: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Label>Açıklama</Label>
            <Textarea value={form.aciklama} onChange={e => setForm({ ...form, aciklama: e.target.value })} rows={3} placeholder="Görev detayları…" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" onClick={kaydet}>{duzenleId ? 'Güncelle' : 'Kaydet'}</Button>
            <Button variant="secondary" onClick={iptal}>İptal</Button>
          </div>
        </Card>
      )}

      {/* Kanban */}
      {gorunumModu === 'kanban' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 16 }}>
            {kolonlar.map(kolon => (
              <DroppableKolon
                key={kolon.id}
                kolon={kolon}
                gorevler={filtreliGorevler.filter(g => g.durum === kolon.id)}
                kullanicilar={kullanicilar}
                onGorevClick={(id) => navigate(`/gorevler/${id}`)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 150 }}>
            {aktifGorev ? <GorevKarti gorev={aktifGorev} kullanicilar={kullanicilar} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Liste */}
      {gorunumModu === 'liste' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { id: 'hepsi', isim: 'Hepsi' },
              { id: 'bekliyor', isim: 'Bekliyor' },
              { id: 'devam', isim: 'Devam Ediyor' },
              { id: 'tamamlandi', isim: 'Tamamlandı' },
            ].map(d => (
              <button
                key={d.id}
                onClick={() => setFiltre(d.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: filtre === d.id ? 'var(--brand-primary)' : 'var(--surface-card)',
                  color: filtre === d.id ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${filtre === d.id ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                  font: '500 13px/18px var(--font-sans)',
                  cursor: 'pointer',
                }}
              >
                {d.isim}
              </button>
            ))}
          </div>

          {filtreliGorevler.length === 0 ? (
            <EmptyState title="Görev bulunamadı" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtreliGorevler.map(gorev => {
                const oncelik = oncelikler.find(o => o.id === gorev.oncelik)
                const kolon = kolonlar.find(k => k.id === gorev.durum)
                const atananKisi = kullanicilar.find(k => k.id?.toString() === gorev.atanan)
                const gecikti = gorev.sonTarih && new Date(gorev.sonTarih) < new Date() && gorev.durum !== 'tamamlandi'
                const kolonTone = gorev.durum === 'tamamlandi' ? 'aktif' : gorev.durum === 'devam' ? 'beklemede' : 'lead'

                return (
                  <Card
                    key={gorev.id}
                    onClick={() => navigate(`/gorevler/${gorev.id}`)}
                    padding={16}
                    style={{
                      cursor: 'pointer',
                      borderLeft: `3px solid ${gecikti ? 'var(--danger)' : kolon?.renk ?? 'var(--border-default)'}`,
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-card)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <Badge tone={oncelik?.tone}>{oncelik?.isim}</Badge>
                          <Badge tone={kolonTone}>{kolon?.isim}</Badge>
                          {gecikti && <Badge tone="kayip" icon={<AlertCircle size={11} strokeWidth={1.5} />}>Gecikti</Badge>}
                        </div>
                        <div style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{gorev.baslik}</div>
                        {gorev.aciklama && (
                          <p style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {gorev.aciklama}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                        {atananKisi && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Avatar name={atananKisi.ad} size="xs" />
                            {atananKisi.ad}
                          </span>
                        )}
                        {gorev.sonTarih && (
                          <span style={{ color: gecikti ? 'var(--danger)' : 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                            {gorev.sonTarih}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button
                          aria-label="Düzenle"
                          onClick={e => duzenleAc(gorev, e)}
                          style={{
                            width: 32, height: 32,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Pencil size={14} strokeWidth={1.5} />
                        </button>
                        <button
                          aria-label="Sil"
                          onClick={e => gorevSil(gorev.id, e)}
                          style={{
                            width: 32, height: 32,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Gorevler
