import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBildirim } from '../context/BildirimContext'
import { useKargo } from '../context/KargoContext'

export default function KargoDetay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { kullanici, kullanicilar } = useAuth()
  const { bildirimEkle } = useBildirim()
  const {
    kargolar, kargoDurumGuncelle, kargoGuncelle,
    kargoNotEkle, kargoSil,
    KARGO_FIRMALARI, DURUM_LISTESI,
  } = useKargo()

  const [yeniDurum, setYeniDurum] = useState('')
  const [durumNot, setDurumNot] = useState('')
  const [yeniNot, setYeniNot] = useState('')
  const [takipNoDuzenle, setTakipNoDuzenle] = useState(false)
  const [takipNoGecici, setTakipNoGecici] = useState('')
  const [silOnay, setSilOnay] = useState(false)

  const kargo = (kargolar || []).find((k) => String(k?.id) === String(id))

  if (!kargo) {
    return (
      <div className="p-6">
        <p className="text-gray-400 mb-4">Kargo bulunamadı.</p>
        <button onClick={() => navigate('/kargolar')} className="text-sm text-indigo-600 hover:underline">← Kargoları gör</button>
      </div>
    )
  }

  // Supabase JSONB kolonları bazen string geliyorsa parse et
  const safeParseArray = (v) => {
    if (Array.isArray(v)) return v
    if (typeof v === 'string') {
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
    }
    return []
  }
  const safeParseObject = (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v
    if (typeof v === 'string') {
      try { const p = JSON.parse(v); return (p && typeof p === 'object') ? p : {} } catch { return {} }
    }
    return {}
  }

  const gonderen = safeParseObject(kargo.gonderen)
  const alici    = safeParseObject(kargo.alici)
  const notlar   = safeParseArray(kargo.notlar)
  const durumGecmisi = safeParseArray(kargo.durumGecmisi)
  const ilgiliKullaniciIds = safeParseArray(kargo.ilgiliKullaniciIds)

  const mevcutDurum = DURUM_LISTESI.find((d) => d.id === kargo.durum)
  const firma = KARGO_FIRMALARI.find((f) => f.id === kargo.kargoFirmasi)
  const gecikti = kargo.tahminiTeslim && new Date(kargo.tahminiTeslim) < new Date() && !['teslim_edildi','iade'].includes(kargo.durum)
  const tamamlandi = ['teslim_edildi', 'iade'].includes(kargo.durum)

  const durumGuncelle = () => {
    if (!yeniDurum) return
    kargoDurumGuncelle(kargo.id, yeniDurum, kullanici.ad, durumNot)

    // İlgili kişilere bildirim
    const durumBilgi = DURUM_LISTESI.find((d) => d.id === yeniDurum)
    ilgiliKullaniciIds
      .filter((uid) => String(uid) !== String(kullanici.id))
      .forEach((uid) => {
        bildirimEkle(
          uid,
          `Kargo Güncellendi — ${durumBilgi?.ikon} ${durumBilgi?.isim}`,
          `${kargo.kargoNo}: ${gonderen.firma || gonderen.ad || '?'} → ${alici.firma || alici.ad || '?'}${durumNot ? '. Not: ' + durumNot : ''}`,
          yeniDurum === 'teslim_edildi' ? 'basari' : yeniDurum === 'iade' ? 'uyari' : 'bilgi',
          `/kargolar/${kargo.id}`
        )
      })

    setYeniDurum('')
    setDurumNot('')
  }

  const notEkle = () => {
    if (!yeniNot.trim()) return
    kargoNotEkle(kargo.id, yeniNot, kullanici)
    setYeniNot('')
  }

  const takipNoKaydet = () => {
    kargoGuncelle(kargo.id, { takipNo: takipNoGecici })
    setTakipNoDuzenle(false)
  }

  const ileriDurumlar = DURUM_LISTESI.filter((d) => d.id !== kargo.durum && d.id !== 'iade')
  const mevcut_sira = mevcutDurum?.sira || 0

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Geri */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => navigate('/kargolar')} className="text-sm text-gray-400 hover:text-indigo-600 flex items-center gap-1 transition">
          ← Kargolara dön
        </button>
        {!tamamlandi && (
          <button
            onClick={() => setSilOnay(true)}
            className="text-sm text-red-400 hover:text-red-600 border border-red-100 px-3 py-1.5 rounded-lg transition"
          >
            🗑 Sil
          </button>
        )}
      </div>

      {/* Silme onayı */}
      {silOnay && (
        <div className="rounded-xl px-5 py-4 mb-4 flex items-center gap-3 bg-red-50 border border-red-200 text-sm">
          <span className="text-red-700 flex-1 font-medium">Bu kargoyu kalıcı olarak silmek istediğinize emin misiniz?</span>
          <button onClick={() => { kargoSil(kargo.id); navigate('/kargolar') }} className="text-white bg-red-500 hover:bg-red-600 px-4 py-1.5 rounded-lg font-semibold transition">Evet, Sil</button>
          <button onClick={() => setSilOnay(false)} className="text-gray-600 px-4 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition">İptal</button>
        </div>
      )}

      {/* Ana kart */}
      <div className="rounded-2xl p-6 mb-4" style={{
        background: 'rgba(255,255,255,0.92)',
        border: gecikti ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(1,118,211,0.12)',
        boxShadow: '0 4px 24px rgba(1,118,211,0.08)',
      }}>
        {/* Başlık */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{kargo.kargoNo}</span>
              <span className="text-lg">{kargo.tip === 'giden' ? '📤' : '📥'}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: kargo.tip === 'giden' ? 'var(--primary)' : '#10b981', background: kargo.tip === 'giden' ? 'rgba(1,118,211,0.1)' : 'rgba(16,185,129,0.1)' }}>
                {kargo.tip === 'giden' ? 'Giden' : 'Gelen'}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: firma?.bg, color: firma?.renk }}>
                {firma?.isim}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: mevcutDurum?.bg, color: mevcutDurum?.renk }}>
                {mevcutDurum?.ikon} {mevcutDurum?.isim}
              </span>
              {gecikti && <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">⚠️ Gecikti</span>}
            </div>
            <p className="text-lg font-bold text-gray-800">
              {gonderen.firma || gonderen.ad || '?'}
              <span className="text-gray-300 mx-2">→</span>
              {alici.firma || alici.ad || '?'}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{kargo.icerik}</p>
          </div>
        </div>

        {/* Takip No */}
        <div className="flex items-center gap-2 mb-5 p-3 rounded-xl" style={{ background: 'rgba(1,118,211,0.05)', border: '1px solid rgba(1,118,211,0.12)' }}>
          <span className="text-sm text-gray-500">Takip No:</span>
          {takipNoDuzenle ? (
            <>
              <input
                type="text"
                value={takipNoGecici}
                onChange={(e) => setTakipNoGecici(e.target.value)}
                className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Takip numarası girin"
                autoFocus
              />
              <button onClick={takipNoKaydet} className="text-xs text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-lg transition">Kaydet</button>
              <button onClick={() => setTakipNoDuzenle(false)} className="text-xs text-gray-500 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition">İptal</button>
            </>
          ) : (
            <>
              <span className="font-mono text-sm font-semibold text-indigo-600 flex-1">
                {kargo.takipNo || <span className="text-gray-300 font-normal">Henüz eklenmedi</span>}
              </span>
              <button
                onClick={() => { setTakipNoGecici(kargo.takipNo || ''); setTakipNoDuzenle(true) }}
                className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 border border-indigo-200 rounded-lg transition"
              >
                {kargo.takipNo ? 'Düzenle' : '+ Ekle'}
              </button>
            </>
          )}
        </div>

        {/* Gönderen / Alıcı */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {[
            { baslik: '📤 Gönderen', veri: gonderen },
            { baslik: '📥 Alıcı',    veri: alici },
          ].map(({ baslik, veri }) => (
            <div key={baslik} className="rounded-xl p-4" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold text-gray-500 mb-2">{baslik}</p>
              {veri.firma && <p className="text-sm font-semibold text-gray-800">{veri.firma}</p>}
              {veri.ad && <p className="text-sm text-gray-700">{veri.ad}</p>}
              {veri.telefon && <p className="text-xs text-gray-400 mt-1">📞 {veri.telefon}</p>}
              {veri.adres && <p className="text-xs text-gray-400 mt-1">📍 {veri.adres}</p>}
              {!veri.ad && !veri.firma && <p className="text-xs text-gray-300">Bilgi girilmedi</p>}
            </div>
          ))}
        </div>

        {/* Meta bilgiler */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-gray-100">
          {[
            { etiket: 'Ağırlık', deger: kargo.agirlik ? kargo.agirlik + ' kg' : '—' },
            { etiket: 'Desi', deger: kargo.desi || '—' },
            { etiket: 'Ücret', deger: kargo.ucret ? kargo.ucret + ' ₺' : '—' },
            { etiket: 'Ödeme', deger: { gonderici: 'Gönderici', alici: 'Alıcı', kapida: 'Kapıda' }[kargo.odemeYontemi] || '—' },
            { etiket: 'Tahmini Teslim', deger: kargo.tahminiTeslim || '—' },
            { etiket: 'Teslim Tarihi', deger: kargo.teslimTarihi ? new Date(kargo.teslimTarihi).toLocaleDateString('tr-TR') : '—' },
            { etiket: 'Oluşturan', deger: kargo.olusturanAd || '—' },
            { etiket: 'Kayıt Tarihi', deger: kargo.olusturmaTarihi ? new Date(kargo.olusturmaTarihi).toLocaleDateString('tr-TR') : '—' },
          ].map(({ etiket, deger }) => (
            <div key={etiket}>
              <p className="text-xs text-gray-400 mb-0.5">{etiket}</p>
              <p className="text-sm font-medium text-gray-700">{deger}</p>
            </div>
          ))}
        </div>

        {/* İlgili kişiler */}
        {ilgiliKullaniciIds.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">Bildirim Alan Personel</p>
            <div className="flex gap-2 flex-wrap">
              {ilgiliKullaniciIds.map((uid) => {
                const k = (kullanicilar || []).find((u) => String(u?.id) === String(uid))
                return k ? (
                  <div key={uid} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: 'rgba(1,118,211,0.08)', color: 'var(--primary)', border: '1px solid rgba(1,118,211,0.2)' }}>
                    <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold" style={{ fontSize: 9 }}>{k.ad?.charAt(0) || '?'}</div>
                    {k.ad}
                  </div>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>

      {/* Durum İlerleyici (progress bar) */}
      {!['iade'].includes(kargo.durum) && (
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 24px rgba(1,118,211,0.06)' }}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Kargo İlerleyişi</p>
          <div className="flex items-center justify-between relative">
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200" style={{ zIndex: 0 }} />
            {DURUM_LISTESI.filter((d) => d.sira > 0).sort((a, b) => a.sira - b.sira).map((d) => {
              const gecildi = d.sira <= mevcut_sira
              return (
                <div key={d.id} className="flex flex-col items-center gap-1.5 relative" style={{ zIndex: 1 }}>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all"
                    style={{
                      background: gecildi ? d.renk : 'var(--bg-card)',
                      border: `2px solid ${gecildi ? d.renk : '#e5e7eb'}`,
                      boxShadow: gecildi ? `0 0 0 3px ${d.renk}30` : 'none',
                    }}
                  >
                    {gecildi ? <span style={{ color: 'white', fontSize: 12 }}>✓</span> : <span style={{ fontSize: 12 }}>{d.ikon}</span>}
                  </div>
                  <p className="text-xs text-center font-medium" style={{ color: gecildi ? d.renk : 'var(--text-muted)', maxWidth: 72, lineHeight: 1.2 }}>
                    {d.isim}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Durum Güncelle */}
      {!tamamlandi && (
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 24px rgba(1,118,211,0.06)' }}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Durum Güncelle</p>
          <div className="flex gap-2 flex-wrap mb-3">
            {DURUM_LISTESI.filter((d) => d.id !== kargo.durum).map((d) => (
              <button
                key={d.id}
                onClick={() => setYeniDurum(d.id)}
                className="text-sm px-3 py-2 rounded-xl font-medium transition flex items-center gap-1.5"
                style={{
                  background: yeniDurum === d.id ? d.bg : 'var(--bg-card)',
                  color: yeniDurum === d.id ? d.renk : 'var(--text-muted)',
                  border: yeniDurum === d.id ? `2px solid ${d.renk}60` : '2px solid #e5e7eb',
                  boxShadow: yeniDurum === d.id ? `0 4px 12px ${d.renk}25` : 'none',
                }}
              >
                {d.ikon} {d.isim}
              </button>
            ))}
          </div>
          {yeniDurum && (
            <div className="flex gap-2 items-start">
              <input
                type="text"
                value={durumNot}
                onChange={(e) => setDurumNot(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Durum notu (opsiyonel)..."
              />
              <button
                onClick={durumGuncelle}
                className="text-sm px-5 py-2 rounded-xl text-white font-medium flex-shrink-0 transition"
                style={{ background: 'var(--primary)' }}
              >
                Güncelle
              </button>
            </div>
          )}
        </div>
      )}

      {/* Durum Geçmişi */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 24px rgba(1,118,211,0.06)' }}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Durum Geçmişi</p>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5" style={{ background: 'rgba(1,118,211,0.15)' }} />
          <div className="flex flex-col gap-4">
            {[...durumGecmisi].reverse().map((gecmis, i) => {
              const durumBilgi = DURUM_LISTESI.find((d) => d.id === gecmis.durum)
              return (
                <div key={i} className="flex gap-4 pl-2 relative">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 relative z-10"
                    style={{ background: durumBilgi?.bg || '#f1f5f9', border: `2px solid ${durumBilgi?.renk || '#e5e7eb'}30` }}
                  >
                    {durumBilgi?.ikon || '•'}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: durumBilgi?.renk || '#374151' }}>
                        {durumBilgi?.isim || gecmis.durum}
                      </span>
                      <span className="text-xs text-gray-400">{gecmis.kullaniciAd}</span>
                      <span className="text-xs text-gray-300">
                        {gecmis.tarih ? new Date(gecmis.tarih).toLocaleString('tr-TR') : ''}
                      </span>
                    </div>
                    {gecmis.aciklama && (
                      <p className="text-xs text-gray-500 mt-0.5">{gecmis.aciklama}</p>
                    )}
                  </div>
                </div>
              )
            })}
            {durumGecmisi.length === 0 && (
              <p className="text-sm text-gray-400 pl-12">Henüz durum güncellemesi yok.</p>
            )}
          </div>
        </div>
      </div>

      {/* Notlar */}
      <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(1,118,211,0.12)', boxShadow: '0 4px 24px rgba(1,118,211,0.06)' }}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Notlar {notlar.length > 0 && <span className="text-indigo-500">({notlar.length})</span>}
        </p>

        {notlar.length === 0 && (
          <p className="text-sm text-gray-400 mb-4">Henüz not eklenmedi.</p>
        )}

        <div className="flex flex-col gap-3 mb-4">
          {notlar.map((not, i) => (
            <div key={not.id || i} className="rounded-xl p-3" style={{ background: 'rgba(1,118,211,0.04)', border: '1px solid rgba(1,118,211,0.1)' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold" style={{ fontSize: 10 }}>
                  {not.kullaniciAd?.charAt(0) || '?'}
                </div>
                <span className="text-sm font-medium text-gray-700">{not.kullaniciAd}</span>
                <span className="text-xs text-gray-400 ml-auto">{not.tarih ? new Date(not.tarih).toLocaleString('tr-TR') : ''}</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{not.metin}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={yeniNot}
            onChange={(e) => setYeniNot(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && notEkle()}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Not ekle..."
          />
          <button
            onClick={notEkle}
            disabled={!yeniNot.trim()}
            className="text-sm px-5 py-2 rounded-xl text-white font-medium transition disabled:opacity-40"
            style={{ background: 'var(--primary)' }}
          >
            Ekle
          </button>
        </div>
      </div>
    </div>
  )
}
