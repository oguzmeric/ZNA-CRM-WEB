import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

function DurumRozeti({ durum, DURUM_LISTESI }) {
  const d = DURUM_LISTESI.find((x) => x.id === durum) || DURUM_LISTESI[0]
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: d.bg, color: d.renk }}
    >
      <span>{d.ikon}</span>
      <span>{d.isim}</span>
    </span>
  )
}

function AciliyetRozeti({ aciliyet, ACILIYET_SEVIYELERI }) {
  const a = ACILIYET_SEVIYELERI.find((x) => x.id === aciliyet) || ACILIYET_SEVIYELERI[1]
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
      style={{ background: a.bg, color: a.renk }}
    >
      {a.ikon} {a.isim}
    </span>
  )
}

function StatKart({ sayi, baslik, ikon, renk, bg, onClick }) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      onClick={onClick}
      className="rounded p-5 cursor-pointer"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: bg }}>
          {ikon}
        </div>
        <span className="text-3xl font-bold" style={{ color: renk }}>{sayi}</span>
      </div>
      <p className="text-sm font-medium text-gray-600">{baslik}</p>
    </motion.div>
  )
}

export default function MusteriDashboard() {
  const { kullanici } = useAuth()
  const { musteriTalepleri, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()

  const talepler = musteriTalepleri(kullanici?.id)

  const izinliTurler = kullanici?.izinliTurler
  const filtreliTurler =
    izinliTurler && izinliTurler.length > 0
      ? ANA_TURLER.filter((t) => izinliTurler.includes(t.id))
      : ANA_TURLER
  const acik = talepler.filter((t) => t.durum === 'bekliyor')
  const devam = talepler.filter((t) => ['inceleniyor', 'atandi', 'devam_ediyor'].includes(t.durum))
  const tamamlandi = talepler.filter((t) => t.durum === 'tamamlandi')
  const acil = talepler.filter((t) => t.aciliyet === 'acil' && !['tamamlandi', 'iptal'].includes(t.durum))

  const sonTalepler = [...talepler].sort((a, b) => new Date(b.olusturmaTarihi) - new Date(a.olusturmaTarihi)).slice(0, 5)

  const tarihFormat = (tarih) => {
    const d = new Date(tarih)
    const simdi = new Date()
    const fark = simdi - d
    const dk = Math.floor(fark / 60000)
    const saat = Math.floor(dk / 60)
    const gun = Math.floor(saat / 24)
    if (dk < 60) return `${dk} dk önce`
    if (saat < 24) return `${saat} saat önce`
    if (gun < 7) return `${gun} gün önce`
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div>
      {/* Hoşgeldin */}
      <div
        className="rounded p-6 mb-6"
        style={{
          background: 'var(--primary)',
          borderRadius: '4px',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '14px', marginBottom: '4px' }}>
              Hoş geldiniz,
            </p>
            <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 700 }}>{kullanici?.ad}</h2>
            {kullanici?.firmaAdi && (
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', marginTop: '4px' }}>
                {kullanici.firmaAdi}
              </p>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/musteri-portal/yeni-talep')}
            className="flex items-center gap-2 px-5 py-3 rounded text-sm font-semibold"
            style={{ background: 'var(--bg-card)', color: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
          >
            <span style={{ fontSize: '16px' }}>➕</span>
            Yeni Talep Oluştur
          </motion.button>
        </div>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatKart
          sayi={acik.length}
          baslik="Bekleyen Talepler"
          ikon="⏳"
          renk="#6b7280"
          bg="rgba(107,114,128,0.1)"
          onClick={() => navigate('/musteri-portal/taleplerim?durum=bekliyor')}
        />
        <StatKart
          sayi={devam.length}
          baslik="Devam Eden"
          ikon="🔄"
          renk="#f59e0b"
          bg="rgba(245,158,11,0.1)"
          onClick={() => navigate('/musteri-portal/taleplerim?durum=devam')}
        />
        <StatKart
          sayi={tamamlandi.length}
          baslik="Tamamlanan"
          ikon="✅"
          renk="#10b981"
          bg="rgba(16,185,129,0.1)"
          onClick={() => navigate('/musteri-portal/taleplerim?durum=tamamlandi')}
        />
        <StatKart
          sayi={acil.length}
          baslik="Acil Talepler"
          ikon="🔴"
          renk="#ef4444"
          bg="rgba(239,68,68,0.1)"
          onClick={() => navigate('/musteri-portal/taleplerim?aciliyet=acil')}
        />
      </div>

      {/* Acil talepler uyarısı */}
      {acil.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded p-4 mb-6 flex items-center gap-3"
          style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <span style={{ fontSize: '20px' }}>🚨</span>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#dc2626' }}>
              {acil.length} acil talebiniz işlemde
            </p>
            <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '2px' }}>
              Ekibimiz en kısa sürede dönüş yapacaktır.
            </p>
          </div>
        </motion.div>
      )}

      {/* Son talepler */}
      <div
        className="rounded"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#3e3e3c' }}>Son Talepler</h3>
          <button
            onClick={() => navigate('/musteri-portal/taleplerim')}
            className="text-sm transition-colors"
            style={{ color: 'var(--primary)' }}
          >
            Tümünü Gör →
          </button>
        </div>

        {sonTalepler.length === 0 ? (
          <div className="py-12 text-center">
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '4px' }}>Henüz talep oluşturmadınız</p>
            <p style={{ color: '#cbd5e1', fontSize: '13px' }}>İlk talebinizi oluşturmak için yukarıdaki butona tıklayın</p>
          </div>
        ) : (
          <div>
            {sonTalepler.map((talep, i) => {
              const anaTur = ANA_TURLER.find((t) => t.id === talep.anaTur)
              return (
                <motion.div
                  key={talep.id}
                  whileHover={{ background: 'rgba(1,118,211,0.03)' }}
                  onClick={() => navigate(`/musteri-portal/talep/${talep.id}`)}
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors"
                  style={{
                    borderBottom: i < sonTalepler.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: anaTur?.bg || 'rgba(1,118,211,0.1)' }}
                  >
                    {anaTur?.ikon || '📋'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {talep.talepNo}
                      </span>
                      <AciliyetRozeti aciliyet={talep.aciliyet} ACILIYET_SEVIYELERI={ACILIYET_SEVIYELERI} />
                    </div>
                    <p className="text-sm text-gray-600 truncate mt-0.5">{talep.konu}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <DurumRozeti durum={talep.durum} DURUM_LISTESI={DURUM_LISTESI} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tarihFormat(talep.olusturmaTarihi)}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Teklif İste kartı — sadece teklif izni varsa */}
      {filtreliTurler.some((t) => t.id === 'teklif') && (
        <motion.div
          whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(16,185,129,0.15)' }}
          onClick={() => navigate('/musteri-portal/teklif-iste')}
          className="rounded p-5 mb-6 cursor-pointer flex items-center gap-4"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.06))',
            border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          <div
            className="w-12 h-12 rounded flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: '#10b981', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
          >
            💼
          </div>
          <div className="flex-1">
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Ürün Teklifi İste</p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Ürün kataloğumuzu inceleyin, ilgilendiğiniz ürünler için fiyat teklifi alın
            </p>
          </div>
          <span style={{ fontSize: '20px', color: '#10b981' }}>→</span>
        </motion.div>
      )}

      {/* Hızlı talep kategorileri */}
      <div className="mt-6">
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Hızlı Talep Aç
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {filtreliTurler.map((tur) => (
            <motion.button
              key={tur.id}
              whileHover={{ y: -3, boxShadow: `0 4px 8px rgba(0,0,0,0.1)` }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/musteri-portal/yeni-talep?tur=${tur.id}`)}
              className="flex flex-col items-center gap-2 p-4 rounded text-sm font-medium"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: tur.renk,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              <span style={{ fontSize: '22px' }}>{tur.ikon}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{tur.isim}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
