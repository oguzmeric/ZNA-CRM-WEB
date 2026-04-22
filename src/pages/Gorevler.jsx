import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useBildirim } from '../context/BildirimContext'
import { useToast } from '../context/ToastContext'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  gorevleriGetir,
  gorevEkle,
  gorevGuncelle as dbGorevGuncelle,
  gorevSil as dbGorevSil,
} from '../services/gorevService'
import { musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'

const oncelikler = [
  { id: 'dusuk', isim: 'Düşük', renk: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  { id: 'orta', isim: 'Orta', renk: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { id: 'yuksek', isim: 'Yüksek', renk: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
]

const kolonlar = [
  { id: 'bekliyor', isim: 'Bekliyor', ikon: '📋', renk: '#0176D3', bg: 'rgba(1,118,211,0.04)' },
  { id: 'devam', isim: 'Devam Ediyor', ikon: '🔄', renk: '#f59e0b', bg: 'rgba(245,158,11,0.04)' },
  { id: 'tamamlandi', isim: 'Tamamlandı', ikon: '✅', renk: '#10b981', bg: 'rgba(16,185,129,0.04)' },
]

const bosForm = {
  baslik: '',
  aciklama: '',
  atanan: '',
  oncelik: 'orta',
  sonTarih: '',
  musteriId: '',
  musteriAdi: '',
  firmaAdi: '',
}

function GorevKarti({ gorev, kullanicilar, onClick, overlay = false }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: gorev.id.toString() })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const oncelik = oncelikler.find((o) => o.id === gorev.oncelik)
  const atananKisi = kullanicilar.find((k) => k.id?.toString() === gorev.atanan)
  const gecikti = gorev.sonTarih && new Date(gorev.sonTarih) < new Date() && gorev.durum !== 'tamamlandi'
  const bugun = new Date().toISOString().split('T')[0]
  const bugunMu = gorev.sonTarih === bugun && gorev.durum !== 'tamamlandi'

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: overlay ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.92)',
        border: gecikti ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(1,118,211,0.1)',
        borderRadius: '4px',
        padding: '14px',
        marginBottom: '8px',
        cursor: overlay ? 'grabbing' : 'grab',
        boxShadow: overlay
          ? '0 20px 40px rgba(1,118,211,0.2)'
          : '0 2px 8px rgba(1,118,211,0.06)',
        userSelect: 'none',
      }}
      onClick={overlay ? undefined : onClick}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: oncelik?.bg, color: oncelik?.renk }}
        >
          {oncelik?.isim}
        </span>
        {gecikti && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            ⚠️ Gecikti
          </span>
        )}
        {bugunMu && !gecikti && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
            Bugün
          </span>
        )}
      </div>

      <p className="font-semibold text-gray-800 text-sm mb-1 leading-snug">{gorev.baslik}</p>

      {gorev.aciklama && (
        <p className="text-xs text-gray-400 mb-2 line-clamp-2">{gorev.aciklama}</p>
      )}

      <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(1,118,211,0.06)' }}>
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ background: 'var(--primary)', fontSize: '9px' }}
          >
            {atananKisi?.ad?.charAt(0)}
          </div>
          <span className="text-xs text-gray-500 truncate max-w-20">{atananKisi?.ad}</span>
        </div>
        {gorev.sonTarih && (
          <span className="text-xs" style={{ color: gecikti ? '#ef4444' : 'var(--text-muted)' }}>
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
      className="flex flex-col flex-1 rounded-2xl"
      style={{
        background: isOver ? `${kolon.renk}12` : kolon.bg,
        border: isOver ? `2px solid ${kolon.renk}50` : `1px solid ${kolon.renk}20`,
        padding: '16px',
        minHeight: '500px',
        minWidth: '280px',
        maxWidth: '380px',
        transition: 'all 0.15s ease',
        boxShadow: isOver ? `0 0 20px ${kolon.renk}20` : 'none',
      }}
    >
      {/* Kolon başlık */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '16px' }}>{kolon.ikon}</span>
          <span className="font-semibold text-sm" style={{ color: kolon.renk }}>{kolon.isim}</span>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${kolon.renk}15`, color: kolon.renk }}
        >
          {gorevler.length}
        </span>
      </div>

      {/* Droppable alan */}
      <SortableContext
        items={gorevler.map((g) => g.id.toString())}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          style={{
            flex: 1,
            minHeight: '120px',
            borderRadius: '4px',
            transition: 'all 0.15s ease',
            padding: gorevler.length === 0 ? '8px' : '0',
          }}
        >
          {gorevler.length === 0 && (
            <div
              className="flex flex-col items-center justify-center rounded-xl text-sm h-full"
              style={{
                minHeight: '80px',
                border: `2px dashed ${kolon.renk}${isOver ? '60' : '25'}`,
                color: `${kolon.renk}`,
                opacity: isOver ? 1 : 0.5,
                background: isOver ? `${kolon.renk}08` : 'transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '20px', marginBottom: '4px' }}>{kolon.ikon}</span>
              <span className="text-xs">{isOver ? 'Bırakın!' : 'Görev yok'}</span>
            </div>
          )}
          {gorevler.map((gorev) => (
            <GorevKarti
              key={gorev.id}
              gorev={gorev}
              kullanicilar={kullanicilar}
              onClick={() => onGorevClick(gorev.id)}
            />
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
    Promise.all([gorevleriGetir(), musterileriGetir()]).then(([gorevData, musteriData]) => {
      setGorevler(gorevData || [])
      setMusteriler(musteriData || [])
      setYukleniyor(false)
    })
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const handleDragStart = (event) => {
    const gorev = gorevler.find((g) => g.id.toString() === event.active.id)
    setAktifGorev(gorev || null)
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setAktifGorev(null)

    if (!over) return

    const aktifId = active.id
    const hedefId = over.id

    // Hedef bir kolon mu?
    const hedefKolon = kolonlar.find((k) => k.id === hedefId)

    // Hedef bir görev kartı mı?
    const hedefGorevKolonu = gorevler.find((g) => g.id.toString() === hedefId)?.durum

    const yeniDurum = hedefKolon ? hedefKolon.id : hedefGorevKolonu

    if (!yeniDurum) return

    const mevcutGorev = gorevler.find((g) => g.id.toString() === aktifId)
    if (!mevcutGorev || mevcutGorev.durum === yeniDurum) return

    setGorevler((prev) =>
      prev.map((g) => (g.id.toString() === aktifId ? { ...g, durum: yeniDurum } : g))
    )
    await dbGorevGuncelle(mevcutGorev.id, { durum: yeniDurum })
  }

  const handleDragOver = (event) => {
    const { active, over } = event
    if (!over) return

    const aktifId = active.id
    const hedefId = over.id

    const hedefKolon = kolonlar.find((k) => k.id === hedefId)
    const hedefGorevKolonu = gorevler.find((g) => g.id.toString() === hedefId)?.durum
    const yeniDurum = hedefKolon ? hedefKolon.id : hedefGorevKolonu

    if (!yeniDurum) return

    const mevcutGorev = gorevler.find((g) => g.id.toString() === aktifId)
    if (!mevcutGorev || mevcutGorev.durum === yeniDurum) return

    setGorevler((prev) =>
      prev.map((g) => (g.id.toString() === aktifId ? { ...g, durum: yeniDurum } : g))
    )
  }

  const formAc = () => {
    setForm(bosForm)
    setDuzenleId(null)
    setGoster(true)
  }

  const kaydet = async () => {
    if (!form.baslik || !form.atanan || !form.sonTarih) {
      alert('Lütfen zorunlu alanları doldurun!')
      return
    }

    if (duzenleId) {
      const eskiGorev = gorevler.find((g) => g.id === duzenleId)
      await dbGorevGuncelle(duzenleId, form)
      setGorevler((prev) => prev.map((g) => (g.id === duzenleId ? { ...g, ...form } : g)))
      toast.success('Görev güncellendi')
      if (eskiGorev?.atanan !== form.atanan) {
        bildirimEkle(form.atanan, 'Görev Güncellendi', `"${form.baslik}" görevi size yeniden atandı.`, 'bilgi', '/gorevler')
      }
    } else {
      const yeniGorev = {
        ...form,
        durum: 'bekliyor',
        olusturanAd: kullanici.ad,
        olusturmaTarih: new Date().toISOString(),
      }
      const eklenen = await gorevEkle(yeniGorev)
      if (eklenen) {
        setGorevler((prev) => [eklenen, ...prev])
        toast.success('Görev eklendi')
        const oncelik = oncelikler.find((o) => o.id === form.oncelik)
        bildirimEkle(form.atanan, 'Yeni Görev Atandı', `"${form.baslik}" görevi size atandı. Öncelik: ${oncelik?.isim}. Son tarih: ${form.sonTarih}`, 'bilgi', '/gorevler')
      } else {
        toast.error('Görev kaydedilemedi. Konsolu kontrol edin.')
        return
      }
    }

    setForm(bosForm)
    setDuzenleId(null)
    setGoster(false)
  }

  const iptal = () => {
    setForm(bosForm)
    setDuzenleId(null)
    setGoster(false)
  }

  const gorevSil = async (id, e) => {
    e.stopPropagation()
    await dbGorevSil(id)
    setGorevler((prev) => prev.filter((g) => g.id !== id))
    toast.success('Görev silindi')
  }

  const duzenleAc = (g, e) => {
    e.stopPropagation()
    setForm({ baslik: g.baslik, aciklama: g.aciklama || '', atanan: g.atanan, oncelik: g.oncelik, sonTarih: g.sonTarih, musteriId: g.musteriId || '', musteriAdi: g.musteriAdi || '', firmaAdi: g.firmaAdi || '' })
    setDuzenleId(g.id)
    setGoster(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filtreliGorevler = gorevler.filter((g) => {
    if (!g) return false
    if (kisiFiltre && g.atanan?.toString() !== kisiFiltre) return false
    if (gorunumModu === 'kanban') return true
    if (filtre === 'hepsi') return true
    return g.durum === filtre
  })

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  return (
    <div className="p-6">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Görevler</h2>
          <p className="text-sm text-gray-400 mt-1">
            {kisiFiltre
              ? `${filtreliGorevler.length} görev — ${kullanicilar.find(k => k.id?.toString() === kisiFiltre)?.ad}`
              : `${gorevler.length} görev`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Kişi filtresi */}
          <CustomSelect
            value={kisiFiltre}
            onChange={(e) => setKisiFiltre(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">👤 Tüm Kişiler</option>
            {kullanicilar.map((k) => (
              <option key={k.id} value={k.id?.toString()}>
                {k.ad}
              </option>
            ))}
          </CustomSelect>

          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button
              onClick={() => setGorunumModu('kanban')}
              className={`px-3 py-2 text-xs font-medium transition-all ${
                gorunumModu === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              📋 Kanban
            </button>
            <button
              onClick={() => setGorunumModu('liste')}
              className={`px-3 py-2 text-xs font-medium transition-all border-l border-gray-200 ${
                gorunumModu === 'liste' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              ☰ Liste
            </button>
          </div>
          <button onClick={formAc} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition">
            + Yeni Görev
          </button>
        </div>
      </div>

      {/* Form */}
      {goster && (
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(1,118,211,0.15)',
            boxShadow: '0 8px 32px rgba(1,118,211,0.1)',
          }}
        >
          <h3 className="font-semibold text-gray-800 mb-4">
            {duzenleId ? 'Görevi Düzenle' : 'Yeni Görev'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Başlık *</label>
              <input
                type="text"
                value={form.baslik}
                onChange={(e) => setForm({ ...form, baslik: e.target.value })}
                className="premium-input"
                placeholder="Görev başlığı"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Atanacak Kişi *</label>
              <CustomSelect
                value={form.atanan}
                onChange={(e) => setForm({ ...form, atanan: e.target.value })}
                className="premium-input"
              >
                <option value="">Kişi seç...</option>
                {kullanicilar.map((k) => (
                  <option key={k.id} value={k.id}>{k.ad}</option>
                ))}
              </CustomSelect>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">İlgili Müşteri</label>
              <CustomSelect
                value={form.musteriId}
                onChange={(e) => {
                  const musteri = musteriler.find((m) => m.id?.toString() === e.target.value)
                  setForm({
                    ...form,
                    musteriId: e.target.value,
                    musteriAdi: musteri ? `${musteri.ad} ${musteri.soyad}` : '',
                    firmaAdi: musteri ? musteri.firma : '',
                  })
                }}
                className="premium-input"
              >
                <option value="">Müşteri seç (opsiyonel)...</option>
                {musteriler.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ad} {m.soyad} — {m.firma}
                  </option>
                ))}
              </CustomSelect>
              {form.firmaAdi && (
                <p className="text-xs text-gray-400 mt-1">🏢 {form.firmaAdi}</p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Öncelik</label>
              <CustomSelect
                value={form.oncelik}
                onChange={(e) => setForm({ ...form, oncelik: e.target.value })}
                className="premium-input"
              >
                {oncelikler.map((o) => (
                  <option key={o.id} value={o.id}>{o.isim}</option>
                ))}
              </CustomSelect>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Son Tarih *</label>
              <input
                type="date"
                value={form.sonTarih}
                onChange={(e) => setForm({ ...form, sonTarih: e.target.value })}
                className="premium-input"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-sm text-gray-600 mb-1 block">Açıklama</label>
            <textarea
              value={form.aciklama}
              onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
              className="premium-input"
              rows={3}
              placeholder="Görev detayları..."
            />
          </div>
          <div className="flex gap-3">
            <button onClick={kaydet} className="btn-primary">
              {duzenleId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button
              onClick={iptal}
              className="text-sm px-5 py-2 rounded-xl border text-gray-600 hover:bg-gray-50 transition"
              style={{ border: '1px solid rgba(1,118,211,0.2)' }}
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* KANBAN */}
      {gorunumModu === 'kanban' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {kolonlar.map((kolon) => (
              <DroppableKolon
                key={kolon.id}
                kolon={kolon}
                gorevler={filtreliGorevler.filter((g) => g.durum === kolon.id)}
                kullanicilar={kullanicilar}
                onGorevClick={(id) => navigate(`/gorevler/${id}`)}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 150 }}>
            {aktifGorev ? (
              <GorevKarti
                gorev={aktifGorev}
                kullanicilar={kullanicilar}
                overlay={true}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* LİSTE */}
      {gorunumModu === 'liste' && (
        <div>
          <div className="flex gap-2 mb-4">
            {[
              { id: 'hepsi', isim: 'Hepsi' },
              { id: 'bekliyor', isim: 'Bekliyor' },
              { id: 'devam', isim: 'Devam Ediyor' },
              { id: 'tamamlandi', isim: 'Tamamlandı' },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setFiltre(d.id)}
                className="text-sm px-4 py-1.5 rounded-xl transition"
                style={{
                  background: filtre === d.id ? 'var(--primary)' : 'rgba(255,255,255,0.8)',
                  color: filtre === d.id ? 'white' : 'var(--primary)',
                  border: '1px solid rgba(1,118,211,0.2)',
                  boxShadow: filtre === d.id ? '0 4px 12px rgba(1,118,211,0.3)' : 'none',
                }}
              >
                {d.isim}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {filtreliGorevler.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">Görev bulunamadı</div>
            )}
            {filtreliGorevler.map((gorev) => {
              const oncelik = oncelikler.find((o) => o.id === gorev.oncelik)
              const kolon = kolonlar.find((k) => k.id === gorev.durum)
              const atananKisi = kullanicilar.find((k) => k.id?.toString() === gorev.atanan)
              const gecikti = gorev.sonTarih && new Date(gorev.sonTarih) < new Date() && gorev.durum !== 'tamamlandi'

              return (
                <div
                  key={gorev.id}
                  onClick={() => navigate(`/gorevler/${gorev.id}`)}
                  className="flex items-center gap-4 cursor-pointer rounded-2xl px-5 py-4 transition-all hover-lift"
                  style={{
                    background: 'rgba(255,255,255,0.9)',
                    border: gecikti ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(1,118,211,0.1)',
                    boxShadow: '0 2px 8px rgba(1,118,211,0.06)',
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: oncelik?.bg, color: oncelik?.renk }}>
                        {oncelik?.isim}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${kolon?.renk}15`, color: kolon?.renk }}>
                        {kolon?.ikon} {kolon?.isim}
                      </span>
                      {gecikti && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                          ⚠️ Gecikti
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-800">{gorev.baslik}</p>
                    {gorev.aciklama && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{gorev.aciklama}</p>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400 flex-shrink-0">
                    <span>{atananKisi?.ad}</span>
                    <span style={{ color: gecikti ? '#ef4444' : 'var(--text-muted)' }}>{gorev.sonTarih}</span>
                    <span>{gorev.yorumlar?.length || 0} yorum</span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => duzenleAc(gorev, e)}
                      className="text-xs px-3 py-1.5 rounded-lg transition"
                      style={{ color: 'var(--primary)', border: '1px solid rgba(1,118,211,0.2)' }}
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={(e) => gorevSil(gorev.id, e)}
                      className="text-xs px-3 py-1.5 rounded-lg transition"
                      style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default Gorevler
