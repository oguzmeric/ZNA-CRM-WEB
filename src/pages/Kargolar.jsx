import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import { useKargo, KARGO_FIRMALARI, DURUM_LISTESI } from '../context/KargoContext'
import CustomSelect from '../components/CustomSelect'

const bosForm = {
  tip: 'giden',
  kargoFirmasi: '',
  takipNo: '',
  gonderenAd: '',
  gonderenFirma: '',
  gonderenAdres: '',
  gonderenTelefon: '',
  aliciAd: '',
  aliciFirma: '',
  aliciAdres: '',
  aliciTelefon: '',
  icerik: '',
  agirlik: '',
  desi: '',
  ucret: '',
  odemeYontemi: 'gonderici',
  tahminiTeslim: '',
  ilgiliKullaniciIds: [],
  ilgiliModul: null,
}

export default function Kargolar() {
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()
  const { kargolar, kargoOlustur, KARGO_FIRMALARI: firmalar, DURUM_LISTESI: durumlar } = useKargo()

  const [formAcik, setFormAcik] = useState(false)
  const [form, setForm] = useState({ ...bosForm })
  const [adim, setAdim] = useState(1) // 1=temel, 2=taraf bilgileri, 3=detay+bildirim
  const [aramaMetni, setAramaMetni] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('hepsi')
  const [tipFiltre, setTipFiltre] = useState('hepsi')
  const [silOnayId, setSilOnayId] = useState(null)

  const { kargoSil } = useKargo()

  const znaKullanicilar = kullanicilar.filter((k) => k.tip !== 'musteri')

  // Kargo oluştururken form varsayılanlarını hazırla
  const yeniKargoAc = () => {
    const varsayilan = { ...bosForm }
    if (kullanici) {
      if (varsayilan.tip === 'giden') {
        varsayilan.gonderenFirma = 'ZNA Teknoloji'
        varsayilan.gonderenAd = kullanici.ad
      }
      if (!varsayilan.ilgiliKullaniciIds.includes(kullanici.id.toString())) {
        varsayilan.ilgiliKullaniciIds = [kullanici.id.toString()]
      }
    }
    setForm(varsayilan)
    setAdim(1)
    setFormAcik(true)
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  const handleTipDegis = (tip) => {
    const guncellenmis = { ...form, tip }
    if (tip === 'giden') {
      guncellenmis.gonderenFirma = 'ZNA Teknoloji'
      guncellenmis.gonderenAd = kullanici?.ad || ''
    } else {
      if (guncellenmis.gonderenFirma === 'ZNA Teknoloji') {
        guncellenmis.gonderenFirma = ''
        guncellenmis.gonderenAd = ''
      }
    }
    setForm(guncellenmis)
  }

  const ilgiliToggle = (userId) => {
    const id = userId.toString()
    setForm((prev) => ({
      ...prev,
      ilgiliKullaniciIds: prev.ilgiliKullaniciIds.includes(id)
        ? prev.ilgiliKullaniciIds.filter((x) => x !== id)
        : [...prev.ilgiliKullaniciIds, id],
    }))
  }

  const adimGecerli = () => {
    if (adim === 1) return form.kargoFirmasi !== ''
    if (adim === 2) return (form.aliciAd || form.aliciFirma) && (form.gonderenAd || form.gonderenFirma)
    return true
  }

  const kaydet = async () => {
    if (!form.kargoFirmasi) { alert('Kargo firması seçiniz!'); return }
    if (!form.icerik) { alert('Gönderi içeriğini belirtiniz!'); return }

    const yeniKargo = await kargoOlustur(form, kullanici)
    if (!yeniKargo) { alert('Kargo kaydedilemedi, tekrar deneyin.'); return }

    // İlgili kişilere bildirim gönder (oluşturan hariç)
    form.ilgiliKullaniciIds
      .filter((id) => id !== kullanici.id.toString())
      .forEach((id) => {
        const firma = firmalar.find((f) => f.id === form.kargoFirmasi)
        const taraf = form.tip === 'giden'
          ? `→ ${form.aliciFirma || form.aliciAd}`
          : `← ${form.gonderenFirma || form.gonderenAd}`
        bildirimEkle(
          id,
          'Yeni Kargo Kaydı',
          `${yeniKargo.kargoNo} — ${firma?.isim} ${taraf}. İçerik: ${form.icerik}`,
          'bilgi',
          `/kargolar/${yeniKargo.id}`
        )
      })

    setFormAcik(false)
    setForm({ ...bosForm })
    setAdim(1)
    navigate(`/kargolar/${yeniKargo.id}`)
  }

  const filtreliKargolar = kargolar
    .filter((k) => durumFiltre === 'hepsi' || k.durum === durumFiltre)
    .filter((k) => tipFiltre === 'hepsi' || k.tip === tipFiltre)
    .filter((k) => {
      if (!aramaMetni) return true
      const q = aramaMetni.toLowerCase()
      return (
        k.kargoNo?.toLowerCase().includes(q) ||
        k.alici?.ad?.toLowerCase().includes(q) ||
        k.alici?.firma?.toLowerCase().includes(q) ||
        k.gonderen?.ad?.toLowerCase().includes(q) ||
        k.gonderen?.firma?.toLowerCase().includes(q) ||
        k.takipNo?.toLowerCase().includes(q) ||
        k.icerik?.toLowerCase().includes(q)
      )
    })

  const istatistik = {
    toplam:   kargolar.length,
    aktif:    kargolar.filter((k) => !['teslim_edildi','iade'].includes(k.durum)).length,
    teslim:   kargolar.filter((k) => k.durum === 'teslim_edildi').length,
    iade:     kargolar.filter((k) => k.durum === 'iade').length,
    dagitimda:kargolar.filter((k) => k.durum === 'dagitimda').length,
  }

  return (
    <div className="p-6">

      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Kargo Takip</h2>
          <p className="text-sm text-gray-400 mt-0.5">{kargolar.length} kayıt · {istatistik.aktif} aktif</p>
        </div>
        <button
          onClick={yeniKargoAc}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-1.5"
        >
          + Yeni Kargo
        </button>
      </div>

      {/* İstatistik kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { etiket: 'Toplam', sayi: istatistik.toplam, renk: '#0176D3', bg: 'rgba(1,118,211,0.08)' },
          { etiket: 'Aktif', sayi: istatistik.aktif, renk: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
          { etiket: 'Dağıtımda', sayi: istatistik.dagitimda, renk: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
          { etiket: 'Teslim Edildi', sayi: istatistik.teslim, renk: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { etiket: 'İade', sayi: istatistik.iade, renk: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
        ].map((s) => (
          <div key={s.etiket} className="rounded-xl p-4 text-center" style={{ background: s.bg, border: `1px solid ${s.renk}25` }}>
            <p className="text-2xl font-bold" style={{ color: s.renk }}>{s.sayi}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.etiket}</p>
          </div>
        ))}
      </div>

      {/* Yeni Kargo Formu */}
      {formAcik && (
        <div className="rounded-2xl p-6 mb-6" style={{
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid rgba(1,118,211,0.2)',
          boxShadow: '0 8px 32px rgba(1,118,211,0.12)',
        }}>
          {/* Form başlık + adım göstergesi */}
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-800">Yeni Kargo Kaydı</h3>
            <div className="flex items-center gap-1">
              {[1, 2, 3].map((a) => (
                <div key={a} className="flex items-center gap-1">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: adim >= a ? 'var(--primary)' : '#f1f5f9',
                      color: adim >= a ? 'white' : '#9ca3af',
                    }}
                  >{a}</div>
                  {a < 3 && <div className="w-6 h-0.5" style={{ background: adim > a ? 'var(--primary)' : '#e5e7eb' }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Adım 1: Temel Bilgiler */}
          {adim === 1 && (
            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-4">Temel Bilgiler</p>

              {/* Giden / Gelen toggle */}
              <div className="mb-5">
                <label className="text-sm text-gray-600 mb-2 block">Kargo Tipi *</label>
                <div className="flex gap-3">
                  {[
                    { id: 'giden', isim: 'Giden Kargo', aciklama: 'ZNA\'dan gönderilen', ikon: '📤' },
                    { id: 'gelen', isim: 'Gelen Kargo', aciklama: 'ZNA\'ya gelen', ikon: '📥' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTipDegis(t.id)}
                      className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition text-left"
                      style={{
                        borderColor: form.tip === t.id ? 'var(--primary)' : '#e5e7eb',
                        background: form.tip === t.id ? 'rgba(1,118,211,0.06)' : 'var(--bg-card)',
                      }}
                    >
                      <span className="text-2xl">{t.ikon}</span>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: form.tip === t.id ? 'var(--primary)' : 'var(--text-secondary)' }}>{t.isim}</p>
                        <p className="text-xs text-gray-400">{t.aciklama}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Kargo Firması */}
              <div className="mb-5">
                <label className="text-sm text-gray-600 mb-2 block">Kargo Firması *</label>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {firmalar.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setForm({ ...form, kargoFirmasi: f.id })}
                      className="px-3 py-2.5 rounded-xl text-xs font-semibold border-2 transition"
                      style={{
                        borderColor: form.kargoFirmasi === f.id ? f.renk : '#e5e7eb',
                        background: form.kargoFirmasi === f.id ? f.bg : 'var(--bg-card)',
                        color: form.kargoFirmasi === f.id ? f.renk : 'var(--text-muted)',
                      }}
                    >{f.isim}</button>
                  ))}
                </div>
              </div>

              {/* Takip No */}
              <div className="mb-5">
                <label className="text-sm text-gray-600 mb-1 block">Takip Numarası</label>
                <input
                  type="text"
                  value={form.takipNo}
                  onChange={(e) => setForm({ ...form, takipNo: e.target.value })}
                  className="premium-input max-w-xs"
                  placeholder="Kargo takip numarası (opsiyonel)"
                />
              </div>
            </div>
          )}

          {/* Adım 2: Taraf Bilgileri */}
          {adim === 2 && (
            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-4">Gönderen & Alıcı Bilgileri</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Gönderen */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>📤</span> Gönderen
                  </p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Ad Soyad</label>
                      <input type="text" value={form.gonderenAd} onChange={(e) => setForm({...form, gonderenAd: e.target.value})} className="premium-input" placeholder="Ad Soyad" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Firma</label>
                      <input type="text" value={form.gonderenFirma} onChange={(e) => setForm({...form, gonderenFirma: e.target.value})} className="premium-input" placeholder="Firma adı" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Telefon</label>
                      <input type="text" value={form.gonderenTelefon} onChange={(e) => setForm({...form, gonderenTelefon: e.target.value})} className="premium-input" placeholder="0532 000 00 00" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Adres</label>
                      <textarea value={form.gonderenAdres} onChange={(e) => setForm({...form, gonderenAdres: e.target.value})} className="premium-input" rows={2} placeholder="Gönderim adresi" />
                    </div>
                  </div>
                </div>

                {/* Alıcı */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>📥</span> Alıcı
                  </p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Ad Soyad</label>
                      <input type="text" value={form.aliciAd} onChange={(e) => setForm({...form, aliciAd: e.target.value})} className="premium-input" placeholder="Ad Soyad" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Firma</label>
                      <input type="text" value={form.aliciFirma} onChange={(e) => setForm({...form, aliciFirma: e.target.value})} className="premium-input" placeholder="Firma adı" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Telefon</label>
                      <input type="text" value={form.aliciTelefon} onChange={(e) => setForm({...form, aliciTelefon: e.target.value})} className="premium-input" placeholder="0532 000 00 00" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Adres</label>
                      <textarea value={form.aliciAdres} onChange={(e) => setForm({...form, aliciAdres: e.target.value})} className="premium-input" rows={2} placeholder="Teslimat adresi" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Adım 3: Detaylar + Bildirimler */}
          {adim === 3 && (
            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-4">Gönderi Detayları & Bildirimler</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600 mb-1 block">Gönderi İçeriği / Açıklama *</label>
                  <textarea
                    value={form.icerik}
                    onChange={(e) => setForm({ ...form, icerik: e.target.value })}
                    className="premium-input"
                    rows={3}
                    placeholder="Gönderilen ürün/doküman açıklaması..."
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Ağırlık (kg)</label>
                  <input type="number" value={form.agirlik} onChange={(e) => setForm({...form, agirlik: e.target.value})} className="premium-input" placeholder="0.00" step="0.1" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Desi</label>
                  <input type="number" value={form.desi} onChange={(e) => setForm({...form, desi: e.target.value})} className="premium-input" placeholder="0" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Kargo Ücreti (₺)</label>
                  <input type="number" value={form.ucret} onChange={(e) => setForm({...form, ucret: e.target.value})} className="premium-input" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Ödeme Yöntemi</label>
                  <CustomSelect value={form.odemeYontemi} onChange={(e) => setForm({...form, odemeYontemi: e.target.value})} className="premium-input">
                    <option value="gonderici">Gönderici Öder</option>
                    <option value="alici">Alıcı Öder</option>
                    <option value="kapida">Kapıda Ödeme</option>
                  </CustomSelect>
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Tahmini Teslimat</label>
                  <input type="date" value={form.tahminiTeslim} onChange={(e) => setForm({...form, tahminiTeslim: e.target.value})} className="premium-input" />
                </div>
              </div>

              {/* Bildirim alacak kişiler */}
              <div>
                <label className="text-sm text-gray-600 mb-2 block">
                  Bildirim Alacak Personel
                  <span className="text-xs text-gray-400 ml-2">(durum değişikliklerinde bildirim gönderilir)</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {znaKullanicilar.map((k) => {
                    const secili = form.ilgiliKullaniciIds.includes(k.id?.toString())
                    return (
                      <button
                        key={k.id}
                        onClick={() => ilgiliToggle(k.id)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition text-left"
                        style={{
                          borderColor: secili ? 'var(--primary)' : '#e5e7eb',
                          background: secili ? 'rgba(1,118,211,0.07)' : 'var(--bg-card)',
                        }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: 'var(--primary)' }}
                        >
                          {k.ad?.charAt(0) || "?"}
                        </div>
                        <span className="text-sm truncate" style={{ color: secili ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: secili ? 600 : 400 }}>
                          {k.ad}
                        </span>
                        {secili && <span className="ml-auto text-indigo-500 text-xs">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Form butonlar */}
          <div className="flex gap-3 mt-6 pt-5" style={{ borderTop: '1px solid rgba(1,118,211,0.1)' }}>
            {adim > 1 && (
              <button
                onClick={() => setAdim(adim - 1)}
                className="px-5 py-2 rounded-xl border text-sm text-gray-600 hover:bg-gray-50 transition"
                style={{ border: '1px solid #e5e7eb' }}
              >
                ← Geri
              </button>
            )}
            {adim < 3 ? (
              <button
                onClick={() => adimGecerli() && setAdim(adim + 1)}
                className="px-6 py-2 rounded-xl text-sm text-white font-medium transition"
                style={{
                  background: adimGecerli() ? 'var(--primary)' : '#d1d5db',
                  cursor: adimGecerli() ? 'pointer' : 'not-allowed',
                }}
              >
                Devam →
              </button>
            ) : (
              <button
                onClick={kaydet}
                className="px-6 py-2 rounded-xl text-sm text-white font-medium transition"
                style={{ background: 'var(--primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
              >
                Kargoyu Kaydet
              </button>
            )}
            <button
              onClick={() => { setFormAcik(false); setAdim(1) }}
              className="px-5 py-2 rounded-xl border text-sm text-gray-500 hover:bg-gray-50 transition"
              style={{ border: '1px solid #e5e7eb' }}
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Filtreler */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input
          type="text"
          value={aramaMetni}
          onChange={(e) => setAramaMetni(e.target.value)}
          placeholder="Kargo no, alıcı, takip no, içerik ara..."
          className="flex-1 min-w-48 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <CustomSelect
          value={tipFiltre}
          onChange={(e) => setTipFiltre(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="hepsi">Tüm Tipler</option>
          <option value="giden">Giden</option>
          <option value="gelen">Gelen</option>
        </CustomSelect>
        <CustomSelect
          value={durumFiltre}
          onChange={(e) => setDurumFiltre(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="hepsi">Tüm Durumlar</option>
          {durumlar.map((d) => (
            <option key={d.id} value={d.id}>{d.ikon} {d.isim}</option>
          ))}
        </CustomSelect>
      </div>

      {/* Kargo Listesi */}
      <div className="flex flex-col gap-3">
        {filtreliKargolar.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">{aramaMetni || durumFiltre !== 'hepsi' ? 'Arama sonucu bulunamadı' : 'Henüz kargo kaydı eklenmedi'}</p>
          </div>
        )}

        {filtreliKargolar.map((kargo) => {
          const durum = durumlar.find((d) => d.id === kargo.durum)
          const firma = KARGO_FIRMALARI.find((f) => f.id === kargo.kargoFirmasi)
          const gecikti = kargo.tahminiTeslim && new Date(kargo.tahminiTeslim) < new Date() && !['teslim_edildi','iade'].includes(kargo.durum)

          return (
            <div key={kargo.id}>
              <div
                onClick={() => navigate(`/kargolar/${kargo.id}`)}
                className="rounded-2xl px-5 py-4 cursor-pointer transition-all hover-lift flex items-center gap-4"
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  border: gecikti ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(1,118,211,0.1)',
                  boxShadow: '0 2px 8px rgba(1,118,211,0.06)',
                }}
              >
                {/* Tip ikon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: kargo.tip === 'giden' ? 'rgba(1,118,211,0.1)' : 'rgba(16,185,129,0.1)' }}
                >
                  {kargo.tip === 'giden' ? '📤' : '📥'}
                </div>

                {/* Ana bilgi */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-gray-400">{kargo.kargoNo}</span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: firma?.bg || '#f1f5f9', color: firma?.renk || '#6b7280' }}
                    >
                      {firma?.isim || kargo.kargoFirmasi}
                    </span>
                    {kargo.takipNo && (
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{kargo.takipNo}</span>
                    )}
                    {gecikti && (
                      <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">⚠️ Gecikti</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {kargo.gonderen?.firma || kargo.gonderen?.ad || '?'}
                    <span className="text-gray-300 mx-2">→</span>
                    {kargo.alici?.firma || kargo.alici?.ad || '?'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{kargo.icerik}</p>
                </div>

                {/* Meta */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0 text-right">
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: durum?.bg, color: durum?.renk }}
                  >
                    {durum?.ikon} {durum?.isim}
                  </span>
                  <span className="text-xs text-gray-400">
                    {kargo.tahminiTeslim ? `Tah. ${kargo.tahminiTeslim}` : new Date(kargo.olusturmaTarihi).toLocaleDateString('tr-TR')}
                  </span>
                </div>
              </div>

              {/* Sil onayı */}
              {silOnayId === kargo.id && (
                <div className="mx-2 px-4 py-3 rounded-b-xl flex items-center gap-3 bg-red-50 border border-red-100 border-t-0 text-sm">
                  <span className="text-red-700 flex-1">Bu kargoyu silmek istediğinize emin misiniz?</span>
                  <button onClick={() => { kargoSil(kargo.id); setSilOnayId(null) }} className="text-red-600 font-semibold hover:text-red-800 px-3 py-1 border border-red-200 rounded-lg">Evet, Sil</button>
                  <button onClick={() => setSilOnayId(null)} className="text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-200 rounded-lg">İptal</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
