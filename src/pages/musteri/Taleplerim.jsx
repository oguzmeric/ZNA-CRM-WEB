import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import CustomSelect from '../../components/CustomSelect'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Taleplerim() {
  const { kullanici } = useAuth()
  const { musteriTalepleri, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [aramaMetni, setAramaMetni] = useState('')
  const [durumFiltre, setDurumFiltre] = useState(searchParams.get('durum') || 'tumu')
  const [turFiltre, setTurFiltre] = useState('tumu')

  const talepler = musteriTalepleri(kullanici?.id)

  const filtrelenmis = talepler.filter((t) => {
    if (aramaMetni && !t.konu.toLowerCase().includes(aramaMetni.toLowerCase()) && !t.talepNo.toLowerCase().includes(aramaMetni.toLowerCase())) return false
    if (durumFiltre === 'bekliyor' && t.durum !== 'bekliyor') return false
    if (durumFiltre === 'devam' && !['inceleniyor', 'atandi', 'devam_ediyor'].includes(t.durum)) return false
    if (durumFiltre === 'tamamlandi' && t.durum !== 'tamamlandi') return false
    if (durumFiltre !== 'tumu' && durumFiltre !== 'bekliyor' && durumFiltre !== 'devam' && durumFiltre !== 'tamamlandi' && t.durum !== durumFiltre) return false
    if (turFiltre !== 'tumu' && t.anaTur !== turFiltre) return false
    return true
  }).sort((a, b) => new Date(b.olusturmaTarihi) - new Date(a.olusturmaTarihi))

  const tarihFormat = (tarih) => new Date(tarih).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Taleplerim</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Toplam {talepler.length} talep · {filtrelenmis.length} gösteriliyor
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/musteri-portal/yeni-talep')}
          className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold text-white"
          style={{ background: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
        >
          <span>➕</span>
          Yeni Talep
        </motion.button>
      </div>

      {/* Filtreler */}
      <div
        className="rounded p-4 mb-5"
        style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={aramaMetni}
            onChange={(e) => setAramaMetni(e.target.value)}
            placeholder="Talep numarası veya konu ara..."
            className="flex-1 px-4 py-2.5 rounded text-sm outline-none"
            style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
          />
          <CustomSelect
            value={durumFiltre}
            onChange={(e) => setDurumFiltre(e.target.value)}
            className="px-4 py-2.5 rounded text-sm outline-none cursor-pointer"
            style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            <option value="tumu">Tüm Durumlar</option>
            <option value="bekliyor">Bekleyen</option>
            <option value="devam">Devam Eden</option>
            <option value="tamamlandi">Tamamlanan</option>
            <option value="iptal">İptal</option>
          </CustomSelect>
          <CustomSelect
            value={turFiltre}
            onChange={(e) => setTurFiltre(e.target.value)}
            className="px-4 py-2.5 rounded text-sm outline-none cursor-pointer"
            style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            <option value="tumu">Tüm Türler</option>
            {ANA_TURLER.map((t) => (
              <option key={t.id} value={t.id}>{t.ikon} {t.isim}</option>
            ))}
          </CustomSelect>
        </div>
      </div>

      {/* Liste */}
      {filtrelenmis.length === 0 ? (
        <div
          className="rounded py-16 text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)' }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Gösterilecek talep bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrelenmis.map((talep) => {
            const anaTur = ANA_TURLER.find((t) => t.id === talep.anaTur)
            const durum = DURUM_LISTESI.find((d) => d.id === talep.durum)
            const aciliyet = ACILIYET_SEVIYELERI.find((a) => a.id === talep.aciliyet)

            return (
              <motion.div
                key={talep.id}
                whileHover={{ y: -1, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                onClick={() => navigate(`/musteri-portal/talep/${talep.id}`)}
                className="rounded p-5 cursor-pointer transition-all"
                style={{
                  background: 'var(--bg-card)',
                  border: talep.aciliyet === 'acil' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(1,118,211,0.1)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: anaTur?.bg || 'rgba(1,118,211,0.1)' }}
                  >
                    {anaTur?.ikon || '📋'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>{talep.talepNo}</span>
                          <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{ background: anaTur?.bg, color: anaTur?.renk }}
                          >
                            {anaTur?.isim}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{ background: aciliyet?.bg, color: aciliyet?.renk }}
                          >
                            {aciliyet?.ikon} {aciliyet?.isim}
                          </span>
                        </div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{talep.konu}</p>
                        {talep.lokasyon && (
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            📍 {talep.lokasyon}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: durum?.bg, color: durum?.renk }}
                        >
                          {durum?.ikon} {durum?.isim}
                        </span>
                        {talep.atananKullaniciAd && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            👤 {talep.atananKullaniciAd}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-2">
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        🕐 {tarihFormat(talep.olusturmaTarihi)}
                      </span>
                      {talep.planliTarih && (
                        <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                          📅 Planlı: {new Date(talep.planliTarih).toLocaleDateString('tr-TR')}
                        </span>
                      )}
                      {talep.notlar.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--primary)' }}>
                          💬 {talep.notlar.length} not
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
