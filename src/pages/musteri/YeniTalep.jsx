import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'

const bosForm = {
  anaTur: '',
  altKategori: '',
  konu: '',
  lokasyon: '',
  cihazTuru: '',
  aciklama: '',
  aciliyet: 'normal',
  ilgiliKisi: '',
  telefon: '',
  uygunZaman: '',
}

export default function YeniTalep() {
  const { kullanici } = useAuth()
  const { talepOlustur, ANA_TURLER, ALT_KATEGORILER, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ ...bosForm, ilgiliKisi: kullanici?.ad || '' })
  const [gonderildi, setGonderildi] = useState(false)
  const [hata, setHata] = useState({})
  const [adim, setAdim] = useState(1)

  const izinliTurler = kullanici?.izinliTurler
  const filtreliTurler =
    izinliTurler && izinliTurler.length > 0
      ? ANA_TURLER.filter((t) => izinliTurler.includes(t.id))
      : ANA_TURLER

  useEffect(() => {
    const tur = searchParams.get('tur')
    if (tur && filtreliTurler.find((t) => t.id === tur)) {
      setForm((prev) => ({ ...prev, anaTur: tur }))
      setAdim(2)
    }
  }, [])

  const altKategoriler = form.anaTur ? ALT_KATEGORILER[form.anaTur] || [] : []

  const guncelle = (alan, deger) => {
    setForm((prev) => {
      const yeni = { ...prev, [alan]: deger }
      if (alan === 'anaTur') yeni.altKategori = ''
      return yeni
    })
    if (hata[alan]) setHata((prev) => ({ ...prev, [alan]: '' }))
  }

  const dogrula = () => {
    const yeniHata = {}
    if (!form.anaTur) yeniHata.anaTur = 'Talep türü seçiniz'
    if (!form.altKategori) yeniHata.altKategori = 'Alt kategori seçiniz'
    if (!form.konu.trim()) yeniHata.konu = 'Konu başlığı giriniz'
    if (!form.aciklama.trim()) yeniHata.aciklama = 'Açıklama giriniz'
    setHata(yeniHata)
    return Object.keys(yeniHata).length === 0
  }

  const gonder = () => {
    if (!dogrula()) return
    const talep = talepOlustur(form, kullanici)
    setGonderildi(true)
    setTimeout(() => navigate(`/musteri-portal/talep/${talep.id}`), 1800)
  }

  if (gonderildi) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-6"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 8px 32px rgba(16,185,129,0.3)' }}
        >
          ✓
        </motion.div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Talebiniz Alındı!
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          En kısa sürede ekibimiz sizinle iletişime geçecektir.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Başlık */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/musteri-portal')}
          className="text-sm flex items-center gap-1 mb-3 transition-colors"
          style={{ color: 'var(--primary)' }}
        >
          ← Geri Dön
        </button>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Yeni Talep Oluştur</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
          Talebinizi aşağıdaki formu doldurarak iletebilirsiniz.
        </p>
      </div>

      <div
        className="rounded overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
      >
        {/* Adım göstergesi */}
        <div
          className="flex"
          style={{ borderBottom: '1px solid var(--border)', background: 'rgba(1,118,211,0.02)' }}
        >
          {[
            { no: 1, isim: 'Talep Türü' },
            { no: 2, isim: 'Detaylar' },
            { no: 3, isim: 'İletişim' },
          ].map((a) => (
            <button
              key={a.no}
              onClick={() => a.no < adim && setAdim(a.no)}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all"
              style={{
                color: a.no === adim ? 'var(--primary)' : a.no < adim ? '#10b981' : '#94a3b8',
                borderBottom: a.no === adim ? '2px solid #0176D3' : '2px solid transparent',
                cursor: a.no < adim ? 'pointer' : 'default',
              }}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: a.no === adim ? 'var(--primary)' : a.no < adim ? '#10b981' : '#e2e8f0',
                  color: a.no <= adim ? 'white' : '#94a3b8',
                }}
              >
                {a.no < adim ? '✓' : a.no}
              </span>
              <span className="hidden sm:block">{a.isim}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '28px' }}>
          {/* ADIM 1: Talep türü seçimi */}
          {adim === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
                Talep Türünü Seçin
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {filtreliTurler.map((tur) => {
                  const secili = form.anaTur === tur.id
                  return (
                    <motion.button
                      key={tur.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => guncelle('anaTur', tur.id)}
                      className="flex flex-col items-center gap-2 p-4 rounded text-sm font-medium transition-all"
                      style={{
                        background: secili ? tur.bg : 'var(--bg-hover)',
                        border: `2px solid ${secili ? tur.renk : 'rgba(1,118,211,0.1)'}`,
                        color: secili ? tur.renk : '#64748b',
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>{tur.ikon}</span>
                      <span>{tur.isim}</span>
                    </motion.button>
                  )
                })}
              </div>
              {hata.anaTur && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>{hata.anaTur}</p>}

              {form.anaTur && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    Alt Kategori Seçin
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {altKategoriler.map((kat) => {
                      const secili = form.altKategori === kat.id
                      const anaTur = ANA_TURLER.find((t) => t.id === form.anaTur)
                      return (
                        <button
                          key={kat.id}
                          onClick={() => guncelle('altKategori', kat.id)}
                          className="flex items-center gap-2 px-4 py-2.5 rounded text-sm text-left transition-all"
                          style={{
                            background: secili ? anaTur?.bg : 'rgba(248,250,252,0.8)',
                            border: `1px solid ${secili ? anaTur?.renk : 'rgba(1,118,211,0.1)'}`,
                            color: secili ? anaTur?.renk : '#475569',
                            fontWeight: secili ? 600 : 400,
                          }}
                        >
                          <span style={{ fontSize: '14px' }}>{secili ? '●' : '○'}</span>
                          {kat.isim}
                        </button>
                      )
                    })}
                  </div>
                  {hata.altKategori && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>{hata.altKategori}</p>}
                </motion.div>
              )}

              <div className="flex justify-end mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    const e = {}
                    if (!form.anaTur) e.anaTur = 'Talep türü seçiniz'
                    if (!form.altKategori) e.altKategori = 'Alt kategori seçiniz'
                    if (Object.keys(e).length > 0) { setHata(e); return }
                    setAdim(2)
                  }}
                  className="px-6 py-2.5 rounded text-sm font-medium text-white"
                  style={{ background: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
                >
                  Devam →
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ADIM 2: Detaylar */}
          {adim === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Konu Başlığı <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.konu}
                    onChange={(e) => guncelle('konu', e.target.value)}
                    placeholder="Talebinizi kısaca özetleyin"
                    className="w-full px-4 py-2.5 rounded text-sm outline-none transition-all"
                    style={{
                      border: `1px solid ${hata.konu ? '#ef4444' : 'rgba(1,118,211,0.2)'}`,
                      background: 'rgba(248,250,252,0.8)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={(e) => (e.target.style.borderColor = hata.konu ? '#ef4444' : 'rgba(1,118,211,0.2)')}
                  />
                  {hata.konu && <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{hata.konu}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Açıklama <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    value={form.aciklama}
                    onChange={(e) => guncelle('aciklama', e.target.value)}
                    placeholder="Sorunu ya da talebinizi ayrıntılı açıklayınız..."
                    rows={4}
                    className="w-full px-4 py-2.5 rounded text-sm outline-none transition-all resize-none"
                    style={{
                      border: `1px solid ${hata.aciklama ? '#ef4444' : 'rgba(1,118,211,0.2)'}`,
                      background: 'rgba(248,250,252,0.8)',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={(e) => (e.target.style.borderColor = hata.aciklama ? '#ef4444' : 'rgba(1,118,211,0.2)')}
                  />
                  {hata.aciklama && <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>{hata.aciklama}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Lokasyon / Adres</label>
                    <input
                      type="text"
                      value={form.lokasyon}
                      onChange={(e) => guncelle('lokasyon', e.target.value)}
                      placeholder="Bina, kat, oda..."
                      className="w-full px-4 py-2.5 rounded text-sm outline-none"
                      style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'rgba(248,250,252,0.8)' }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Cihaz / Sistem Türü</label>
                    <input
                      type="text"
                      value={form.cihazTuru}
                      onChange={(e) => guncelle('cihazTuru', e.target.value)}
                      placeholder="Kamera, NVR, PDKS..."
                      className="w-full px-4 py-2.5 rounded text-sm outline-none"
                      style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'rgba(248,250,252,0.8)' }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Aciliyet Seviyesi</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ACILIYET_SEVIYELERI.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => guncelle('aciliyet', a.id)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded text-sm font-medium transition-all"
                        style={{
                          background: form.aciliyet === a.id ? a.bg : 'rgba(248,250,252,0.8)',
                          border: `1px solid ${form.aciliyet === a.id ? a.renk : 'rgba(1,118,211,0.1)'}`,
                          color: form.aciliyet === a.id ? a.renk : '#64748b',
                        }}
                      >
                        <span>{a.ikon}</span>
                        <span>{a.isim}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setAdim(1)}
                  className="px-5 py-2.5 rounded text-sm font-medium"
                  style={{ background: 'rgba(1,118,211,0.08)', color: 'var(--primary)' }}
                >
                  ← Geri
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    const e = {}
                    if (!form.konu.trim()) e.konu = 'Konu başlığı giriniz'
                    if (!form.aciklama.trim()) e.aciklama = 'Açıklama giriniz'
                    if (Object.keys(e).length > 0) { setHata(e); return }
                    setAdim(3)
                  }}
                  className="px-6 py-2.5 rounded text-sm font-medium text-white"
                  style={{ background: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
                >
                  Devam →
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ADIM 3: İletişim bilgileri + özet */}
          {adim === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">İlgili Kişi</label>
                    <input
                      type="text"
                      value={form.ilgiliKisi}
                      onChange={(e) => guncelle('ilgiliKisi', e.target.value)}
                      className="w-full px-4 py-2.5 rounded text-sm outline-none"
                      style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'rgba(248,250,252,0.8)' }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon Numarası</label>
                    <input
                      type="tel"
                      value={form.telefon}
                      onChange={(e) => guncelle('telefon', e.target.value)}
                      placeholder="0xxx xxx xx xx"
                      className="w-full px-4 py-2.5 rounded text-sm outline-none"
                      style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'rgba(248,250,252,0.8)' }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Uygun Ziyaret / Destek Zamanı</label>
                  <input
                    type="text"
                    value={form.uygunZaman}
                    onChange={(e) => guncelle('uygunZaman', e.target.value)}
                    placeholder="Örn: Hafta içi 09:00-17:00, Öğleden sonra..."
                    className="w-full px-4 py-2.5 rounded text-sm outline-none"
                    style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'rgba(248,250,252,0.8)' }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                  />
                </div>
              </div>

              {/* Özet */}
              <div
                className="rounded p-4 mb-6"
                style={{ background: 'rgba(1,118,211,0.04)', border: '1px solid rgba(1,118,211,0.12)' }}
              >
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)', marginBottom: '12px' }}>
                  📋 Talep Özeti
                </p>
                <div className="grid grid-cols-2 gap-y-2">
                  {[
                    { k: 'Tür', v: ANA_TURLER.find((t) => t.id === form.anaTur)?.isim },
                    { k: 'Konu', v: form.konu },
                    { k: 'Lokasyon', v: form.lokasyon || '—' },
                    { k: 'Aciliyet', v: ACILIYET_SEVIYELERI.find((a) => a.id === form.aciliyet)?.isim },
                  ].map(({ k, v }) => (
                    <div key={k}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>{k}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setAdim(2)}
                  className="px-5 py-2.5 rounded text-sm font-medium"
                  style={{ background: 'rgba(1,118,211,0.08)', color: 'var(--primary)' }}
                >
                  ← Geri
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={gonder}
                  className="px-8 py-2.5 rounded text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
                >
                  ✓ Talebi Gönder
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
