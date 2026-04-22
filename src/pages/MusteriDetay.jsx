import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { musteriGetir, musteriGuncelle, musterileriGetir } from '../services/musteriService'
import CustomSelect from '../components/CustomSelect'
import { musteriKisileriniGetir, musteriKisiEkle, musteriKisiGuncelle, musteriKisiSil } from '../services/musteriKisiService'
import { musteriLokasyonlariniGetir, musteriLokasyonEkle, musteriLokasyonGuncelle, musteriLokasyonSil } from '../services/musteriLokasyonService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import { gorevleriGetir } from '../services/gorevService'

const durumRenkMap = {
  aktif: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', isim: 'Aktif' },
  lead:  { bg: 'rgba(1,118,211,0.1)',   color: '#0176D3', isim: 'Lead' },
  pasif: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', isim: 'Pasif' },
  kayip: { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', isim: 'Kayıp' },
}

const bosKisi  = { ad: '', soyad: '', unvan: '', telefon: '', email: '', anaKisi: false }
const bosLok   = { ad: '', adres: '', notlar: '', aktif: true }

function MusteriDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const lokasyonBolumRef = useRef(null)

  // Yeni müşteri oluşturulduktan hemen sonra mı gelindi?
  const yeniOlusturuldu = location.state?.yeniMusteri === true

  const [musteri, setMusteri]       = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [aktifSekme, setAktifSekme] = useState('hepsi')

  // İlgili kişiler (musteri_kisiler tablosu)
  const [kisiler, setKisiler]             = useState([])
  const [kisiForm, setKisiForm]           = useState(null)
  const [kisiKaydediliyor, setKisiKaydediliyor] = useState(false)

  // Firma düzenleme
  const [duzenleForm, setDuzenleForm] = useState(null)
  const [duzenleKaydediliyor, setDuzenleKaydediliyor] = useState(false)

  // Alt lokasyonlar (musteri_lokasyonlari tablosu)
  const [lokasyonlar, setLokasyonlar]         = useState([])
  const [lokasyonForm, setLokasyonForm]       = useState(null)
  const [lokKaydediliyor, setLokKaydediliyor] = useState(false)

  // Supabase aktivite verileri
  const [gorusmeler, setGorusmeler] = useState([])
  const [teklifler, setTeklifler]   = useState([])
  const [satislar, setSatislar]     = useState([])
  const [gorevler, setGorevler]     = useState([])

  useEffect(() => {
    const yukle = async () => {
      const musteriIdNum = Number(id)
      const [m, k, l, g, t, s, gv] = await Promise.all([
        musteriGetir(musteriIdNum),
        musteriKisileriniGetir(musteriIdNum),
        musteriLokasyonlariniGetir(musteriIdNum),
        gorusmeleriGetir(),
        teklifleriGetir(),
        satislariGetir(),
        gorevleriGetir(),
      ])
      setMusteri(m)
      setKisiler(k)
      setLokasyonlar(l)
      if (m?.firma) {
        const firma = m.firma.toLowerCase().trim()
        setGorusmeler((g || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
        setTeklifler((t || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
        setSatislar((s || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
        setGorevler((gv || []).filter(x => x.firmaAdi?.toLowerCase().trim() === firma))
      }
      setYukleniyor(false)
      // Yeni müşteri oluşturulduysa kişi formunu hemen aç ve lokasyon bölümüne scroll et
      if (yeniOlusturuldu) {
        setKisiForm({ ...bosKisi })
        setTimeout(() => lokasyonBolumRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
      }
    }
    yukle()
  }, [id])

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  if (!musteri) return (
    <div className="p-6 text-center text-gray-400">
      <p className="text-4xl mb-3">🏢</p>
      <p>Müşteri bulunamadı</p>
      <button onClick={() => navigate('/musteriler')} className="mt-4 text-blue-500 text-sm">← Müşterilere dön</button>
    </div>
  )

  const dr = durumRenkMap[musteri.durum] || durumRenkMap.aktif

  // ── İlgili Kişi CRUD ──────────────────────────────────────────
  const kisiKaydet = async () => {
    if (!kisiForm.ad?.trim()) { toast.error('Ad zorunludur.'); return }
    setKisiKaydediliyor(true)
    try {
      if (kisiForm.id) {
        const guncellendi = await musteriKisiGuncelle(kisiForm.id, kisiForm)
        setKisiler(prev => prev.map(k => k.id === kisiForm.id ? guncellendi : (kisiForm.anaKisi ? { ...k, anaKisi: false } : k)))
        toast.success('Kişi güncellendi.')
      } else {
        const yeni = await musteriKisiEkle({ ...kisiForm, musteriId: Number(id) })
        setKisiler(prev => [
          ...(kisiForm.anaKisi ? prev.map(k => ({ ...k, anaKisi: false })) : prev),
          yeni,
        ])
        toast.success('Kişi eklendi.')
      }
      setKisiForm(null)
    } catch {
      toast.error('Kaydedilemedi.')
    } finally {
      setKisiKaydediliyor(false)
    }
  }

  const kisiSil = async (kisiId) => {
    const onay = await confirm({
      baslik: 'Kişiyi Sil',
      mesaj: 'Bu ilgili kişi silinecek. Emin misiniz?',
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await musteriKisiSil(kisiId)
    setKisiler(prev => prev.filter(k => k.id !== kisiId))
    toast.success('Kişi silindi.')
  }

  // ── Alt Lokasyon CRUD ──────────────────────────────────────────
  const lokasyonKaydet = async () => {
    if (!lokasyonForm.ad?.trim()) { toast.error('Lokasyon adı zorunludur.'); return }
    setLokKaydediliyor(true)
    try {
      if (lokasyonForm.id) {
        const guncellendi = await musteriLokasyonGuncelle(lokasyonForm.id, lokasyonForm)
        setLokasyonlar(prev => prev.map(l => l.id === lokasyonForm.id ? guncellendi : l))
        toast.success('Lokasyon güncellendi.')
      } else {
        const yeni = await musteriLokasyonEkle({ ...lokasyonForm, musteriId: Number(id) })
        setLokasyonlar(prev => [...prev, yeni])
        toast.success('Lokasyon eklendi.')
      }
      setLokasyonForm(null)
    } catch {
      toast.error('Kaydedilemedi.')
    } finally {
      setLokKaydediliyor(false)
    }
  }

  const lokasyonSil = async (lokId) => {
    const onay = await confirm({
      baslik: 'Lokasyonu Sil',
      mesaj: 'Bu lokasyon silinecek. Emin misiniz?',
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await musteriLokasyonSil(lokId)
    setLokasyonlar(prev => prev.filter(l => l.id !== lokId))
    toast.success('Lokasyon silindi.')
  }

  // ── Firma Bilgileri Düzenleme ──────────────────────────────────
  const duzenleBaslat = () => {
    setDuzenleForm({
      firma: musteri.firma || '',
      kod: musteri.kod || '',
      sehir: musteri.sehir || '',
      vergiNo: musteri.vergiNo || '',
      telefon: musteri.telefon || '',
      email: musteri.email || '',
      durum: musteri.durum || 'aktif',
      notlar: musteri.notlar || '',
    })
  }

  const duzenleKaydet = async () => {
    if (!duzenleForm.firma?.trim()) { toast.error('Firma adı zorunludur.'); return }
    if (!duzenleForm.kod?.trim()) { toast.error('Müşteri kodu zorunludur.'); return }

    setDuzenleKaydediliyor(true)
    try {
      // Kod değiştirilmişse benzersizlik kontrolü
      if (duzenleForm.kod.trim() !== musteri.kod) {
        const tumMusteriler = await musterileriGetir()
        const cakisma = (tumMusteriler || []).find(
          m => m.kod === duzenleForm.kod.trim() && m.id !== Number(id)
        )
        if (cakisma) {
          toast.error(`Bu kod zaten kullanılıyor: ${cakisma.firma}`)
          setDuzenleKaydediliyor(false)
          return
        }
      }

      const guncellendi = await musteriGuncelle(Number(id), {
        ...duzenleForm,
        kod: duzenleForm.kod.trim(),
        firma: duzenleForm.firma.trim(),
      })
      if (guncellendi) {
        setMusteri(prev => ({ ...prev, ...guncellendi }))
        setDuzenleForm(null)
        toast.success('Firma bilgileri güncellendi.')
      } else {
        toast.error('Güncellenemedi.')
      }
    } catch (e) {
      console.error('duzenleKaydet hata:', e)
      toast.error(e?.message || 'Güncellenemedi.')
    } finally {
      setDuzenleKaydediliyor(false)
    }
  }

  // ── Finansal özet ─────────────────────────────────────────────
  const toplam  = satislar.reduce((s, f) => s + (f.genelToplam || 0), 0)
  const tahsil  = satislar.reduce((s, f) => s + (f.odenenToplam || 0), 0)
  const kalan   = toplam - tahsil
  const bugun   = new Date(); bugun.setHours(0,0,0,0)
  const geciken = satislar
    .filter(f => f.durum === 'gonderildi' && f.vadeTarihi && new Date(f.vadeTarihi) < bugun)
    .reduce((s, f) => s + ((f.genelToplam||0) - (f.odenenToplam||0)), 0)
  const fmt = n => (n||0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

  // ── Timeline ──────────────────────────────────────────────────
  const tumOlaylar = [
    ...gorusmeler.map(g => ({
      id: `g-${g.id}`, tip: 'gorusme', tarih: g.tarih,
      baslik: g.konu, detay: `Görüşen: ${g.gorusen || '—'}`,
      ikon: '📞', renk: '#3b82f6', hedef: `/gorusmeler/${g.id}`,
    })),
    ...teklifler.map(t => ({
      id: `t-${t.id}`, tip: 'teklif', tarih: t.tarih,
      baslik: t.konu || t.teklifNo,
      detay: `${t.teklifNo} · ${fmt(t.genelToplam)} ₺`,
      ikon: '📋', renk: '#0176D3', hedef: `/teklifler/${t.id}`,
    })),
    ...satislar.map(s => ({
      id: `s-${s.id}`, tip: 'fatura', tarih: s.faturaTarihi,
      baslik: s.faturaNo, detay: `${fmt(s.genelToplam)} ₺`,
      ikon: '🧾', renk: '#10b981', hedef: `/satislar/${s.id}`,
    })),
    ...gorevler.map(g => ({
      id: `gv-${g.id}`, tip: 'gorev', tarih: g.olusturmaTarih?.split('T')[0] || '',
      baslik: g.baslik, detay: g.aciklama || '—',
      ikon: '✅', renk: '#f59e0b', hedef: `/gorevler/${g.id}`,
    })),
  ].sort((a, b) => new Date(b.tarih) - new Date(a.tarih))

  const filtreliOlaylar = aktifSekme === 'hepsi'
    ? tumOlaylar
    : tumOlaylar.filter(o => o.tip === aktifSekme)

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Geri */}
      <button
        onClick={() => navigate('/musteriler')}
        className="text-sm text-gray-400 hover:text-blue-600 mb-6 flex items-center gap-1 transition"
      >
        ← Müşterilere Dön
      </button>

      {/* ── Yeni Müşteri Banner ── */}
      {yeniOlusturuldu && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-3">
          <span className="text-xl">🎉</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">Müşteri oluşturuldu!</p>
            <p className="text-xs text-green-600 mt-0.5">Aşağıdan ilgili kişiler ve alt lokasyonlar ekleyebilirsiniz. Bunlar mobil uygulamada da görünecek.</p>
          </div>
        </div>
      )}

      {/* ── Ana Başlık Kartı ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <div className="h-1.5" style={{ background: 'var(--primary)' }} />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                style={{ background: 'var(--primary)' }}
              >
                🏢
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{musteri.firma || '—'}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ background: dr.bg, color: dr.color }}>
                    {dr.isim}
                  </span>
                  {musteri.kod && (
                    <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {musteri.kod}
                    </span>
                  )}
                  {musteri.sehir && (
                    <span className="text-xs text-gray-400">📍 {musteri.sehir}</span>
                  )}
                  {musteri.vergiNo && (
                    <span className="text-xs text-gray-400">VKN: {musteri.vergiNo}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={duzenleBaslat}
                className="text-sm px-4 py-2 rounded-xl text-white transition font-medium"
                style={{ background: 'var(--primary)' }}
              >
                ✏️ Düzenle
              </button>
              <button
                onClick={() => navigate(`/firma-gecmisi/${encodeURIComponent(musteri.firma)}`)}
                className="text-sm px-4 py-2 rounded-xl border transition font-medium"
                style={{ color: 'var(--primary)', borderColor: 'rgba(1,118,211,0.3)' }}
              >
                📋 Firma Geçmişi
              </button>
            </div>
          </div>
          {musteri.notlar && !duzenleForm && (
            <div className="mt-4 px-4 py-3 rounded-xl text-sm text-gray-600 bg-blue-50 border border-blue-100 whitespace-pre-wrap">
              📝 {musteri.notlar}
            </div>
          )}

          {/* ── Firma Bilgileri Düzenleme Formu ── */}
          {duzenleForm && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
                Firma Bilgilerini Düzenle
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Firma Adı *</label>
                  <input
                    type="text"
                    value={duzenleForm.firma}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, firma: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Müşteri Kodu *</label>
                  <input
                    type="text"
                    value={duzenleForm.kod}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, kod: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="BAS-0001"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Durum</label>
                  <CustomSelect
                    value={duzenleForm.durum}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, durum: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="lead">Lead</option>
                    <option value="pasif">Pasif</option>
                    <option value="kayip">Kayıp</option>
                  </CustomSelect>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Telefon</label>
                  <input
                    type="text"
                    value={duzenleForm.telefon}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, telefon: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">E-posta</label>
                  <input
                    type="email"
                    value={duzenleForm.email}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Şehir / İlçe</label>
                  <input
                    type="text"
                    value={duzenleForm.sehir}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, sehir: e.target.value }))}
                    placeholder="İstanbul · Başakşehir"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Vergi No</label>
                  <input
                    type="text"
                    value={duzenleForm.vergiNo}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, vergiNo: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Notlar</label>
                  <textarea
                    value={duzenleForm.notlar}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, notlar: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Adres, müşteri notları..."
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={duzenleKaydet}
                  disabled={duzenleKaydediliyor}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition"
                  style={{ background: 'var(--primary)', opacity: duzenleKaydediliyor ? 0.7 : 1 }}
                >
                  {duzenleKaydediliyor ? 'Kaydediliyor...' : '💾 Kaydet'}
                </button>
                <button
                  onClick={() => setDuzenleForm(null)}
                  className="px-4 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                >
                  İptal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── İlgili Kişiler ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            👥 İlgili Kişiler
            <span className="ml-2 text-xs font-normal text-gray-400">({kisiler.length})</span>
          </h3>
          {!kisiForm && (
            <button
              onClick={() => setKisiForm({ ...bosKisi })}
              className="text-xs px-3 py-1.5 rounded-lg text-white font-medium transition"
              style={{ background: 'var(--primary)' }}
            >
              + Kişi Ekle
            </button>
          )}
        </div>

        {/* Kişi formu */}
        {kisiForm && (
          <div className="px-5 py-4 border-b border-gray-100 bg-blue-50">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">
              {kisiForm.id ? 'Kişiyi Düzenle' : 'Yeni Kişi Ekle'}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              {[
                { key: 'ad',      label: 'Ad *',    placeholder: 'Ad' },
                { key: 'soyad',   label: 'Soyad',   placeholder: 'Soyad' },
                { key: 'unvan',   label: 'Unvan',   placeholder: 'Satın Alma Müdürü' },
                { key: 'telefon', label: 'Telefon', placeholder: '0532 000 00 00' },
                { key: 'email',   label: 'E-Posta', placeholder: 'kisi@firma.com' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <input
                    type="text"
                    value={kisiForm[key]}
                    onChange={e => setKisiForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={kisiForm.anaKisi}
                    onChange={e => setKisiForm(prev => ({ ...prev, anaKisi: e.target.checked }))}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="text-xs text-gray-600 font-medium">⭐ Ana Kişi</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={kisiKaydet}
                disabled={kisiKaydediliyor}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition"
                style={{ background: 'var(--primary)', opacity: kisiKaydediliyor ? 0.7 : 1 }}
              >
                {kisiKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button
                onClick={() => setKisiForm(null)}
                className="px-4 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {/* Kişi listesi */}
        {kisiler.length === 0 && !kisiForm ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            Henüz ilgili kişi eklenmedi.
            <br />
            <button
              onClick={() => setKisiForm({ ...bosKisi })}
              className="mt-2 text-blue-500 hover:underline text-xs"
            >
              + İlk kişiyi ekle
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {kisiler.map(kisi => (
              <div key={kisi.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: kisi.anaKisi ? '#f59e0b' : 'var(--primary)' }}
                >
                  {kisi.ad?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    {kisi.ad} {kisi.soyad}
                    {kisi.anaKisi && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">⭐ Ana Kişi</span>}
                    {kisi.unvan && <span className="text-xs text-gray-400 font-normal">· {kisi.unvan}</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {kisi.telefon && <span className="text-xs text-gray-400">📞 {kisi.telefon}</span>}
                    {kisi.email   && <span className="text-xs text-gray-400">✉️ {kisi.email}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => setKisiForm({ ...kisi })}
                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => kisiSil(kisi.id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Alt Lokasyonlar ── */}
      <div ref={lokasyonBolumRef} className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">
            📍 Alt Lokasyonlar
            <span className="ml-2 text-xs font-normal text-gray-400">({lokasyonlar.length})</span>
          </h3>
          {!lokasyonForm && (
            <button
              onClick={() => setLokasyonForm({ ...bosLok })}
              className="text-xs px-3 py-1.5 rounded-lg text-white font-medium transition"
              style={{ background: 'var(--primary)' }}
            >
              + Lokasyon Ekle
            </button>
          )}
        </div>

        {/* Lokasyon formu */}
        {lokasyonForm && (
          <div className="px-5 py-4 border-b border-gray-100 bg-green-50">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">
              {lokasyonForm.id ? 'Lokasyonu Düzenle' : 'Yeni Lokasyon Ekle'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Lokasyon Adı *</label>
                <input
                  type="text"
                  value={lokasyonForm.ad}
                  onChange={e => setLokasyonForm(prev => ({ ...prev, ad: e.target.value }))}
                  placeholder="Otopark Doğu, Sistem Odası, Lobi..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Adres</label>
                <input
                  type="text"
                  value={lokasyonForm.adres}
                  onChange={e => setLokasyonForm(prev => ({ ...prev, adres: e.target.value }))}
                  placeholder="Atatürk Cad. No:12, Kat 3..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Notlar</label>
                <input
                  type="text"
                  value={lokasyonForm.notlar}
                  onChange={e => setLokasyonForm(prev => ({ ...prev, notlar: e.target.value }))}
                  placeholder="Erişim bilgileri, yetkili kişi, anahtar konumu..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={lokasyonForm.aktif}
                    onChange={e => setLokasyonForm(prev => ({ ...prev, aktif: e.target.checked }))}
                    className="w-4 h-4 rounded text-green-600"
                  />
                  <span className="text-xs text-gray-600 font-medium">Aktif lokasyon</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={lokasyonKaydet}
                disabled={lokKaydediliyor}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition bg-green-600 hover:bg-green-700"
                style={{ opacity: lokKaydediliyor ? 0.7 : 1 }}
              >
                {lokKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button
                onClick={() => setLokasyonForm(null)}
                className="px-4 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {/* Lokasyon listesi */}
        {lokasyonlar.length === 0 && !lokasyonForm ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            Henüz lokasyon eklenmedi.
            <br />
            <button
              onClick={() => setLokasyonForm({ ...bosLok })}
              className="mt-2 text-blue-500 hover:underline text-xs"
            >
              + İlk lokasyonu ekle
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {lokasyonlar.map(lok => (
              <div key={lok.id} className="flex items-start gap-4 px-5 py-3 hover:bg-gray-50 transition">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 mt-0.5"
                  style={{ background: lok.aktif ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)' }}
                >
                  📍
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    {lok.ad}
                    {!lok.aktif && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">Pasif</span>
                    )}
                  </p>
                  {lok.adres && <p className="text-xs text-gray-400 mt-0.5">{lok.adres}</p>}
                  {lok.notlar && <p className="text-xs text-gray-400 mt-0.5 italic">{lok.notlar}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => setLokasyonForm({ ...lok })}
                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => lokasyonSil(lok.id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Özet Kartlar ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { isim: 'Görüşme',  sayi: gorusmeler.length, ikon: '📞', renk: '#3b82f6', sekme: 'gorusme' },
          { isim: 'Teklif',   sayi: teklifler.length,  ikon: '📋', renk: '#0176D3', sekme: 'teklif' },
          { isim: 'Fatura',   sayi: satislar.length,   ikon: '🧾', renk: '#10b981', sekme: 'fatura' },
          { isim: 'Görev',    sayi: gorevler.length,   ikon: '✅', renk: '#f59e0b', sekme: 'gorev' },
        ].map(k => (
          <div
            key={k.isim}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center cursor-pointer hover:shadow-md transition"
            onClick={() => setAktifSekme(k.sekme)}
          >
            <div className="text-2xl mb-1">{k.ikon}</div>
            <p className="text-2xl font-bold" style={{ color: k.renk }}>{k.sayi}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.isim}</p>
          </div>
        ))}
      </div>

      {/* ── Finansal Özet ── */}
      {satislar.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">💰 Finansal Özet</h3>
            <button onClick={() => navigate('/satislar')} className="text-xs text-blue-500 hover:underline">
              Tüm Faturalar →
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Toplam Faturalanan', value: `${fmt(toplam)} ₺`, renk: 'var(--primary)', bg: 'rgba(1,118,211,0.06)' },
              { label: 'Tahsil Edilen',      value: `${fmt(tahsil)} ₺`, renk: '#10b981',       bg: 'rgba(16,185,129,0.06)' },
              { label: 'Kalan Bakiye',       value: `${fmt(kalan)} ₺`,  renk: kalan > 0 ? '#f59e0b' : '#10b981', bg: kalan > 0 ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)' },
              { label: 'Gecikmiş',           value: `${fmt(geciken)} ₺`, renk: geciken > 0 ? '#ef4444' : '#10b981', bg: geciken > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)' },
            ].map(k => (
              <div key={k.label} className="rounded-xl p-3" style={{ background: k.bg }}>
                <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                <p className="text-sm font-bold" style={{ color: k.renk }}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {satislar.slice(0, 4).map(f => {
              const gecikmisMi = f.durum === 'gonderildi' && f.vadeTarihi && new Date(f.vadeTarihi) < bugun
              const renk = gecikmisMi ? '#ef4444' : f.durum === 'odendi' ? '#10b981' : f.durum === 'gonderildi' ? '#0176D3' : '#6b7280'
              const isim = gecikmisMi ? 'Gecikti' : f.durum === 'odendi' ? 'Ödendi' : f.durum === 'gonderildi' ? 'Gönderildi' : 'Taslak'
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => navigate(`/satislar/${f.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold" style={{ color: 'var(--primary)' }}>{f.faturaNo}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${renk}18`, color: renk }}>{isim}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-700">{fmt(f.genelToplam)} ₺</span>
                    {f.vadeTarihi && <span className="text-xs text-gray-400">{new Date(f.vadeTarihi).toLocaleDateString('tr-TR', { day:'2-digit', month:'short' })}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Aktivite Timeline ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex gap-0 px-4 pt-4 border-b border-gray-100 flex-wrap">
          {[
            { id: 'hepsi',   isim: 'Tümü',       sayi: tumOlaylar.length },
            { id: 'gorusme', isim: 'Görüşmeler', sayi: gorusmeler.length },
            { id: 'teklif',  isim: 'Teklifler',  sayi: teklifler.length },
            { id: 'fatura',  isim: 'Faturalar',  sayi: satislar.length },
            { id: 'gorev',   isim: 'Görevler',   sayi: gorevler.length },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setAktifSekme(s.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition relative"
              style={{
                color: aktifSekme === s.id ? 'var(--primary)' : '#9ca3af',
                borderBottom: aktifSekme === s.id ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {s.isim}
              <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: aktifSekme === s.id ? 'rgba(1,118,211,0.1)' : '#f3f4f6', color: aktifSekme === s.id ? 'var(--primary)' : '#9ca3af' }}>
                {s.sayi}
              </span>
            </button>
          ))}
        </div>
        <div className="p-4">
          {filtreliOlaylar.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm">Bu kategoride kayıt bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtreliOlaylar.map(olay => (
                <div
                  key={olay.id}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-50 transition group"
                  onClick={() => navigate(olay.hedef)}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: `${olay.renk}15` }}
                  >
                    {olay.ikon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{olay.baslik}</p>
                    <p className="text-xs text-gray-400 truncate">{olay.detay}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">{olay.tarih}</p>
                    <p className="text-xs font-medium opacity-0 group-hover:opacity-100 transition" style={{ color: olay.renk }}>Git →</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

export default MusteriDetay
