import { useState, useMemo, useTransition } from 'react'
import { useAuth } from '../context/AuthContext'
import { ANA_TURLER } from '../context/ServisTalebiContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import CustomSelect from '../components/CustomSelect'

const tumModuller = [
  { id: 'musteriler', isim: 'Müşteri & Satış' },
  { id: 'gorevler', isim: 'Görev Atama' },
  { id: 'gorusmeler', isim: 'Görüşmeler' },
  { id: 'stok', isim: 'Stok' },
  { id: 'lisanslar', isim: 'NVR Lisanslar' },
  { id: 'raporlar', isim: 'Raporlar' },
  { id: 'servis_talepleri', isim: 'Servis Talepleri' },
]

const bos = { ad: '', kullaniciAdi: '', sifre: '', moduller: [], tip: 'zna', firmaAdi: '', izinliTurler: [] }

const tipRenk = {
  kullanici_giris: 'bg-green-100 text-green-700',
  kullanici_cikis: 'bg-red-100 text-red-600',
  sayfa_giris: 'bg-blue-100 text-blue-600',
  sayfa_cikis: 'bg-gray-100 text-gray-500',
}

const tipIkon = {
  kullanici_giris: '🟢',
  kullanici_cikis: '🔴',
  sayfa_giris: '📄',
  sayfa_cikis: '⏱️',
}

const tipIsim = {
  kullanici_giris: 'Giriş',
  kullanici_cikis: 'Çıkış',
  sayfa_giris: 'Sayfa Açtı',
  sayfa_cikis: 'Sayfada Kaldı',
}

function saniyeFormat(saniye) {
  if (!saniye || saniye === 0) return '0s'
  if (saniye < 60) return `${saniye}s`
  if (saniye < 3600) return `${Math.floor(saniye / 60)}dk ${saniye % 60}s`
  return `${Math.floor(saniye / 3600)}sa ${Math.floor((saniye % 3600) / 60)}dk`
}

function KullaniciYonetimi() {
  const { kullanicilar, kullaniciEkle, kullaniciSil, kullaniciGuncelle } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [form, setForm] = useState(bos)
  const [duzenle, setDuzenle] = useState(null)
  const [goster, setGoster] = useState(false)
  const [aktifSekme, setAktifSekme] = useState('kullanicilar')
  const [seciliKullaniciId, setSeciliKullaniciId] = useState('hepsi')
  const [seciliGun, setSeciliGun] = useState('hepsi')
  const [isPending, startTransition] = useTransition()
  const [ayarlar, setAyarlar] = useState(() =>
    JSON.parse(localStorage.getItem('sistem_ayarlari') || '{}')
  )
  const [ayarKaydedildi, setAyarKaydedildi] = useState(false)

  const ayarGuncelle = (alan, deger) => setAyarlar((prev) => ({ ...prev, [alan]: deger }))

  const ayarlariKaydet = () => {
    localStorage.setItem('sistem_ayarlari', JSON.stringify(ayarlar))
    setAyarKaydedildi(true)
    setTimeout(() => setAyarKaydedildi(false), 2000)
  }

  const tumLoglar = useMemo(() =>
    JSON.parse(localStorage.getItem('aktiviteLog') || '[]')
      .sort((a, b) => new Date(b.tarih) - new Date(a.tarih)),
    [aktifSekme]
  )

  const filtreliLoglar = useMemo(() =>
    tumLoglar
      .filter((l) => {
        if (seciliKullaniciId === 'hepsi') return true
        return String(l.kullaniciId) === String(seciliKullaniciId)
      })
      .filter((l) => {
        if (seciliGun === 'hepsi') return true
        const logTarih = new Date(l.tarih).toLocaleDateString('tr-TR')
        const bugun = new Date()
        if (seciliGun === 'bugun') {
          return logTarih === bugun.toLocaleDateString('tr-TR')
        }
        if (seciliGun === 'dun') {
          const dun = new Date(bugun)
          dun.setDate(dun.getDate() - 1)
          return logTarih === dun.toLocaleDateString('tr-TR')
        }
        if (seciliGun === 'bu_hafta') {
          const haftaBasi = new Date(bugun)
          haftaBasi.setDate(bugun.getDate() - bugun.getDay())
          return new Date(l.tarih) >= haftaBasi
        }
        return true
      }),
    [tumLoglar, seciliKullaniciId, seciliGun]
  )

  const kullaniciOzet = kullanicilar.map((k) => {
    const kLoglari = tumLoglar.filter((l) => String(l.kullaniciId) === String(k.id))
    const girisler = kLoglari.filter((l) => l.tip === 'kullanici_giris')
    const sayfaSureleri = kLoglari.filter((l) => l.tip === 'sayfa_cikis')
    const toplamSure = sayfaSureleri.reduce((sum, l) => sum + (l.sureSaniye || 0), 0)

    const sayfaSayilari = {}
    kLoglari.filter((l) => l.tip === 'sayfa_giris').forEach((l) => {
      sayfaSayilari[l.sayfa] = (sayfaSayilari[l.sayfa] || 0) + 1
    })
    const enCokSayfa = Object.entries(sayfaSayilari).sort((a, b) => b[1] - a[1])[0]
    const sonGiris = girisler[0]?.tarih

    return {
      ...k,
      toplamGiris: girisler.length,
      toplamSure,
      enCokSayfa: enCokSayfa?.[0] || '—',
      sonGiris,
    }
  })

  const modulToggle = (id) => {
    setForm((prev) => ({
      ...prev,
      moduller: prev.moduller.includes(id)
        ? prev.moduller.filter((m) => m !== id)
        : [...prev.moduller, id],
    }))
  }

  const turToggle = (id) => {
    setForm((prev) => ({
      ...prev,
      izinliTurler: prev.izinliTurler.includes(id)
        ? prev.izinliTurler.filter((t) => t !== id)
        : [...prev.izinliTurler, id],
    }))
  }

  const kaydet = async () => {
    if (!form.ad || !form.kullaniciAdi || !form.sifre) {
      toast.warning('Lütfen tüm alanları doldurun.')
      return
    }
    if (duzenle) {
      await kullaniciGuncelle(duzenle, form)
      toast.success(`${form.ad} güncellendi.`)
      setDuzenle(null)
    } else {
      await kullaniciEkle(form)
      toast.success(`${form.ad} eklendi.`)
    }
    setForm(bos)
    setGoster(false)
  }

  const duzenleBasla = (k) => {
    setForm({
      ad: k.ad,
      kullaniciAdi: k.kullaniciAdi,
      sifre: k.sifre,
      moduller: k.moduller || [],
      tip: k.tip || 'zna',
      firmaAdi: k.firmaAdi || '',
      izinliTurler: k.izinliTurler || [],
    })
    setDuzenle(k.id)
    setGoster(true)
  }

  const iptal = () => {
    setForm(bos)
    setDuzenle(null)
    setGoster(false)
  }

  const logTemizle = async () => {
    const onay = await confirm({
      baslik: 'Logları Temizle',
      mesaj: 'Tüm aktivite logları kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      onayMetin: 'Evet, Temizle',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    localStorage.removeItem('aktiviteLog')
    toast.success('Aktivite logları temizlendi.')
    setTimeout(() => window.location.reload(), 800)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Kullanıcı Yönetimi</h2>
          <p className="text-sm text-gray-400 mt-1">{kullanicilar.length} kullanıcı</p>
        </div>
        {aktifSekme === 'kullanicilar' && !goster && (
          <button
            onClick={() => setGoster(true)}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            + Yeni Kullanıcı
          </button>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[
          { id: 'kullanicilar', isim: 'Kullanıcılar' },
          { id: 'aktivite', isim: 'Aktivite Logları' },
          { id: 'ozet', isim: 'Özet Rapor' },
          { id: 'ayarlar', isim: '⚙️ Sistem Ayarları' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setAktifSekme(s.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              aktifSekme === s.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.isim}
          </button>
        ))}
      </div>

      {/* KULLANICILAR */}
      {aktifSekme === 'kullanicilar' && (
        <>
          {goster && (
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-blue-100">
              <h3 className="font-medium text-gray-800 mb-4">
                {duzenle ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı Ekle'}
              </h3>

              <div className="mb-4">
                <label className="text-sm text-gray-600 mb-2 block">Kullanıcı Tipi</label>
                <div className="flex gap-3">
                  {[
                    { id: 'zna', isim: '🛡️ ZNA Personeli', aciklama: 'Dahili yönetim sistemi erişimi' },
                    { id: 'musteri', isim: '👤 Müşteri Portalı', aciklama: 'Talep oluşturma ve takip' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm({ ...form, tip: t.id, moduller: t.id === 'musteri' ? [] : form.moduller })}
                      className="flex-1 text-left px-4 py-3 rounded-lg border-2 transition-all"
                      style={{
                        borderColor: form.tip === t.id ? 'var(--primary)' : '#e5e7eb',
                        background: form.tip === t.id ? 'rgba(1,118,211,0.05)' : '#f9fafb',
                      }}
                    >
                      <p className="text-sm font-medium text-gray-800">{t.isim}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.aciklama}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Ad Soyad</label>
                  <input
                    type="text"
                    value={form.ad}
                    onChange={(e) => setForm({ ...form, ad: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ahmet Yılmaz"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={form.kullaniciAdi}
                    onChange={(e) => setForm({ ...form, kullaniciAdi: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ahmet_y"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Şifre</label>
                  <input
                    type="text"
                    value={form.sifre}
                    onChange={(e) => setForm({ ...form, sifre: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="şifre123"
                  />
                </div>
              </div>

              {form.tip === 'musteri' && (
                <>
                  <div className="mb-4">
                    <label className="text-sm text-gray-600 mb-1 block">Firma Adı</label>
                    <input
                      type="text"
                      value={form.firmaAdi}
                      onChange={(e) => setForm({ ...form, firmaAdi: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ABC Teknoloji A.Ş."
                    />
                  </div>

                  <div className="mb-4">
                    <label className="text-sm text-gray-600 mb-2 block">
                      İzin Verilen Talep Türleri
                      <span className="text-gray-400 font-normal ml-1">(boş bırakılırsa tüm türler açık)</span>
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {ANA_TURLER.map((tur) => {
                        const secili = form.izinliTurler.includes(tur.id)
                        return (
                          <label
                            key={tur.id}
                            className="flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 transition border"
                            style={{
                              background: secili ? tur.bg : '#f9fafb',
                              borderColor: secili ? tur.renk : '#e5e7eb',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={secili}
                              onChange={() => turToggle(tur.id)}
                              className="accent-blue-600"
                            />
                            <span style={{ fontSize: '14px' }}>{tur.ikon}</span>
                            <span className="text-sm" style={{ color: secili ? tur.renk : 'var(--text-secondary)', fontWeight: secili ? 600 : 400 }}>
                              {tur.isim}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {form.izinliTurler.length === 0 && (
                      <p className="text-xs text-amber-500 mt-1.5">
                        ⚠️ Hiçbir tür seçilmedi — müşteri tüm türleri görecek
                      </p>
                    )}
                  </div>
                </>
              )}

              {form.tip !== 'musteri' && (
                <div className="mb-4">
                  <label className="text-sm text-gray-600 mb-2 block">Modül Erişimleri</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {tumModuller.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 cursor-pointer bg-gray-50 rounded-lg px-3 py-2 hover:bg-blue-50 transition"
                      >
                        <input
                          type="checkbox"
                          checked={form.moduller.includes(m.id)}
                          onChange={() => modulToggle(m.id)}
                          className="accent-blue-600"
                        />
                        <span className="text-sm text-gray-700">{m.isim}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={kaydet}
                  className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  {duzenle ? 'Güncelle' : 'Kaydet'}
                </button>
                <button
                  onClick={iptal}
                  className="text-sm px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
                >
                  İptal
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {kullanicilar.map((k) => (
              <div key={k.id} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium flex-shrink-0">
                  {k.ad?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{k.ad}</p>
                    {k.tip === 'musteri' && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(1,118,211,0.1)', color: 'var(--primary)' }}>
                        Müşteri Portalı
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    @{k.kullaniciAdi}
                    {k.firmaAdi && <span> · {k.firmaAdi}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 flex-1">
                  {k.tip === 'musteri' ? (
                    k.izinliTurler && k.izinliTurler.length > 0 ? (
                      k.izinliTurler.map((tid) => {
                        const tur = ANA_TURLER.find((t) => t.id === tid)
                        return tur ? (
                          <span
                            key={tid}
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: tur.bg, color: tur.renk }}
                          >
                            {tur.ikon} {tur.isim}
                          </span>
                        ) : null
                      })
                    ) : (
                      <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                        Tüm Türler Açık
                      </span>
                    )
                  ) : (
                    k.moduller?.map((mid) => {
                      const m = tumModuller.find((t) => t.id === mid)
                      return (
                        <span key={mid} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                          {m?.isim}
                        </span>
                      )
                    })
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => duzenleBasla(k)}
                    className="text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg px-3 py-1.5 transition"
                  >
                    Düzenle
                  </button>
                  {k.silinebilir && (
                    <button
                      onClick={async () => await kullaniciSil(k.id)}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded-lg px-3 py-1.5 transition"
                    >
                      Sil
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* AKTİVİTE LOGLARI */}
      {aktifSekme === 'aktivite' && (
        <div>
          <div className="flex gap-3 mb-4 flex-wrap items-center justify-between">
            <div className="flex gap-3 flex-wrap items-center">
              <CustomSelect
                value={seciliKullaniciId}
                onChange={(e) => startTransition(() => setSeciliKullaniciId(e.target.value))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hepsi">Tüm Kullanıcılar</option>
                {kullanicilar.map((k) => (
                  <option key={k.id} value={String(k.id)}>{k.ad}</option>
                ))}
              </CustomSelect>

              <CustomSelect
                value={seciliGun}
                onChange={(e) => startTransition(() => setSeciliGun(e.target.value))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hepsi">Tüm Zamanlar</option>
                <option value="bugun">Bugün</option>
                <option value="dun">Dün</option>
                <option value="bu_hafta">Bu Hafta</option>
              </CustomSelect>

              <span className="text-sm text-gray-400">{filtreliLoglar.length} kayıt</span>
            </div>

            <button
              onClick={logTemizle}
              className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded-lg px-3 py-1.5 transition"
            >
              Logları Temizle
            </button>
          </div>

          <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[120px] transition-opacity duration-150 ${isPending ? 'opacity-60' : 'opacity-100'}`}>
            <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
              <div className="col-span-2">Kullanıcı</div>
              <div className="col-span-2">İşlem</div>
              <div className="col-span-3">Sayfa / Detay</div>
              <div className="col-span-2">Süre</div>
              <div className="col-span-3">Tarih & Saat</div>
            </div>

            {filtreliLoglar.length === 0 && (
              <div className="p-10 text-center text-gray-400 text-sm">
                Henüz aktivite logu yok
              </div>
            )}

            {filtreliLoglar.slice(0, 200).map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition items-center"
              >
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {l.kullaniciAd?.charAt(0)}
                    </div>
                    <span className="text-xs text-gray-700 truncate">{l.kullaniciAd}</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipRenk[l.tip] || 'bg-gray-100 text-gray-500'}`}>
                    {tipIkon[l.tip]} {tipIsim[l.tip] || l.tip}
                  </span>
                </div>
                <div className="col-span-3">
                  <p className="text-xs text-gray-600 truncate">{l.sayfa || l.aciklama || '—'}</p>
                </div>
                <div className="col-span-2">
                  {l.sureSaniye ? (
                    <span className="text-xs text-gray-500">{saniyeFormat(l.sureSaniye)}</span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
                <div className="col-span-3">
                  <p className="text-xs text-gray-500">
                    {new Date(l.tarih).toLocaleDateString('tr-TR')} {new Date(l.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ÖZET RAPOR */}
      {aktifSekme === 'ozet' && (
        <div className="space-y-4">
          {kullaniciOzet.map((k) => (
            <div key={k.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold">
                  {k.ad?.charAt(0) || "?"}
                </div>
                <div>
                  <p className="font-medium text-gray-800">{k.ad}</p>
                  <p className="text-xs text-gray-400">@{k.kullaniciAdi}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Toplam Giriş</p>
                  <p className="text-xl font-bold text-blue-600">{k.toplamGiris}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Toplam Süre</p>
                  <p className="text-xl font-bold text-green-600">{saniyeFormat(k.toplamSure)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">En Çok Ziyaret</p>
                  <p className="text-sm font-bold text-gray-700 truncate">{k.enCokSayfa}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Son Giriş</p>
                  <p className="text-xs font-medium text-gray-600">
                    {k.sonGiris
                      ? new Date(k.sonGiris).toLocaleDateString('tr-TR') + ' ' +
                        new Date(k.sonGiris).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-2">Sayfa Ziyaret Dağılımı</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(
                    tumLoglar
                      .filter((l) => String(l.kullaniciId) === String(k.id) && l.tip === 'sayfa_giris')
                      .reduce((acc, l) => {
                        acc[l.sayfa] = (acc[l.sayfa] || 0) + 1
                        return acc
                      }, {})
                  )
                    .sort((a, b) => b[1] - a[1])
                    .map(([sayfa, adet]) => (
                      <span key={sayfa} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg">
                        {sayfa}: <strong>{adet}</strong>
                      </span>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* SİSTEM AYARLARI */}
      {aktifSekme === 'ayarlar' && (
        <div className="space-y-6 max-w-2xl">
          {/* Müşteri Portalı Ayarları */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-1">Müşteri Portalı</h3>
            <p className="text-xs text-gray-400 mb-5">Müşteri portalında görüntülenecek bağlantılar ve içerikler</p>

            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Ürün Kataloğu / Datasheet URL
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Müşteriler "Teklif İste" sayfasında bu linki görecek — tıklayarak ürün kataloğunu inceleyebilecekler
                </p>
                <input
                  type="url"
                  value={ayarlar.datasheetUrl || ''}
                  onChange={(e) => ayarGuncelle('datasheetUrl', e.target.value)}
                  placeholder="https://drive.google.com/... veya https://..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Destek Telefon Numarası
                </label>
                <input
                  type="text"
                  value={ayarlar.destekTelefon || ''}
                  onChange={(e) => ayarGuncelle('destekTelefon', e.target.value)}
                  placeholder="0212 xxx xx xx"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Destek E-posta
                </label>
                <input
                  type="email"
                  value={ayarlar.destekEposta || ''}
                  onChange={(e) => ayarGuncelle('destekEposta', e.target.value)}
                  placeholder="destek@firma.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Kaydet butonu */}
          <div className="flex items-center gap-3">
            <button
              onClick={ayarlariKaydet}
              className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Kaydet
            </button>
            {ayarKaydedildi && (
              <span className="text-sm text-green-600 font-medium">✓ Ayarlar kaydedildi</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default KullaniciYonetimi