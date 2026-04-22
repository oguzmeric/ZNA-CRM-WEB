import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useHatirlatma } from '../context/HatirlatmaContext'
import {
  teklifleriGetir,
  teklifSil as dbTeklifSil,
  teklifGuncelle,
  musteriTalepleriniGetir,
  musteriTalepGuncelle,
} from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import CustomSelect from '../components/CustomSelect'

const durumBadgeStyle = (durum) => {
  const map = {
    takipte: { label: 'CEVAP BEKLENİYOR', bg: 'rgba(1,118,211,0.1)', color: 'var(--primary)' },
    kabul: { label: 'ONAYLANDI', bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    revizyon: { label: 'REVİZYON', bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
    vazgecildi: { label: 'REDDEDİLDİ', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  }
  return map[durum] || map['takipte']
}

const paraBirimFormat = (sayi) =>
  `${(sayi || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`

const tarihFormat = (tarih) => {
  if (!tarih) return '—'
  return new Date(tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const goreceTarih = (tarih) => {
  if (!tarih) return '—'
  const fark = Date.now() - new Date(tarih).getTime()
  const gun = Math.floor(fark / (1000 * 60 * 60 * 24))
  if (gun === 0) return 'bugün'
  if (gun === 1) return 'dün'
  if (gun < 7) return `${gun} gün önce`
  if (gun < 30) return `${Math.floor(gun / 7)} hafta önce`
  if (gun < 365) return `${Math.floor(gun / 30)} ay önce`
  return `${Math.floor(gun / 365)} yıl önce`
}

const filtreMap = {
  cevap_beklenenler: (t) => ['takipte', 'revizyon'].includes(t.onayDurumu),
  onaylananlar: (t) => t.onayDurumu === 'kabul',
  reddedilenler: (t) => t.onayDurumu === 'vazgecildi',
  tumu: () => true,
}

function Teklifler() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { teklifHatirlatmasi } = useHatirlatma()

  const [teklifler, setTeklifler] = useState([])
  const [musteriTalepleri, setMusteriTalepleri] = useState([])
  const [satislar, setSatislar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const [aktifSekme, setAktifSekme] = useState('cevap_beklenenler')
  const [arama, setArama] = useState('')
  const [seciliTalep, setSeciliTalep] = useState(null)
  const [gosterilecekSayi, setGosterilecekSayi] = useState(100)

  useEffect(() => {
    Promise.all([teklifleriGetir(), musteriTalepleriniGetir(), satislariGetir()]).then(
      ([teklifData, talepData, satisData]) => {
        setTeklifler(teklifData)
        setMusteriTalepleri(talepData)
        setSatislar(satisData)
        setYukleniyor(false)
      }
    )
  }, [])

  if (yukleniyor) {
    return (
      <div className="p-6 flex items-center justify-center" style={{ minHeight: '200px' }}>
        <p style={{ color: 'var(--text-muted)' }}>Yükleniyor...</p>
      </div>
    )
  }

  const bekleyenSayisi = musteriTalepleri.filter((t) => t.durum === 'bekliyor').length

  const musteriTalepDurumGuncelle = async (id, yeniDurum) => {
    await musteriTalepGuncelle(id, { durum: yeniDurum })
    setMusteriTalepleri((prev) =>
      prev.map((t) => (t.id === id ? { ...t, durum: yeniDurum } : t))
    )
  }

  const teklifOlustur = (talep) => {
    localStorage.setItem(
      'teklif_on_doldurum',
      JSON.stringify({
        firmaAdi: talep.firmaAdi,
        musteriYetkilisi: talep.iletisimKisi,
        konu: `Teklif Talebi - ${talep.talepNo}`,
        aciklama: talep.aciklama,
        satirlar: (talep.urunler || []).map((u) => ({
          stokKodu: '',
          stokAdi: u.isim,
          miktar: parseInt(u.adet) || 1,
          birim: 'Adet',
          birimFiyat: 0,
          iskonto: 0,
          kdv: 20,
        })),
        musteriTalepId: talep.id,
        musteriTalepNo: talep.talepNo,
      })
    )
    musteriTalepDurumGuncelle(talep.id, 'inceleniyor')
    navigate('/teklifler/yeni')
  }

  const durumGuncelle = async (id, yeniDurum) => {
    await teklifGuncelle(id, { onayDurumu: yeniDurum })
    setTeklifler((prev) =>
      prev.map((t) => (t.id === id ? { ...t, onayDurumu: yeniDurum } : t))
    )
  }

  const teklifSil = async (id) => {
    const onay = await confirm({
      baslik: 'Teklifi Sil',
      mesaj: 'Bu teklif kalıcı olarak silinecek. Emin misiniz?',
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await dbTeklifSil(id)
    setTeklifler((prev) => prev.filter((t) => t.id !== id))
    toast.success('Teklif silindi.')
  }

  const faturayaDonustur = (teklif) => {
    localStorage.setItem(
      'satis_on_doldurum',
      JSON.stringify({
        firmaAdi: teklif.firmaAdi,
        musteriYetkili: teklif.musteriYetkilisi,
        teklifId: teklif.id,
        teklifNo: teklif.teklifNo,
        satirlar: (teklif.satirlar || []).map((s) => ({
          id: crypto.randomUUID(),
          stokKodu: s.stokKodu || '',
          urunAdi: s.stokAdi || '',
          miktar: s.miktar || 1,
          birim: s.birim || 'Adet',
          birimFiyat: s.birimFiyat || 0,
          iskontoOran: s.iskonto || 0,
          kdvOran: s.kdv || 20,
          araToplam: 0,
          kdvTutar: 0,
          satirToplam: 0,
        })),
      })
    )
    navigate('/satislar/yeni')
  }

  const filtreliTeklifler = [...teklifler]
    .reverse()
    .filter((t) => (filtreMap[aktifSekme] || (() => true))(t))
    .filter((t) =>
      arama === '' ||
      `${t.teklifNo || ''} ${t.firmaAdi || ''} ${t.konu || ''}`.toLowerCase().includes(arama.toLowerCase())
    )

  const gorunenTeklifler = filtreliTeklifler.slice(0, gosterilecekSayi)
  const dahaFazlaVar = filtreliTeklifler.length > gosterilecekSayi

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Teklifler
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {teklifler.length} teklif
          </p>
        </div>
        {aktifSekme !== 'musteri_talepleri' && (
          <button
            onClick={() => navigate('/teklifler/yeni')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
            style={{ background: 'var(--primary)' }}
          >
            + Yeni Teklif
          </button>
        )}
      </div>

      {/* Arama */}
      {aktifSekme !== 'musteri_talepleri' && (
        <div className="mb-4">
          <input
            type="text"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Teklif no, firma veya konu ara..."
            className="w-full max-w-sm px-3 py-2 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      )}

      {/* Ana sekmeler */}
      <div className="flex gap-0 mb-0" style={{ borderBottom: '2px solid var(--border)' }}>
        {[
          { id: 'cevap_beklenenler', label: 'CEVAP BEKLENENLER' },
          { id: 'onaylananlar', label: 'ONAYLANANLAR' },
          { id: 'reddedilenler', label: 'REDDEDİLENLER' },
          { id: 'tumu', label: 'TÜMÜ' },
          { id: 'musteri_talepleri', label: '📥 MÜŞTERİ TALEPLERİ', badge: bekleyenSayisi },
        ].map((sekme) => {
          const aktif = aktifSekme === sekme.id
          return (
            <button
              key={sekme.id}
              onClick={() => { setAktifSekme(sekme.id); setGosterilecekSayi(100) }}
              className="flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-colors relative"
              style={{
                color: aktif ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: aktif ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: '-2px',
                background: 'transparent',
              }}
            >
              {sekme.label}
              {sekme.badge > 0 && (
                <span className="text-white text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#ef4444', fontSize: '10px' }}>
                  {sekme.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* MÜŞTERİ TALEPLERİ */}
      {aktifSekme === 'musteri_talepleri' && (
        <div className="mt-6">
          {musteriTalepleri.length === 0 ? (
            <div
              className="rounded-2xl p-12 text-center"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid rgba(1,118,211,0.1)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <p style={{ fontSize: '36px', marginBottom: '12px' }}>📭</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Henüz müşteri teklif talebi yok
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...musteriTalepleri]
                .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
                .map((talep) => {
                  const durumRenk = {
                    bekliyor: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
                    inceleniyor: { bg: 'rgba(1,118,211,0.1)', color: 'var(--primary)' },
                    teklif_hazirlandi: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
                    iptal: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
                  }
                  const renk = durumRenk[talep.durum] || durumRenk['bekliyor']
                  const acik = seciliTalep === talep.id

                  return (
                    <div
                      key={talep.id}
                      className="rounded-2xl overflow-hidden"
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid rgba(1,118,211,0.1)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      }}
                    >
                      <div
                        className="flex items-center gap-4 px-5 py-4 cursor-pointer transition"
                        onClick={() => setSeciliTalep(acik ? null : talep.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span
                              className="text-xs font-mono font-semibold"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {talep.talepNo}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: renk.bg, color: renk.color }}
                            >
                              {talep.durum === 'bekliyor'
                                ? '⏳ Bekliyor'
                                : talep.durum === 'inceleniyor'
                                ? '🔍 İnceleniyor'
                                : talep.durum === 'teklif_hazirlandi'
                                ? '✅ Teklif Hazırlandı'
                                : '⛔ İptal'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {talep.firmaAdi || '—'}
                            </p>
                            <span style={{ color: 'var(--border)' }}>·</span>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {talep.iletisimKisi}
                            </p>
                            <span style={{ color: 'var(--border)' }}>·</span>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {(talep.urunler?.length || 0)} ürün
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {tarihFormat(talep.tarih)}
                          </p>
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                            {acik ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>

                      {acik && (
                        <div
                          className="px-5 pb-5"
                          style={{ borderTop: '1px solid var(--border)' }}
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4">
                            <div>
                              <p
                                className="text-xs font-semibold uppercase tracking-wide mb-2"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                İstenen Ürünler
                              </p>
                              <div className="space-y-1.5">
                                {(talep.urunler || []).map((u, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between rounded-xl px-3 py-2"
                                    style={{ background: 'var(--bg-hover)' }}
                                  >
                                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                      {u.isim}
                                    </span>
                                    <span
                                      className="text-xs font-medium rounded-lg px-2 py-0.5"
                                      style={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      {u.adet} adet
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p
                                  className="text-xs font-semibold uppercase tracking-wide mb-1"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  Açıklama
                                </p>
                                <p
                                  className="text-sm rounded-xl px-3 py-2"
                                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                                >
                                  {talep.aciklama}
                                </p>
                              </div>
                              {talep.butce && (
                                <div>
                                  <p
                                    className="text-xs font-semibold uppercase tracking-wide mb-1"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    Bütçe
                                  </p>
                                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    {talep.butce}
                                  </p>
                                </div>
                              )}
                              {talep.telefon && (
                                <div>
                                  <p
                                    className="text-xs font-semibold uppercase tracking-wide mb-1"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    Telefon
                                  </p>
                                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    {talep.telefon}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                          <div
                            className="flex gap-2 mt-4 pt-4"
                            style={{ borderTop: '1px solid var(--border)' }}
                          >
                            {(talep.durum === 'bekliyor' || talep.durum === 'inceleniyor') && (
                              <button
                                onClick={() => teklifOlustur(talep)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition"
                                style={{ background: 'var(--primary)' }}
                              >
                                📝 Teklif Oluştur
                              </button>
                            )}
                            <CustomSelect
                              value={talep.durum}
                              onChange={(e) => musteriTalepDurumGuncelle(talep.id, e.target.value)}
                              style={{
                                fontSize: '12px',
                                borderRadius: '10px',
                                padding: '6px 10px',
                                fontWeight: '500',
                                outline: 'none',
                                cursor: 'pointer',
                                background: renk.bg,
                                color: renk.color,
                                border: 'none',
                              }}
                            >
                              <option value="bekliyor">⏳ Bekliyor</option>
                              <option value="inceleniyor">🔍 İnceleniyor</option>
                              <option value="teklif_hazirlandi">✅ Teklif Hazırlandı</option>
                              <option value="iptal">⛔ İptal</option>
                            </CustomSelect>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* TEKLİFLER TABLOLU SEKMELERİ */}
      {aktifSekme !== 'musteri_talepleri' && (
        <div className="mt-6">
          {/* Teklif tablosu */}
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
                gridTemplateColumns: '1fr 160px 150px 120px 160px',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-muted)',
                background: 'var(--bg-hover)',
              }}
            >
              <div>TEKLİF AÇIKLAMASI</div>
              <div>FATURA</div>
              <div>DÜZENLEME TARİHİ</div>
              <div className="text-right">TEKLİF TOPLAMI</div>
              <div className="text-right">AKSIYONLAR</div>
            </div>

            {gorunenTeklifler.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-16"
                style={{ color: 'var(--text-muted)' }}
              >
                <span style={{ fontSize: '40px', marginBottom: '12px' }}>📋</span>
                <p className="text-sm font-medium">
                  {arama ? 'Arama sonucu bulunamadı.' : 'Bu kategoride teklif bulunmuyor.'}
                </p>
              </div>
            ) : (
              gorunenTeklifler.map((t, idx) => {
                const badge = durumBadgeStyle(t.onayDurumu)
                const hatirlatma = teklifHatirlatmasi(t.id)
                const hatirlatmaVadesiGeldi =
                  hatirlatma && new Date(hatirlatma.hatirlatmaTarihi) <= new Date()
                const ilgiliFatura = satislar.find((s) => s.teklifId === t.id)

                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="grid items-center px-4 py-3 text-sm transition-colors"
                    style={{
                      gridTemplateColumns: '1fr 160px 150px 120px 160px',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* TEKLİF AÇIKLAMASI */}
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {hatirlatma && (
                          <span
                            title={
                              hatirlatmaVadesiGeldi
                                ? 'Takip zamanı geldi!'
                                : `Hatırlatma: ${new Date(hatirlatma.hatirlatmaTarihi).toLocaleDateString('tr-TR')}`
                            }
                            style={{ fontSize: '11px', cursor: 'help' }}
                          >
                            {hatirlatmaVadesiGeldi ? '🔴' : '🔔'}
                          </span>
                        )}
                        <button
                          onClick={() => navigate(`/teklifler/${t.id}`)}
                          className="font-semibold text-sm truncate hover:opacity-70 transition text-left"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {t.konu || t.teklifNo}
                        </button>
                        {t.revizyon > 0 && (
                          <span className="text-xs" style={{ color: '#f59e0b' }}>
                            Rev.{t.revizyon}
                          </span>
                        )}
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {t.firmaAdi}{t.musteriYetkilisi ? ` · ${t.musteriYetkilisi}` : ''}
                      </p>
                    </div>

                    {/* FATURA */}
                    <div className="flex flex-col gap-1.5">
                      {ilgiliFatura ? (
                        <button
                          onClick={() => navigate(`/satislar/${ilgiliFatura.id}`)}
                          className="text-xs font-medium hover:opacity-70 transition text-left"
                          style={{ color: '#10b981' }}
                        >
                          ✅ Fatura Oluşturuldu
                        </button>
                      ) : t.onayDurumu === 'kabul' ? (
                        <button
                          onClick={() => faturayaDonustur(t)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium text-white transition w-fit"
                          style={{ background: '#0176D3' }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                        >
                          🧾 Fatura Oluştur
                        </button>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          —
                        </span>
                      )}
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full w-fit"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {/* DÜZENLEME TARİHİ */}
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {tarihFormat(t.tarih)}
                      </p>
                      <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                        {goreceTarih(t.tarih)}
                      </p>
                    </div>

                    {/* TEKLİF TOPLAMI */}
                    <div className="text-right font-bold" style={{ color: 'var(--text-primary)' }}>
                      {paraBirimFormat(t.genelToplam)}
                    </div>

                    {/* AKSIYONLAR */}
                    <div className="flex gap-1 justify-end flex-wrap">
                      <button
                        onClick={() => navigate(`/teklifler/${t.id}`)}
                        className="text-xs px-2 py-1 rounded-lg transition"
                        style={{
                          color: 'var(--primary)',
                          border: '1px solid rgba(1,118,211,0.2)',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'rgba(1,118,211,0.08)')
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        Düzenle
                      </button>
                      {t.onayDurumu !== 'kabul' && t.onayDurumu !== 'vazgecildi' && (
                        <button
                          onClick={() => durumGuncelle(t.id, 'kabul')}
                          className="text-xs px-2 py-1 rounded-lg transition text-white"
                          style={{ background: '#10b981' }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                        >
                          ✅ Onayla
                        </button>
                      )}
                      <button
                        onClick={() => teklifSil(t.id)}
                        className="text-xs px-2 py-1 rounded-lg transition"
                        style={{
                          color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.2)',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        Sil
                      </button>
                    </div>
                  </motion.div>
                )
              })
            )}

            {/* Daha Fazla Yükle */}
            {dahaFazlaVar && (
              <div className="flex items-center justify-center py-4 border-t" style={{ borderColor: 'rgba(1,118,211,0.08)' }}>
                <button
                  onClick={() => setGosterilecekSayi(prev => prev + 200)}
                  className="px-6 py-2 rounded-xl text-sm font-medium transition"
                  style={{ background: 'rgba(1,118,211,0.08)', color: 'var(--primary)', border: '1px solid rgba(1,118,211,0.2)' }}
                >
                  ⬇ {filtreliTeklifler.length - gosterilecekSayi} Kayıt Daha — Yükle
                </button>
              </div>
            )}

            {/* Alt bilgi çubuğu */}
            {gorunenTeklifler.length > 0 && (
              <div
                className="flex items-center justify-between px-5 py-3 rounded-b-2xl text-xs"
                style={{
                  background: 'var(--bg-hover)',
                  borderTop: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                <span>{gorunenTeklifler.length} Kayıt</span>
                <div className="flex gap-6">
                  <span>
                    Toplam:{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {gorunenTeklifler.reduce((s, t) => s + (t.genelToplam || 0), 0)
                        .toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </strong>
                  </span>
                  <span>
                    Kabul Edilen:{' '}
                    <strong style={{ color: '#10b981' }}>
                      {gorunenTeklifler.filter(t => t.onayDurumu === 'kabul').reduce((s, t) => s + (t.genelToplam || 0), 0)
                        .toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Teklifler
