import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import CustomSelect from '../components/CustomSelect'

export default function ServisTalepleri() {
  const { kullanici } = useAuth()
  const { talepler, talepSil, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const [silOnayId, setSilOnayId] = useState(null)
  const navigate = useNavigate()

  const [aramaMetni, setAramaMetni] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('tumu')
  const [turFiltre, setTurFiltre] = useState('tumu')
  const [aciliyetFiltre, setAciliyetFiltre] = useState('tumu')
  const [gorunum, setGorunum] = useState('liste') // liste | pano

  const filtrelenmis = talepler.filter((t) => {
    if (aramaMetni) {
      const aramaKucuk = aramaMetni.toLowerCase()
      if (
        !(t.talepNo || '').toLowerCase().includes(aramaKucuk) &&
        !(t.konu || '').toLowerCase().includes(aramaKucuk) &&
        !(t.musteriAd || '').toLowerCase().includes(aramaKucuk) &&
        !(t.firmaAdi || '').toLowerCase().includes(aramaKucuk)
      ) return false
    }
    if (durumFiltre !== 'tumu' && t.durum !== durumFiltre) return false
    if (turFiltre !== 'tumu' && t.anaTur !== turFiltre) return false
    if (aciliyetFiltre !== 'tumu' && t.aciliyet !== aciliyetFiltre) return false
    return true
  }).sort((a, b) => {
    // Aciller her zaman üstte
    const acilSira = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 }
    if (acilSira[a.aciliyet] !== acilSira[b.aciliyet]) return acilSira[a.aciliyet] - acilSira[b.aciliyet]
    return new Date(b.olusturmaTarihi) - new Date(a.olusturmaTarihi)
  })

  const istatistikler = {
    toplam: talepler.length,
    bekliyor: talepler.filter((t) => t.durum === 'bekliyor').length,
    devam: talepler.filter((t) => ['inceleniyor', 'atandi', 'devam_ediyor'].includes(t.durum)).length,
    tamamlandi: talepler.filter((t) => t.durum === 'tamamlandi').length,
    acil: talepler.filter((t) => t.aciliyet === 'acil' && !['tamamlandi', 'iptal'].includes(t.durum)).length,
  }

  const tarihFormat = (tarih) => {
    if (!tarih) return '—'
    const d = new Date(tarih)
    if (isNaN(d)) return '—'
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Servis Talepleri</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '3px' }}>
            Müşteri talep ve servis portalı
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGorunum('liste')}
            className="px-3 py-2 rounded-xl text-sm transition-all"
            style={{
              background: gorunum === 'liste' ? 'rgba(1,118,211,0.1)' : 'var(--bg-hover)',
              color: gorunum === 'liste' ? 'var(--primary)' : 'var(--text-secondary)',
              border: '1px solid rgba(1,118,211,0.15)',
            }}
          >
            ☰ Liste
          </button>
          <button
            onClick={() => setGorunum('pano')}
            className="px-3 py-2 rounded-xl text-sm transition-all"
            style={{
              background: gorunum === 'pano' ? 'rgba(1,118,211,0.1)' : 'var(--bg-hover)',
              color: gorunum === 'pano' ? 'var(--primary)' : 'var(--text-secondary)',
              border: '1px solid rgba(1,118,211,0.15)',
            }}
          >
            ⊞ Pano
          </button>
        </div>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { k: 'Toplam', v: istatistikler.toplam, ikon: '📋', renk: '#0176D3', bg: 'rgba(1,118,211,0.08)', filtre: null },
          { k: 'Bekliyor', v: istatistikler.bekliyor, ikon: '⏳', renk: '#6b7280', bg: 'rgba(107,114,128,0.08)', filtre: 'bekliyor' },
          { k: 'Devam Eden', v: istatistikler.devam, ikon: '🔄', renk: '#f59e0b', bg: 'rgba(245,158,11,0.08)', filtre: 'devam_ediyor' },
          { k: 'Tamamlandı', v: istatistikler.tamamlandi, ikon: '✅', renk: '#10b981', bg: 'rgba(16,185,129,0.08)', filtre: 'tamamlandi' },
          { k: 'Acil', v: istatistikler.acil, ikon: '🔴', renk: '#ef4444', bg: 'rgba(239,68,68,0.08)', filtre: null },
        ].map(({ k, v, ikon, renk, bg, filtre }) => (
          <motion.div
            key={k}
            whileHover={{ y: -2 }}
            onClick={() => filtre && setDurumFiltre(filtre)}
            className="rounded-2xl p-4"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(1,118,211,0.1)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              cursor: filtre ? 'pointer' : 'default',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: bg }}>
                {ikon}
              </div>
              <span style={{ fontSize: '22px', fontWeight: 700, color: renk }}>{v}</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{k}</p>
          </motion.div>
        ))}
      </div>

      {/* Filtreler */}
      <div
        className="rounded-2xl p-4 mb-5"
        style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      >
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={aramaMetni}
            onChange={(e) => setAramaMetni(e.target.value)}
            placeholder="Talep no, konu, müşteri veya firma ara..."
            className="flex-1 min-w-48 px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
          />
          <CustomSelect
            value={durumFiltre}
            onChange={(e) => setDurumFiltre(e.target.value)}
            className="px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
            style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            <option value="tumu">Tüm Durumlar</option>
            {DURUM_LISTESI.map((d) => <option key={d.id} value={d.id}>{d.ikon} {d.isim}</option>)}
          </CustomSelect>
          <CustomSelect
            value={turFiltre}
            onChange={(e) => setTurFiltre(e.target.value)}
            className="px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
            style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            <option value="tumu">Tüm Türler</option>
            {ANA_TURLER.map((t) => <option key={t.id} value={t.id}>{t.ikon} {t.isim}</option>)}
          </CustomSelect>
          <CustomSelect
            value={aciliyetFiltre}
            onChange={(e) => setAciliyetFiltre(e.target.value)}
            className="px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
            style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            <option value="tumu">Tüm Aciliyet</option>
            {ACILIYET_SEVIYELERI.map((a) => <option key={a.id} value={a.id}>{a.ikon} {a.isim}</option>)}
          </CustomSelect>
          {(durumFiltre !== 'tumu' || turFiltre !== 'tumu' || aciliyetFiltre !== 'tumu' || aramaMetni) && (
            <button
              onClick={() => { setDurumFiltre('tumu'); setTurFiltre('tumu'); setAciliyetFiltre('tumu'); setAramaMetni('') }}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
            >
              ✕ Temizle
            </button>
          )}
        </div>
      </div>

      {/* Sonuç sayısı */}
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        {filtrelenmis.length} talep gösteriliyor
      </p>

      {/* Liste görünümü */}
      {gorunum === 'liste' && (
        <>
          {filtrelenmis.length === 0 ? (
            <div
              className="rounded-2xl py-16 text-center"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)' }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Talep bulunamadı</p>
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              {/* Tablo başlığı */}
              <div
                className="grid text-xs font-semibold px-5 py-3"
                style={{
                  gridTemplateColumns: '1fr 2fr 1.2fr 1fr 1fr 1fr auto',
                  background: 'rgba(1,118,211,0.04)',
                  borderBottom: '1px solid rgba(1,118,211,0.08)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                <span>Talep No</span>
                <span>Konu / Müşteri</span>
                <span>Tür</span>
                <span>Aciliyet</span>
                <span>Durum</span>
                <span>Tarih</span>
                <span></span>
              </div>

              {filtrelenmis.map((talep, i) => {
                const anaTur = ANA_TURLER.find((t) => t.id === talep.anaTur)
                const durum = DURUM_LISTESI.find((d) => d.id === talep.durum)
                const aciliyet = ACILIYET_SEVIYELERI.find((a) => a.id === talep.aciliyet)
                const silOnayAcik = silOnayId === talep.id
                return (
                  <div
                    key={talep.id}
                    style={{ borderBottom: i < filtrelenmis.length - 1 ? '1px solid rgba(1,118,211,0.06)' : 'none' }}
                  >
                    <motion.div
                      whileHover={{ background: 'rgba(1,118,211,0.03)' }}
                      onClick={() => !silOnayAcik && navigate(`/servis-talepleri/${talep.id}`)}
                      className="grid items-center px-5 py-3.5 cursor-pointer transition-colors"
                      style={{ gridTemplateColumns: '1fr 2fr 1.2fr 1fr 1fr 1fr auto' }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)' }}>{talep.talepNo}</span>
                      <div className="min-w-0">
                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{talep.konu}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{talep.firmaAdi || talep.musteriAd}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs w-fit" style={{ background: anaTur?.bg, color: anaTur?.renk }}>
                        {anaTur?.ikon} {anaTur?.isim}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs w-fit" style={{ background: aciliyet?.bg, color: aciliyet?.renk }}>
                        {aciliyet?.ikon} {aciliyet?.isim}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs w-fit" style={{ background: durum?.bg, color: durum?.renk }}>
                        {durum?.ikon} {durum?.isim}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(talep.olusturmaTarihi).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSilOnayId(silOnayAcik ? null : talep.id) }}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ color: silOnayAcik ? '#ef4444' : '#cbd5e1' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = silOnayAcik ? '#ef4444' : '#cbd5e1')}
                        title="Sil"
                      >
                        🗑️
                      </button>
                    </motion.div>

                    {/* Satır içi silme onayı */}
                    {silOnayAcik && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center justify-between px-5 py-3 gap-3"
                        style={{ background: 'rgba(239,68,68,0.04)', borderTop: '1px solid rgba(239,68,68,0.1)' }}
                      >
                        <p style={{ fontSize: '13px', color: '#dc2626' }}>
                          ⚠️ <strong>{talep.talepNo}</strong> silinecek. Emin misiniz?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSilOnayId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                          >
                            İptal
                          </button>
                          <button
                            onClick={() => { talepSil(talep.id); setSilOnayId(null) }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                          >
                            Evet, Sil
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Pano görünümü */}
      {gorunum === 'pano' && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {DURUM_LISTESI.filter((d) => d.id !== 'iptal').map((durum) => {
            const durumTalepleri = filtrelenmis.filter((t) => t.durum === durum.id)
            return (
              <div key={durum.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ background: durum.bg, borderBottom: `2px solid ${durum.renk}22` }}
                >
                  <span className="text-sm font-semibold" style={{ color: durum.renk }}>
                    {durum.ikon} {durum.isim}
                  </span>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: durum.renk, color: 'white' }}
                  >
                    {durumTalepleri.length}
                  </span>
                </div>
                <div className="p-2 space-y-2" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  {durumTalepleri.length === 0 && (
                    <p className="text-center py-4 text-xs" style={{ color: '#cbd5e1' }}>Talep yok</p>
                  )}
                  {durumTalepleri.map((talep) => {
                    const anaTur = ANA_TURLER.find((t) => t.id === talep.anaTur)
                    const aciliyet = ACILIYET_SEVIYELERI.find((a) => a.id === talep.aciliyet)
                    return (
                      <motion.div
                        key={talep.id}
                        whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(1,118,211,0.12)' }}
                        onClick={() => navigate(`/servis-talepleri/${talep.id}`)}
                        className="rounded-xl p-3 cursor-pointer bg-white"
                        style={{ border: '1px solid rgba(1,118,211,0.08)' }}
                      >
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary)' }}>{talep.talepNo}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: aciliyet?.bg, color: aciliyet?.renk }}>
                            {aciliyet?.ikon}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{talep.konu}</p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{talep.firmaAdi || talep.musteriAd}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <span style={{ fontSize: '11px', color: anaTur?.renk }}>{anaTur?.ikon} {anaTur?.isim}</span>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
