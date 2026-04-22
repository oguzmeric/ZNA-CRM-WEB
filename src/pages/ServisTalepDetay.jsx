import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import CustomSelect from '../components/CustomSelect'

export default function ServisTalepDetay() {
  const { id } = useParams()
  const { kullanici, kullanicilar } = useAuth()
  const { talepler, talepGuncelle, talepSil, notEkle, ANA_TURLER, DURUM_LISTESI, ACILIYET_SEVIYELERI } = useServisTalebi()
  const navigate = useNavigate()

  const [yeniNot, setYeniNot] = useState('')
  const [notTip, setNotTip] = useState('ic')
  const [duzenlemeModu, setDuzenlemeModu] = useState(false)
  const [duzenForm, setDuzenForm] = useState({})
  const [silOnayGoster, setSilOnayGoster] = useState(false)

  // Memnuniyet değerlendirmesi
  const [degPuan, setDegPuan] = useState(0)
  const [degHover, setDegHover] = useState(0)
  const [degYorum, setDegYorum] = useState('')
  const [mevcutDeg, setMevcutDeg] = useState(() => {
    try {
      const puanlar = JSON.parse(localStorage.getItem('memnuniyet_puanlari') || '[]')
      return puanlar.find(p => p.servisTalepId === parseInt(id)) || null
    } catch { return null }
  })

  const talep = talepler.find((t) => t.id === parseInt(id))

  if (!talep) {
    return (
      <div style={{ padding: '24px' }} className="text-center py-20">
        <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>Talep bulunamadı</p>
        <button onClick={() => navigate('/servis-talepleri')} style={{ color: 'var(--primary)' }} className="mt-4 text-sm">
          ← Taleplere Dön
        </button>
      </div>
    )
  }

  const anaTur = ANA_TURLER.find((t) => t.id === talep.anaTur)
  const durum = DURUM_LISTESI.find((d) => d.id === talep.durum)
  const aciliyet = ACILIYET_SEVIYELERI.find((a) => a.id === talep.aciliyet)

  const znaKullanicilar = kullanicilar.filter((k) => k.tip !== 'musteri')

  const durumGuncelle = (yeniDurum, aciklama = '') => {
    talepGuncelle(talep.id, { durum: yeniDurum }, kullanici.ad, aciklama)
  }

  const atamayapGuncelle = (kullaniciId) => {
    const k = kullanicilar.find((x) => x.id.toString() === kullaniciId)
    talepGuncelle(
      talep.id,
      { atananKullaniciId: k?.id || null, atananKullaniciAd: k?.ad || null, durum: k ? 'atandi' : talep.durum },
      kullanici.ad,
      k ? `${k.ad} kişisine atandı` : 'Atama kaldırıldı'
    )
  }

  const planliTarihGuncelle = (tarih) => {
    talepGuncelle(talep.id, { planliTarih: tarih || null }, kullanici.ad, tarih ? `Planlı tarih: ${new Date(tarih).toLocaleDateString('tr-TR')}` : 'Planlı tarih kaldırıldı')
  }

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
  }

  const notGonder = () => {
    if (!yeniNot.trim()) return
    notEkle(talep.id, yeniNot.trim(), kullanici, notTip)
    setYeniNot('')
  }

  const tarihFormat = (tarih) =>
    new Date(tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ padding: '24px' }}>
      {/* Geri + başlık */}
      <button
        onClick={() => navigate('/servis-talepleri')}
        className="text-sm flex items-center gap-1 mb-5 transition-colors"
        style={{ color: 'var(--primary)' }}
      >
        ← Taleplere Dön
      </button>

      {/* Başlık kartı */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 16px rgba(1,118,211,0.08)' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: anaTur?.bg }}
            >
              {anaTur?.ikon}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>{talep.talepNo}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: durum?.bg, color: durum?.renk }}>
                  {durum?.ikon} {durum?.isim}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: aciliyet?.bg, color: aciliyet?.renk }}>
                  {aciliyet?.ikon} {aciliyet?.isim}
                </span>
              </div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{talep.konu}</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span style={{ fontWeight: 600 }}>{talep.firmaAdi || talep.musteriAd}</span>
                {talep.firmaAdi && <span style={{ color: 'var(--text-muted)' }}> · {talep.musteriAd}</span>}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                {tarihFormat(talep.olusturmaTarihi)}
              </p>
            </div>
          </div>

          {/* Hızlı aksiyonlar */}
          <div className="flex items-center gap-2 flex-wrap">
            {talep.durum !== 'tamamlandi' && talep.durum !== 'iptal' && (
              <>
                {talep.durum === 'bekliyor' && (
                  <button
                    onClick={() => durumGuncelle('inceleniyor', 'İncelemeye alındı')}
                    className="px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(1,118,211,0.1)', color: 'var(--primary)', border: '1px solid rgba(1,118,211,0.2)' }}
                  >
                    🔍 İncelemeye Al
                  </button>
                )}
                {talep.durum === 'devam_ediyor' && (
                  <button
                    onClick={() => durumGuncelle('tamamlandi', 'Talep tamamlandı')}
                    className="px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}
                  >
                    ✅ Tamamlandı
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setSilOnayGoster(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              🗑️ Sil
            </button>
          </div>

          {/* Silme onay kutusu */}
          <AnimatePresence>
            {silOnayGoster && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="w-full mt-4 p-4 rounded-xl flex items-center justify-between gap-4 flex-wrap"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '16px' }}>⚠️</span>
                  <p style={{ fontSize: '13px', color: '#dc2626', fontWeight: 500 }}>
                    <strong>{talep.talepNo}</strong> numaralı talep kalıcı olarak silinecek. Emin misiniz?
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setSilOnayGoster(false)}
                    className="px-4 py-1.5 rounded-lg text-sm"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    İptal
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { talepSil(talep.id); navigate('/servis-talepleri') }}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}
                  >
                    Evet, Sil
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sol: Ana içerik */}
        <div className="lg:col-span-2 space-y-5">

          {/* Talep açıklaması */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              📄 Talep İçeriği
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {talep.aciklama}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4" style={{ borderTop: '1px solid rgba(1,118,211,0.08)' }}>
              {[
                { k: 'Lokasyon', v: talep.lokasyon, ikon: '📍' },
                { k: 'Cihaz/Sistem', v: talep.cihazTuru, ikon: '🖥️' },
                { k: 'İlgili Kişi', v: talep.ilgiliKisi, ikon: '👤' },
                { k: 'Telefon', v: talep.telefon, ikon: '📞' },
                { k: 'Uygun Zaman', v: talep.uygunZaman, ikon: '🕐' },
              ].filter((x) => x.v).map(({ k, v, ikon }) => (
                <div key={k}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ikon} {k}</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Yazışmalar */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(1,118,211,0.08)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>💬 Notlar & Yazışmalar</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNotTip('ic')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: notTip === 'ic' ? 'rgba(1,118,211,0.1)' : 'transparent',
                    color: notTip === 'ic' ? 'var(--primary)' : 'var(--text-muted)',
                  }}
                >
                  🔒 İç Not
                </button>
                <button
                  onClick={() => setNotTip('musteri')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: notTip === 'musteri' ? 'rgba(16,185,129,0.1)' : 'transparent',
                    color: notTip === 'musteri' ? '#10b981' : 'var(--text-muted)',
                  }}
                >
                  👤 Müşteriye
                </button>
              </div>
            </div>

            <div style={{ minHeight: '160px', maxHeight: '360px', overflowY: 'auto', padding: '16px' }}>
              {(talep.notlar || []).length === 0 ? (
                <div className="text-center py-8">
                  <p style={{ color: '#cbd5e1', fontSize: '13px' }}>Henüz not eklenmedi</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(talep.notlar || []).map((not) => {
                    const znaTeam = not.tip === 'ic'
                    const musteriNot = not.tip === 'musteri' && not.kullaniciId !== kullanici?.id
                    return (
                      <motion.div key={not.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                        <div
                          className="rounded-2xl px-4 py-3"
                          style={{
                            background: znaTeam ? 'rgba(1,118,211,0.05)' : musteriNot ? 'rgba(245,158,11,0.05)' : 'rgba(16,185,129,0.05)',
                            border: `1px solid ${znaTeam ? 'rgba(1,118,211,0.12)' : musteriNot ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.12)'}`,
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span style={{ fontSize: '12px', fontWeight: 600, color: znaTeam ? 'var(--primary)' : musteriNot ? '#f59e0b' : '#10b981' }}>
                              {znaTeam ? '🔒 İç Not · ' : musteriNot ? '👤 Müşteri · ' : '✉️ Müşteriye · '}
                              {not.kullaniciAd}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {new Date(not.tarih).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{not.metin}</p>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(1,118,211,0.08)', background: 'var(--bg-hover)' }}>
              <div
                className="text-xs px-3 py-2 rounded-lg mb-3"
                style={{
                  background: notTip === 'ic' ? 'rgba(1,118,211,0.06)' : 'rgba(16,185,129,0.06)',
                  color: notTip === 'ic' ? 'var(--primary)' : '#10b981',
                }}
              >
                {notTip === 'ic' ? '🔒 İç not — müşteri görmeyecek' : '✉️ Bu not müşteriye de görünür'}
              </div>
              <div className="flex gap-3">
                <textarea
                  value={yeniNot}
                  onChange={(e) => setYeniNot(e.target.value)}
                  placeholder="Not ekle..."
                  rows={2}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-card)' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
                />
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={notGonder}
                  disabled={!yeniNot.trim()}
                  className="px-4 rounded-xl text-sm font-medium text-white self-start mt-0 flex-shrink-0"
                  style={{
                    background: yeniNot.trim() ? 'var(--primary)' : '#e2e8f0',
                    color: yeniNot.trim() ? 'white' : 'var(--text-muted)',
                    padding: '10px 16px',
                  }}
                >
                  Ekle
                </motion.button>
              </div>
            </div>
          </div>

          {/* Durum geçmişi */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              🕐 Durum Geçmişi
            </h3>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: 'rgba(1,118,211,0.15)' }} />
              <div className="space-y-4 pl-10">
                {[...(talep.durumGecmisi || [])].reverse().map((g, i) => {
                  const d = DURUM_LISTESI.find((x) => x.id === g.durum)
                  return (
                    <div key={i} className="relative">
                      <div
                        className="absolute -left-6 w-4 h-4 rounded-full"
                        style={{ background: d?.bg, border: `2px solid ${d?.renk || 'var(--primary)'}` }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: d?.renk }}>
                        {d?.ikon} {d?.isim}
                      </span>
                      {g.aciklama && (
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{g.aciklama}</p>
                      )}
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {g.kullaniciAd} · {tarihFormat(g.tarih)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Sağ: Yönetim paneli */}
        <div className="space-y-4">

          {/* Durum değiştir */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              Durum
            </h3>
            <div className="space-y-2">
              {DURUM_LISTESI.map((d) => (
                <button
                  key={d.id}
                  onClick={() => durumGuncelle(d.id, `Durum "${d.isim}" olarak güncellendi`)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: talep.durum === d.id ? d.bg : 'var(--bg-hover)',
                    border: `1px solid ${talep.durum === d.id ? d.renk + '44' : 'rgba(1,118,211,0.08)'}`,
                    color: talep.durum === d.id ? d.renk : 'var(--text-secondary)',
                    fontWeight: talep.durum === d.id ? 600 : 400,
                  }}
                >
                  <span>{d.ikon}</span>
                  <span>{d.isim}</span>
                  {talep.durum === d.id && <span className="ml-auto text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Atama */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              Atama
            </h3>
            <CustomSelect
              value={talep.atananKullaniciId?.toString() || ''}
              onChange={(e) => atamayapGuncelle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
              style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
            >
              <option value="">— Atanmadı —</option>
              {znaKullanicilar.map((k) => (
                <option key={k.id} value={k.id?.toString()}>{k.ad}</option>
              ))}
            </CustomSelect>
            {talep.atananKullaniciAd && (
              <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(1,118,211,0.06)' }}>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: 'var(--primary)' }}
                >
                  {talep.atananKullaniciAd.charAt(0)}
                </div>
                <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 500 }}>{talep.atananKullaniciAd}</span>
              </div>
            )}
          </div>

          {/* Planlı tarih */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              Planlı Servis Tarihi
            </h3>
            <input
              type="date"
              value={talep.planliTarih ? talep.planliTarih.split('T')[0] : ''}
              onChange={(e) => planliTarihGuncelle(e.target.value || null)}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(1,118,211,0.2)')}
            />
          </div>

          {/* Müşteri Memnuniyet Değerlendirmesi */}
          {talep.durum === 'tamamlandi' && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.2)', boxShadow: '0 2px 8px rgba(245,158,11,0.06)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                ⭐ Müşteri Değerlendirmesi
              </h3>
              {mevcutDeg ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {[1,2,3,4,5].map(i => (
                      <span key={i} style={{ fontSize: '22px', color: i <= mevcutDeg.puan ? '#f59e0b' : '#e2e8f0' }}>★</span>
                    ))}
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b', marginLeft: '4px' }}>
                      {mevcutDeg.puan}/5
                    </span>
                  </div>
                  {mevcutDeg.yorum && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '8px' }}>
                      "{mevcutDeg.yorum}"
                    </p>
                  )}
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(mevcutDeg.tarih).toLocaleDateString('tr-TR')} · {mevcutDeg.kaydeden}
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Müşterinin hizmet memnuniyetini kaydedin
                  </p>
                  {/* Yıldız seçici */}
                  <div className="flex gap-1 mb-3">
                    {[1,2,3,4,5].map(i => (
                      <button key={i}
                        onClick={() => setDegPuan(i)}
                        onMouseEnter={() => setDegHover(i)}
                        onMouseLeave={() => setDegHover(0)}
                        style={{
                          fontSize: '28px',
                          color: i <= (degHover || degPuan) ? '#f59e0b' : '#e2e8f0',
                          transition: 'color 0.1s, transform 0.1s',
                          transform: i <= (degHover || degPuan) ? 'scale(1.15)' : 'scale(1)',
                          background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                        }}>
                        ★
                      </button>
                    ))}
                  </div>
                  {degPuan > 0 && (
                    <p className="text-xs mb-2" style={{ color: degPuan >= 4 ? '#10b981' : degPuan === 3 ? '#f59e0b' : '#ef4444' }}>
                      {['','Çok Kötü','Kötü','Orta','İyi','Mükemmel'][degPuan]}
                    </p>
                  )}
                  <textarea
                    value={degYorum}
                    onChange={e => setDegYorum(e.target.value)}
                    placeholder="Yorum (isteğe bağlı)..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl text-xs resize-none outline-none mb-3"
                    style={{ border: '1px solid rgba(1,118,211,0.2)', background: 'var(--bg-hover)' }}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(1,118,211,0.2)'}
                  />
                  <button
                    onClick={degerlendirmeKaydet}
                    disabled={!degPuan}
                    className="w-full py-2 rounded-xl text-sm font-semibold text-white transition"
                    style={{
                      background: degPuan ? 'linear-gradient(135deg,#f59e0b,#f97316)' : '#e2e8f0',
                      color: degPuan ? 'white' : 'var(--text-muted)',
                      boxShadow: degPuan ? '0 4px 12px rgba(245,158,11,0.3)' : 'none',
                    }}>
                    ⭐ Değerlendirmeyi Kaydet
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Talep özeti */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid rgba(1,118,211,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              Müşteri Bilgisi
            </h3>
            <div className="space-y-2">
              {[
                { k: 'Müşteri', v: talep.musteriAd },
                talep.firmaAdi && { k: 'Firma', v: talep.firmaAdi },
                { k: 'İlgili Kişi', v: talep.ilgiliKisi },
                talep.telefon && { k: 'Telefon', v: talep.telefon },
                talep.uygunZaman && { k: 'Uygun Zaman', v: talep.uygunZaman },
              ].filter(Boolean).map(({ k, v }) => (
                <div key={k}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{k}</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
