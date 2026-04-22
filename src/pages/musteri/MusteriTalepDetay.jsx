import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useServisTalebi } from '../../context/ServisTalebiContext'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

export default function MusteriTalepDetay() {
  const { id } = useParams()
  const { kullanici } = useAuth()
  const { talepler, notEkle, talepGuncelle, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()

  const [yeniNot, setYeniNot] = useState('')
  const [duzenlemeModu, setDuzenlemeModu] = useState(false)
  const [duzenForm, setDuzenForm] = useState(null)

  // Müşteri onay & memnuniyet akışı
  const [onayAsamasi, setOnayAsamasi] = useState(null) // null | 'anket' | 'sorun' | 'bitti'
  const [degPuan, setDegPuan] = useState(0)
  const [degHover, setDegHover] = useState(0)
  const [degYorum, setDegYorum] = useState('')
  const [sorunAciklama, setSorunAciklama] = useState('')
  const [mevcutDeg, setMevcutDeg] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]')
        .find(p => p.servisTalepId === parseInt(id)) || null
    } catch { return null }
  })

  const talep = talepler.find((t) => t.id === parseInt(id))

  if (!talep) {
    return (
      <div className="text-center py-20">
        <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>Talep bulunamadı</p>
        <button onClick={() => navigate('/musteri-portal/taleplerim')} className="mt-4 text-sm" style={{ color: 'var(--primary)' }}>
          Taleplerime Dön
        </button>
      </div>
    )
  }

  const anaTur = ANA_TURLER.find((t) => t.id === talep.anaTur)
  const durum = DURUM_LISTESI.find((d) => d.id === talep.durum)
  const aciliyet = ACILIYET_SEVIYELERI.find((a) => a.id === talep.aciliyet)
  const duzenlenebilir = talep.durum === 'bekliyor'

  const tarihFormat = (tarih) =>
    new Date(tarih).toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  const duzenlemeyiAc = () => {
    setDuzenForm({
      konu: talep.konu,
      aciklama: talep.aciklama,
      lokasyon: talep.lokasyon || '',
      cihazTuru: talep.cihazTuru || '',
      aciliyet: talep.aciliyet,
      ilgiliKisi: talep.ilgiliKisi || '',
      telefon: talep.telefon || '',
      uygunZaman: talep.uygunZaman || '',
    })
    setDuzenlemeModu(true)
  }

  const duzenlemeyiIptal = () => {
    setDuzenlemeModu(false)
    setDuzenForm(null)
  }

  const duzenlemeyiKaydet = () => {
    if (!duzenForm.konu.trim() || !duzenForm.aciklama.trim()) return
    talepGuncelle(talep.id, duzenForm, kullanici.ad, 'Müşteri tarafından güncellendi')
    setDuzenlemeModu(false)
    setDuzenForm(null)
  }

  const notGonder = () => {
    if (!yeniNot.trim()) return
    notEkle(talep.id, yeniNot.trim(), kullanici, 'musteri')
    setYeniNot('')
  }

  // Müşteri "Onaylıyorum" → ankete geç
  const musteriOnayladi = () => {
    talepGuncelle(talep.id, { musteriOnay: 'onaylandi' }, kullanici.ad, 'Müşteri çözümü onayladı')
    setOnayAsamasi('anket')
  }

  // Müşteri "Sorun Devam Ediyor" → açıklama formu
  const sorunDevamEdiyor = () => setOnayAsamasi('sorun')

  // Sorunu gönder → talebi yeniden aç
  const sorunGonder = () => {
    talepGuncelle(
      talep.id,
      { durum: 'devam_ediyor', musteriOnay: 'ret' },
      kullanici.ad,
      'Müşteri sorunu devam ettiğini bildirdi'
    )
    if (sorunAciklama.trim()) notEkle(talep.id, sorunAciklama.trim(), kullanici, 'musteri')
    setOnayAsamasi('bitti')
  }

  // Memnuniyet değerlendirmesini kaydet
  const degerlendirmeKaydet = () => {
    if (!degPuan) return
    const puanlar = JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]')
    const yeni = {
      id: crypto.randomUUID(),
      servisTalepId: talep.id,
      talepNo: talep.talepNo,
      musteriAd: talep.musteriAd,
      firmaAdi: talep.firmaAdi || '',
      konu: talep.konu,
      puan: degPuan,
      yorum: degYorum.trim(),
      tarih: new Date().toISOString(),
      kaydeden: kullanici.ad,
    }
    puanlar.push(yeni)
    localStorage.setItem('memnuniyet_puanlari', JSON.stringify(puanlar))
    setMevcutDeg(yeni)
    setOnayAsamasi('bitti')
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      {/* Geri */}
      <button
        onClick={() => navigate('/musteri-portal/taleplerim')}
        className="text-sm flex items-center gap-1 mb-5 transition-colors"
        style={{ color: 'var(--primary)' }}
      >
        ← Taleplerime Dön
      </button>

      {/* Başlık kartı */}
      <div
        className="rounded p-6 mb-5"
        style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 16px rgba(1,118,211,0.08)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="w-12 h-12 rounded flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: anaTur?.bg }}
            >
              {anaTur?.ikon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>{talep.talepNo}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: durum?.bg, color: durum?.renk }}>
                  {durum?.ikon} {durum?.isim}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: aciliyet?.bg, color: aciliyet?.renk }}>
                  {aciliyet?.ikon} {aciliyet?.isim}
                </span>
              </div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                {talep.konu}
              </h1>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Oluşturulma: {tarihFormat(talep.olusturmaTarihi)}
                {talep.guncellemeTarihi !== talep.olusturmaTarihi && (
                  <> · Güncellendi: {tarihFormat(talep.guncellemeTarihi)}</>
                )}
              </p>
            </div>
          </div>

          {/* Düzenle butonu — sadece "bekliyor" durumunda */}
          {duzenlenebilir && !duzenlemeModu && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={duzenlemeyiAc}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium flex-shrink-0"
              style={{
                background: 'rgba(1,118,211,0.08)',
                color: 'var(--primary)',
                border: '1px solid rgba(1,118,211,0.2)',
              }}
            >
              ✏️ Düzenle
            </motion.button>
          )}
        </div>

        {/* Bekliyor uyarısı */}
        {duzenlenebilir && !duzenlemeModu && (
          <div
            className="mt-4 px-3 py-2 rounded text-xs flex items-center gap-2"
            style={{ background: 'rgba(1,118,211,0.05)', color: 'var(--primary)' }}
          >
            <span>ℹ️</span>
            Talebiniz henüz incelemeye alınmadı. İçeriği düzenleyebilirsiniz.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sol: Detaylar */}
        <div className="lg:col-span-2 space-y-5">

          {/* Talep detayı / Düzenleme formu */}
          <AnimatePresence mode="wait">
            {duzenlemeModu ? (
              <motion.div
                key="duzenle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.2)', boxShadow: '0 4px 16px rgba(1,118,211,0.1)' }}
              >
                <div
                  className="px-5 py-4 flex items-center justify-between"
                  style={{ borderBottom: '1px solid rgba(1,118,211,0.08)', background: 'rgba(1,118,211,0.03)' }}
                >
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>✏️ Talebi Düzenle</h3>
                  <button onClick={duzenlemeyiIptal} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>İptal</button>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Konu Başlığı <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={duzenForm.konu}
                      onChange={(e) => setDuzenForm({ ...duzenForm, konu: e.target.value })}
                      className="w-full px-4 py-2.5 rounded text-sm outline-none"
                      style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Açıklama <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                      value={duzenForm.aciklama}
                      onChange={(e) => setDuzenForm({ ...duzenForm, aciklama: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-2.5 rounded text-sm outline-none resize-none"
                      style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Lokasyon</label>
                      <input
                        type="text"
                        value={duzenForm.lokasyon}
                        onChange={(e) => setDuzenForm({ ...duzenForm, lokasyon: e.target.value })}
                        className="w-full px-4 py-2.5 rounded text-sm outline-none"
                        style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                        onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Cihaz / Sistem</label>
                      <input
                        type="text"
                        value={duzenForm.cihazTuru}
                        onChange={(e) => setDuzenForm({ ...duzenForm, cihazTuru: e.target.value })}
                        className="w-full px-4 py-2.5 rounded text-sm outline-none"
                        style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                        onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Aciliyet</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {ACILIYET_SEVIYELERI.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setDuzenForm({ ...duzenForm, aciliyet: a.id })}
                          className="flex items-center gap-2 px-3 py-2 rounded text-sm font-medium"
                          style={{
                            background: duzenForm.aciliyet === a.id ? a.bg : 'rgba(248,250,252,0.8)',
                            border: `1px solid ${duzenForm.aciliyet === a.id ? a.renk : 'rgba(1,118,211,0.1)'}`,
                            color: duzenForm.aciliyet === a.id ? a.renk : '#64748b',
                          }}
                        >
                          {a.ikon} {a.isim}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">İlgili Kişi</label>
                      <input
                        type="text"
                        value={duzenForm.ilgiliKisi}
                        onChange={(e) => setDuzenForm({ ...duzenForm, ilgiliKisi: e.target.value })}
                        className="w-full px-4 py-2.5 rounded text-sm outline-none"
                        style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                        onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon</label>
                      <input
                        type="tel"
                        value={duzenForm.telefon}
                        onChange={(e) => setDuzenForm({ ...duzenForm, telefon: e.target.value })}
                        className="w-full px-4 py-2.5 rounded text-sm outline-none"
                        style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
                        onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                        onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Uygun Ziyaret Zamanı</label>
                    <input
                      type="text"
                      value={duzenForm.uygunZaman}
                      onChange={(e) => setDuzenForm({ ...duzenForm, uygunZaman: e.target.value })}
                      placeholder="Örn: Hafta içi 09:00-17:00"
                      className="w-full px-4 py-2.5 rounded text-sm outline-none"
                      style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                      onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={duzenlemeyiKaydet}
                      disabled={!duzenForm.konu.trim() || !duzenForm.aciklama.trim()}
                      className="flex-1 py-2.5 rounded text-sm font-semibold text-white"
                      style={{
                        background: duzenForm.konu.trim() && duzenForm.aciklama.trim()
                          ? 'var(--primary)'
                          : '#e2e8f0',
                        color: duzenForm.konu.trim() && duzenForm.aciklama.trim() ? 'white' : '#94a3b8',
                        boxShadow: duzenForm.konu.trim() ? '0 4px 12px rgba(1,118,211,0.3)' : 'none',
                      }}
                    >
                      ✓ Değişiklikleri Kaydet
                    </motion.button>
                    <button
                      onClick={duzenlemeyiIptal}
                      className="px-5 py-2.5 rounded text-sm font-medium"
                      style={{ background: 'rgba(1,118,211,0.06)', color: 'var(--primary)' }}
                    >
                      İptal
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="goruntule"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded p-5"
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              >
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  📄 Talep Detayı
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {talep.aciklama}
                </p>
                {(talep.lokasyon || talep.cihazTuru) && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid rgba(1,118,211,0.08)' }}>
                    {talep.lokasyon && (
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📍 Lokasyon: </span>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{talep.lokasyon}</span>
                      </div>
                    )}
                    {talep.cihazTuru && (
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🖥️ Cihaz/Sistem: </span>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{talep.cihazTuru}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Yazışmalar */}
          <div
            className="rounded overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(1,118,211,0.08)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                💬 Yazışmalar & Notlar
              </h3>
            </div>

            <div style={{ minHeight: '160px', maxHeight: '360px', overflowY: 'auto', padding: '16px' }}>
              {talep.notlar.length === 0 ? (
                <div className="text-center py-8">
                  <p style={{ color: '#cbd5e1', fontSize: '13px' }}>Henüz yazışma yok</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {talep.notlar.map((not) => {
                    const benimNot = not.kullaniciId === kullanici?.id
                    const znaTeam = not.tip === 'ic' && !benimNot
                    return (
                      <motion.div
                        key={not.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${benimNot ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className="max-w-sm rounded px-4 py-3"
                          style={{
                            background: benimNot
                              ? 'var(--primary)'
                              : znaTeam
                              ? 'rgba(16,185,129,0.06)'
                              : 'rgba(248,250,252,0.9)',
                            border: znaTeam ? '1px solid rgba(16,185,129,0.2)' : benimNot ? 'none' : '1px solid rgba(1,118,211,0.1)',
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span style={{ fontSize: '11px', fontWeight: 600, color: benimNot ? 'rgba(255,255,255,0.8)' : znaTeam ? '#10b981' : 'var(--primary)' }}>
                              {znaTeam ? '🛡️ ZNA Ekibi' : not.kullaniciAd}
                            </span>
                          </div>
                          <p style={{ fontSize: '13px', color: benimNot ? 'white' : 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {not.metin}
                          </p>
                          <p style={{ fontSize: '10px', color: benimNot ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', marginTop: '4px' }}>
                            {new Date(not.tarih).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                          </p>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>

            {!['tamamlandi', 'iptal'].includes(talep.durum) && (
              <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(1,118,211,0.08)', background: 'var(--bg-hover)' }}>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={yeniNot}
                    onChange={(e) => setYeniNot(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && notGonder()}
                    placeholder="Not veya soru yazın..."
                    className="flex-1 px-4 py-2.5 rounded text-sm outline-none"
                    style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-card)' }}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                    onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={notGonder}
                    disabled={!yeniNot.trim()}
                    className="px-4 py-2.5 rounded text-sm font-medium flex-shrink-0"
                    style={{
                      background: yeniNot.trim() ? 'var(--primary)' : '#e2e8f0',
                      color: yeniNot.trim() ? 'white' : 'var(--text-muted)',
                    }}
                  >
                    Gönder
                  </motion.button>
                </div>
              </div>
            )}
          </div>

          {/* Durum geçmişi */}
          {talep.durumGecmisi.length > 0 && (
            <div
              className="rounded p-5"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
                🕐 Durum Geçmişi
              </h3>
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: 'rgba(1,118,211,0.15)' }} />
                <div className="space-y-4 pl-10">
                  {[...talep.durumGecmisi].reverse().map((g, i) => {
                    const d = DURUM_LISTESI.find((x) => x.id === g.durum)
                    return (
                      <div key={i} className="relative">
                        <div
                          className="absolute -left-6 w-4 h-4 rounded-full"
                          style={{ background: d?.bg || 'rgba(1,118,211,0.1)', border: `2px solid ${d?.renk || 'var(--primary)'}` }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: d?.renk }}>{d?.ikon} {d?.isim}</span>
                        {g.aciklama && (
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{g.aciklama}</p>
                        )}
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{tarihFormat(g.tarih)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sağ: Bilgiler */}
        <div className="space-y-4">
          <div
            className="rounded p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
              Talep Bilgileri
            </h3>
            <div className="space-y-3">
              {[
                { k: 'Talep No', v: talep.talepNo },
                { k: 'Tür', v: `${anaTur?.ikon} ${anaTur?.isim}` },
                { k: 'Durum', v: durum?.isim, renk: durum?.renk },
                { k: 'Aciliyet', v: `${aciliyet?.ikon} ${aciliyet?.isim}`, renk: aciliyet?.renk },
                talep.atananKullaniciAd && { k: 'Atanan Ekip', v: talep.atananKullaniciAd },
                talep.planliTarih && { k: 'Planlı Tarih', v: new Date(talep.planliTarih).toLocaleDateString('tr-TR') },
                { k: 'İlgili Kişi', v: talep.ilgiliKisi },
                talep.telefon && { k: 'Telefon', v: talep.telefon },
                talep.uygunZaman && { k: 'Uygun Zaman', v: talep.uygunZaman },
              ].filter(Boolean).map(({ k, v, renk }) => (
                <div key={k}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>{k}</p>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: renk || 'var(--text-primary)' }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Müşteri Onay & Memnuniyet Akışı ── */}
          {talep.durum === 'tamamlandi' && (
            <AnimatePresence mode="wait">

              {/* 1. İlk onay sorusu */}
              {(talep.musteriOnay === null || talep.musteriOnay === undefined) && !onayAsamasi && (
                <motion.div key="onay-soru"
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                  className="rounded p-5"
                  style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.25)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">✅</span>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>Talep Tamamlandı</p>
                  </div>
                  <p style={{ fontSize: '12px', color: '#047857', marginBottom: '14px', lineHeight: 1.5 }}>
                    Teknik ekibimiz talebinizi çözdüğünü bildirdi. Sorununuz çözüldü mü?
                  </p>
                  <div className="flex gap-2">
                    <motion.button whileTap={{ scale:0.97 }} onClick={musteriOnayladi}
                      className="flex-1 py-2.5 rounded text-xs font-semibold transition-all"
                      style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color:'white', boxShadow:'0 4px 12px rgba(16,185,129,0.3)' }}>
                      👍 Evet, Çözüldü
                    </motion.button>
                    <motion.button whileTap={{ scale:0.97 }} onClick={sorunDevamEdiyor}
                      className="flex-1 py-2.5 rounded text-xs font-semibold transition-all"
                      style={{ background: 'rgba(239,68,68,0.1)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.25)' }}>
                      👎 Sorun Devam Ediyor
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* 2. Memnuniyet anketi */}
              {onayAsamasi === 'anket' && (
                <motion.div key="anket"
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                  className="rounded p-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.3)', boxShadow:'0 4px 16px rgba(245,158,11,0.1)' }}>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>⭐ Hizmet Değerlendirmesi</p>
                  <p style={{ fontSize: '12px', color: '#b45309', marginBottom: '16px' }}>
                    Aldığınız hizmeti değerlendirmeniz bize çok yardımcı olur.
                  </p>

                  {/* Yıldız seçici */}
                  <div className="flex justify-center gap-2 mb-3">
                    {[1,2,3,4,5].map(i => (
                      <button key={i}
                        onClick={() => setDegPuan(i)}
                        onMouseEnter={() => setDegHover(i)}
                        onMouseLeave={() => setDegHover(0)}
                        style={{
                          fontSize: '36px', lineHeight: 1,
                          color: i <= (degHover || degPuan) ? '#f59e0b' : '#e2e8f0',
                          transform: i <= (degHover || degPuan) ? 'scale(1.2)' : 'scale(1)',
                          transition: 'all 0.1s',
                          background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                        }}>
                        ★
                      </button>
                    ))}
                  </div>

                  {/* Puan etiketi */}
                  {degPuan > 0 && (
                    <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }}
                      className="text-center text-sm font-semibold mb-3"
                      style={{ color: ['','#ef4444','#f97316','#f59e0b','#10b981','var(--primary)'][degPuan] }}>
                      {['','😞 Çok Kötü','😕 Kötü','😐 Orta','🙂 İyi','😄 Mükemmel'][degPuan]}
                    </motion.p>
                  )}

                  <textarea
                    value={degYorum}
                    onChange={e => setDegYorum(e.target.value)}
                    placeholder="Yorumunuz (isteğe bağlı)..."
                    rows={2}
                    className="w-full px-3 py-2.5 rounded text-sm resize-none outline-none mb-3"
                    style={{ border:'1px solid rgba(245,158,11,0.3)', background:'rgba(255,251,235,0.5)' }}
                    onFocus={e => e.target.style.borderColor='#f59e0b'}
                    onBlur={e => e.target.style.borderColor='rgba(245,158,11,0.3)'}
                  />

                  <motion.button whileTap={{ scale:0.97 }}
                    onClick={degerlendirmeKaydet}
                    disabled={!degPuan}
                    className="w-full py-2.5 rounded text-sm font-semibold transition-all"
                    style={{
                      background: degPuan ? 'linear-gradient(135deg,#f59e0b,#f97316)' : '#e2e8f0',
                      color: degPuan ? 'white' : 'var(--text-muted)',
                      boxShadow: degPuan ? '0 4px 12px rgba(245,158,11,0.35)' : 'none',
                    }}>
                    ⭐ Değerlendirmeyi Gönder
                  </motion.button>
                </motion.div>
              )}

              {/* 3. Sorun devam ediyor formu */}
              {onayAsamasi === 'sorun' && (
                <motion.div key="sorun"
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                  className="rounded p-5"
                  style={{ background: 'rgba(239,68,68,0.04)', border:'1px solid rgba(239,68,68,0.2)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>
                    ⚠️ Sorunu Bildir
                  </p>
                  <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
                    Talebiniz yeniden açılacak. Sorun hakkında bilgi verebilir misiniz?
                  </p>
                  <textarea
                    value={sorunAciklama}
                    onChange={e => setSorunAciklama(e.target.value)}
                    placeholder="Sorun nedir? Neler denendi?..."
                    rows={3}
                    className="w-full px-3 py-2.5 rounded text-sm resize-none outline-none mb-3"
                    style={{ border:'1px solid rgba(239,68,68,0.2)', background:'var(--bg-card)' }}
                    onFocus={e => e.target.style.borderColor='#ef4444'}
                    onBlur={e => e.target.style.borderColor='rgba(239,68,68,0.2)'}
                  />
                  <div className="flex gap-2">
                    <motion.button whileTap={{ scale:0.97 }} onClick={sorunGonder}
                      className="flex-1 py-2 rounded text-sm font-semibold text-white"
                      style={{ background:'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow:'0 4px 12px rgba(239,68,68,0.3)' }}>
                      Talebi Yeniden Aç
                    </motion.button>
                    <button onClick={() => setOnayAsamasi(null)}
                      className="px-4 py-2 rounded text-sm border text-gray-500"
                      style={{ border:'1px solid #e5e7eb' }}>
                      İptal
                    </button>
                  </div>
                </motion.div>
              )}

              {/* 4. Tamamlandı — daha önce memnuniyet verilmişse göster */}
              {(onayAsamasi === 'bitti' || mevcutDeg) && talep.musteriOnay === 'onaylandi' && (
                <motion.div key="bitti"
                  initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }}
                  className="rounded p-5"
                  style={{ background:'rgba(1,118,211,0.05)', border:'1px solid rgba(1,118,211,0.2)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#4f46e5', marginBottom:'8px' }}>
                    ✅ Değerlendirmeniz Alındı
                  </p>
                  {mevcutDeg && (
                    <>
                      <div className="flex items-center gap-1 mb-2">
                        {[1,2,3,4,5].map(i=>(
                          <span key={i} style={{ fontSize:'22px', color: i<=mevcutDeg.puan?'#f59e0b':'#e2e8f0' }}>★</span>
                        ))}
                        <span className="ml-2 text-sm font-bold" style={{ color:'#f59e0b' }}>{mevcutDeg.puan}/5</span>
                      </div>
                      {mevcutDeg.yorum && (
                        <p style={{ fontSize:'12px', color:'#64748b', fontStyle:'italic' }}>"{mevcutDeg.yorum}"</p>
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {/* 5. Sorun bildirildi — talep yeniden açıldı */}
              {talep.musteriOnay === 'ret' && (
                <motion.div key="ret" initial={{ opacity:0 }} animate={{ opacity:1 }}
                  className="rounded p-4"
                  style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)' }}>
                  <p style={{ fontSize:'13px', fontWeight:600, color:'#dc2626' }}>
                    ⚠️ Talebiniz yeniden açıldı
                  </p>
                  <p style={{ fontSize:'12px', color:'#ef4444', marginTop:'4px' }}>
                    Ekibimiz en kısa sürede sizinle iletişime geçecek.
                  </p>
                </motion.div>
              )}

            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  )
}
