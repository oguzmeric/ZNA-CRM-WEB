import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { satislariGetir, satisSil } from '../services/satisService'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'

const durumBadge = (durum, vadeTarihi) => {
  const bugun = new Date()
  bugun.setHours(0, 0, 0, 0)
  const gosterimDurum =
    durum === 'gonderildi' && vadeTarihi && new Date(vadeTarihi) < bugun
      ? 'gecikti'
      : durum

  const map = {
    taslak: { label: 'Taslak', bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
    gonderildi: { label: 'Gönderildi', bg: 'rgba(1,118,211,0.1)', color: 'var(--primary)' },
    odendi: { label: 'Ödendi', bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    gecikti: { label: 'Gecikti', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
    iptal: { label: 'İptal', bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
  }
  return map[gosterimDurum] || map['taslak']
}

const paraBirimFormat = (sayi) =>
  `${(sayi || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`

const tarihFormat = (tarih) => {
  if (!tarih) return '—'
  return new Date(tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const SEKMELER = [
  { id: 'hepsi', label: 'Tümü' },
  { id: 'taslak', label: 'Taslak' },
  { id: 'gonderildi', label: 'Gönderildi' },
  { id: 'odendi', label: 'Ödendi' },
  { id: 'gecikti', label: 'Gecikti' },
  { id: 'iptal', label: 'İptal' },
]

function Satislar() {
  const navigate = useNavigate()
  const { confirm } = useConfirm()
  const { toast } = useToast()

  const [satislar, setSatislar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [aktifSekme, setAktifSekme] = useState('hepsi')
  const [arama, setArama] = useState('')

  useEffect(() => {
    satislariGetir().then((data) => {
      setSatislar(data)
      setYukleniyor(false)
    })
  }, [])

  const bugun = new Date()
  bugun.setHours(0, 0, 0, 0)

  const toplamFaturalanan = satislar.reduce((s, f) => s + Number(f.genelToplam || 0), 0)
  const tahsilEdilen = satislar.reduce((s, f) => s + Number(f.odenenToplam || 0), 0)
  const bekleyen = satislar
    .filter((f) => f.durum !== 'iptal')
    .reduce((s, f) => s + (Number(f.genelToplam || 0) - Number(f.odenenToplam || 0)), 0)
  const gecikmisToplam = satislar
    .filter(
      (f) =>
        f.durum !== 'odendi' &&
        f.durum !== 'iptal' &&
        f.vadeTarihi &&
        new Date(f.vadeTarihi) < bugun
    )
    .reduce((s, f) => s + (Number(f.genelToplam || 0) - Number(f.odenenToplam || 0)), 0)

  const sekmeSayisi = (sekmeId) => {
    if (sekmeId === 'hepsi') return satislar.length
    if (sekmeId === 'gecikti') {
      return satislar.filter(
        (f) => f.durum !== 'odendi' && f.durum !== 'iptal' && f.vadeTarihi && new Date(f.vadeTarihi) < bugun
      ).length
    }
    return satislar.filter((f) => f.durum === sekmeId).length
  }

  const gorunenSatislar = satislar.filter((f) => {
    const aramaEslesiyor =
      arama === '' ||
      `${f.faturaNo} ${f.firmaAdi}`.toLowerCase().includes(arama.toLowerCase())
    if (!aramaEslesiyor) return false
    if (aktifSekme === 'hepsi') return true
    if (aktifSekme === 'gecikti') {
      return (
        f.durum !== 'odendi' &&
        f.durum !== 'iptal' &&
        f.vadeTarihi &&
        new Date(f.vadeTarihi) < bugun
      )
    }
    return f.durum === aktifSekme
  })

  const handleSil = async (id, faturaNo) => {
    const onay = await confirm({
      baslik: 'Faturayı Sil',
      mesaj: `${faturaNo} numaralı fatura kalıcı olarak silinecek. Emin misiniz?`,
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await satisSil(id)
    setSatislar((prev) => prev.filter((f) => f.id !== id))
    toast.success('Fatura silindi.')
  }

  if (yukleniyor) {
    return (
      <div className="p-6 flex items-center justify-center" style={{ minHeight: '200px' }}>
        <p style={{ color: 'var(--text-muted)' }}>Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Satış Faturaları
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {satislar.length} fatura
          </p>
        </div>
        <button
          onClick={() => navigate('/satislar/yeni')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
          style={{ background: 'var(--primary)' }}
        >
          + Yeni Fatura
        </button>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Toplam Faturalanan',
            value: paraBirimFormat(toplamFaturalanan),
            color: 'var(--primary)',
            bg: 'rgba(1,118,211,0.08)',
            ikon: '🧾',
          },
          {
            label: 'Tahsil Edilen',
            value: paraBirimFormat(tahsilEdilen),
            color: '#10b981',
            bg: 'rgba(16,185,129,0.08)',
            ikon: '✅',
          },
          {
            label: 'Bekleyen',
            value: paraBirimFormat(bekleyen),
            color: '#f59e0b',
            bg: 'rgba(245,158,11,0.08)',
            ikon: '⏳',
          },
          {
            label: 'Gecikmiş',
            value: paraBirimFormat(gecikmisToplam),
            color: '#ef4444',
            bg: 'rgba(239,68,68,0.08)',
            ikon: '⚠️',
          },
        ].map((kart, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-2xl p-4"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(1,118,211,0.1)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                style={{ background: kart.bg }}
              >
                {kart.ikon}
              </span>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {kart.label}
              </p>
            </div>
            <p className="text-lg font-bold" style={{ color: kart.color }}>
              {kart.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Filtre sekmeleri */}
      <div
        className="flex gap-1 mb-4 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {SEKMELER.map((sekme) => {
          const sayi = sekmeSayisi(sekme.id)
          const aktif = aktifSekme === sekme.id
          return (
            <button
              key={sekme.id}
              onClick={() => setAktifSekme(sekme.id)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                borderBottom: aktif ? '2px solid var(--primary)' : '2px solid transparent',
                color: aktif ? 'var(--primary)' : 'var(--text-muted)',
                marginBottom: '-1px',
              }}
            >
              {sekme.label}
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: aktif ? 'rgba(1,118,211,0.1)' : 'rgba(107,114,128,0.1)',
                  color: aktif ? 'var(--primary)' : 'var(--text-muted)',
                }}
              >
                {sayi}
              </span>
            </button>
          )
        })}
      </div>

      {/* Arama */}
      <div className="mb-4">
        <input
          type="text"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Fatura no veya firma adı ara..."
          className="w-full max-w-sm px-3 py-2 rounded-xl text-sm outline-none"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Tablo */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid rgba(1,118,211,0.1)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {/* Header */}
        <div
          className="grid items-center px-4 py-3 text-xs font-semibold uppercase tracking-wide"
          style={{
            gridTemplateColumns: '140px 1fr 110px 110px 120px 120px 120px 110px 100px',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-muted)',
            background: 'var(--bg-hover)',
          }}
        >
          <div>Fatura No</div>
          <div>Müşteri / Firma</div>
          <div>Fatura Tarihi</div>
          <div>Vade</div>
          <div className="text-right">Toplam</div>
          <div className="text-right">Ödenen</div>
          <div className="text-right">Kalan</div>
          <div className="text-center">Durum</div>
          <div></div>
        </div>

        <AnimatePresence>
          {gorunenSatislar.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16"
              style={{ color: 'var(--text-muted)' }}
            >
              <span style={{ fontSize: '48px', marginBottom: '12px' }}>📄</span>
              <p className="text-sm font-medium">
                {arama ? 'Arama sonucu bulunamadı.' : 'Henüz fatura oluşturulmadı'}
              </p>
              {!arama && (
                <button
                  onClick={() => navigate('/satislar/yeni')}
                  className="mt-4 px-4 py-2 rounded-xl text-sm text-white"
                  style={{ background: 'var(--primary)' }}
                >
                  İlk Faturayı Oluştur
                </button>
              )}
            </motion.div>
          ) : (
            gorunenSatislar.map((f, idx) => {
              const badge = durumBadge(f.durum, f.vadeTarihi)
              const kalan = Number(f.genelToplam || 0) - Number(f.odenenToplam || 0)
              const vadeGecti =
                f.vadeTarihi &&
                new Date(f.vadeTarihi) < bugun &&
                f.durum !== 'odendi' &&
                f.durum !== 'iptal'

              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  className="grid items-center px-4 py-3 text-sm transition-colors"
                  style={{
                    gridTemplateColumns: '140px 1fr 110px 110px 120px 120px 120px 110px 100px',
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Fatura No */}
                  <div>
                    <button
                      onClick={() => navigate(`/satislar/${f.id}`)}
                      className="font-bold text-sm transition-opacity hover:opacity-70"
                      style={{ color: 'var(--primary)' }}
                    >
                      {f.faturaNo}
                    </button>
                  </div>

                  {/* Müşteri */}
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {f.firmaAdi || '—'}
                    </p>
                    {f.musteriYetkili && (
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {f.musteriYetkili}
                      </p>
                    )}
                  </div>

                  {/* Fatura Tarihi */}
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {tarihFormat(f.faturaTarihi)}
                  </div>

                  {/* Vade */}
                  <div style={{ color: vadeGecti ? '#ef4444' : 'var(--text-secondary)' }}>
                    {tarihFormat(f.vadeTarihi)}
                    {vadeGecti && (
                      <span className="ml-1 text-xs">⚠️</span>
                    )}
                  </div>

                  {/* Toplam */}
                  <div className="text-right font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {paraBirimFormat(f.genelToplam)}
                  </div>

                  {/* Ödenen */}
                  <div className="text-right" style={{ color: '#10b981' }}>
                    {paraBirimFormat(f.odenenToplam)}
                  </div>

                  {/* Kalan */}
                  <div
                    className="text-right font-medium"
                    style={{ color: kalan > 0 ? '#f59e0b' : '#10b981' }}
                  >
                    {paraBirimFormat(kalan)}
                  </div>

                  {/* Durum */}
                  <div className="flex justify-center">
                    <span
                      className="text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Aksiyonlar */}
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => navigate(`/satislar/${f.id}`)}
                      className="text-xs px-2 py-1 rounded-lg transition"
                      style={{
                        color: 'var(--primary)',
                        border: '1px solid rgba(1,118,211,0.2)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(1,118,211,0.08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleSil(f.id, f.faturaNo)}
                      className="text-xs px-2 py-1 rounded-lg transition"
                      style={{
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.2)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      Sil
                    </button>
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default Satislar
