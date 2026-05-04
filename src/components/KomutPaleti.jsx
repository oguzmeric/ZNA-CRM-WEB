// Komut Paleti — Ctrl+K / ⌘+K ile her sayfadan açılan global arama & hızlı eylem.
// Müşteri/firma, görev, görüşme, teklif, servis talebi, satış, stok kaleminde arar.
// Türkçe karakter tolerant (trSearch). Recent LRU localStorage'da.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, Plus, Phone, FileText, Wrench, Receipt, User, Building2, ListTodo, Package, Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { musterileriGetir } from '../services/musteriService'
import { gorevleriGetir } from '../services/gorevService'
import { gorusmeleriGetir } from '../services/gorusmeService'
import { teklifleriGetir } from '../services/teklifService'
import { satislariGetir } from '../services/satisService'
import { stokUrunleriniGetir } from '../services/stokService'
import { useServisTalebi } from '../context/ServisTalebiContext'
import { trContains, trNormalize } from '../lib/trSearch'

const RECENT_KEY = 'kp_recent'
const RECENT_MAX = 8

// Sonuç tipi → ikon + grup adı + yol üreteci
const TIPLER = {
  musteri: {
    grup: 'Müşteriler',
    Icon: User,
    yol: (m) => `/musteriler/${m.id}`,
    baslik: (m) => m.firma || `${m.ad || ''} ${m.soyad || ''}`.trim() || `#${m.id}`,
    altbaslik: (m) => {
      const ad = `${m.ad || ''} ${m.soyad || ''}`.trim()
      return m.firma && ad ? ad : (m.telefon || m.email || '')
    },
    ara: (m) => `${m.firma || ''} ${m.ad || ''} ${m.soyad || ''} ${m.kod || ''} ${m.telefon || ''} ${m.email || ''} ${m.unvan || ''}`,
  },
  gorev: {
    grup: 'Görevler',
    Icon: ListTodo,
    yol: (g) => `/gorevler/${g.id}`,
    baslik: (g) => g.baslik,
    altbaslik: (g) => `${g.firmaAdi || ''}${g.atananAd ? ' · ' + g.atananAd : ''}`,
    ara: (g) => `${g.baslik || ''} ${g.aciklama || ''} ${g.firmaAdi || ''} ${g.atananAd || ''}`,
  },
  gorusme: {
    grup: 'Görüşmeler',
    Icon: Phone,
    yol: (g) => `/gorusmeler/${g.id}`,
    baslik: (g) => g.firmaAdi || g.aktNo || `Görüşme #${g.id}`,
    altbaslik: (g) => `${g.aktNo || ''}${g.konu ? ' · ' + g.konu : ''}`,
    ara: (g) => `${g.firmaAdi || ''} ${g.aktNo || ''} ${g.konu || ''} ${g.muhatapAd || ''} ${g.takipNotu || ''} ${g.gorusen || ''}`,
  },
  teklif: {
    grup: 'Teklifler',
    Icon: FileText,
    yol: (t) => `/teklifler/${t.id}`,
    baslik: (t) => t.teklifNo || `Teklif #${t.id}`,
    altbaslik: (t) => `${t.firmaAdi || ''}${t.konu ? ' · ' + t.konu : ''}`,
    ara: (t) => `${t.teklifNo || ''} ${t.firmaAdi || ''} ${t.konu || ''} ${t.musteriYetkilisi || ''}`,
  },
  servis: {
    grup: 'Servis Talepleri',
    Icon: Wrench,
    yol: (s) => `/servis-talepleri/${s.id}`,
    baslik: (s) => s.talepNo || `Talep #${s.id}`,
    altbaslik: (s) => `${s.firmaAdi || ''}${s.konu ? ' · ' + s.konu : ''}`,
    ara: (s) => `${s.talepNo || ''} ${s.firmaAdi || ''} ${s.konu || ''} ${s.aciklama || ''} ${s.musteriAd || ''}`,
  },
  satis: {
    grup: 'Satışlar / Faturalar',
    Icon: Receipt,
    yol: (s) => `/satislar/${s.id}`,
    baslik: (s) => s.faturaNo || `Satış #${s.id}`,
    altbaslik: (s) => s.firmaAdi || '',
    ara: (s) => `${s.faturaNo || ''} ${s.firmaAdi || ''} ${s.musteriYetkili || ''}`,
  },
  stok: {
    grup: 'Stok Kalemleri',
    Icon: Package,
    yol: (s) => `/stok/model/${encodeURIComponent(s.stokKodu || s.id)}`,
    baslik: (s) => s.stokAdi || s.stokKodu || `Stok #${s.id}`,
    altbaslik: (s) => `${s.stokKodu || ''}${s.marka ? ' · ' + s.marka : ''}`,
    ara: (s) => `${s.stokKodu || ''} ${s.stokAdi || ''} ${s.marka || ''} ${s.kategori || ''}`,
  },
}

// Hızlı eylemler
const HIZLI_EYLEMLER = [
  { id: 'yeni-gorev',   label: 'Yeni görev', yol: '/gorevler', Icon: ListTodo, ara: 'yeni gorev task ekle' },
  { id: 'yeni-gorusme', label: 'Yeni görüşme', yol: '/gorusmeler', Icon: Phone, ara: 'yeni gorusme call ekle' },
  { id: 'yeni-teklif',  label: 'Yeni teklif', yol: '/teklifler/yeni', Icon: FileText, ara: 'yeni teklif quote ekle' },
  { id: 'yeni-servis',  label: 'Yeni servis talebi', yol: '/servis-talepleri/yeni', Icon: Wrench, ara: 'yeni servis talep ekle' },
  { id: 'yeni-musteri', label: 'Yeni müşteri', yol: '/musteriler', Icon: User, ara: 'yeni musteri ekle' },
  { id: 'yeni-satis',   label: 'Yeni satış / fatura', yol: '/satislar', Icon: Receipt, ara: 'yeni satis fatura ekle' },
]

const recentOku = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') }
  catch { return [] }
}

const recentEkle = (giris) => {
  try {
    const mevcut = recentOku().filter(r => !(r.tip === giris.tip && r.id === giris.id))
    const yeni = [giris, ...mevcut].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(yeni))
  } catch { /* ignore */ }
}

export default function KomutPaleti({ acik, onClose }) {
  const navigate = useNavigate()
  const { kullanici } = useAuth()
  const isMusteri = kullanici?.tip === 'musteri'

  // Servis talepleri zaten context'te yüklü
  const { talepler: servisTalepleri } = useServisTalebi() || { talepler: [] }

  const [veri, setVeri] = useState({
    musteri: [], gorev: [], gorusme: [], teklif: [], satis: [], stok: [],
  })
  const [yukleniyor, setYukleniyor] = useState(false)
  const [arama, setArama] = useState('')
  const [secili, setSecili] = useState(0)
  const [recent, setRecent] = useState([])
  const inputRef = useRef(null)

  // İlk açılışta veri yükle (müşteri kullanıcısı dışında)
  useEffect(() => {
    if (!acik || isMusteri) return
    setYukleniyor(true)
    Promise.all([
      musterileriGetir().catch(() => []),
      gorevleriGetir().catch(() => []),
      gorusmeleriGetir().catch(() => []),
      teklifleriGetir().catch(() => []),
      satislariGetir().catch(() => []),
      stokUrunleriniGetir().catch(() => []),
    ]).then(([m, g, gr, t, s, st]) => {
      setVeri({
        musteri: m || [], gorev: g || [], gorusme: gr || [],
        teklif: t || [], satis: s || [], stok: st || [],
      })
    }).finally(() => setYukleniyor(false))
  }, [acik, isMusteri])

  // Recent yükle
  useEffect(() => {
    if (acik) {
      setRecent(recentOku())
      setArama('')
      setSecili(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [acik])

  // Body scroll lock
  useEffect(() => {
    if (!acik) return
    const eskiOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = eskiOverflow }
  }, [acik])

  // Sonuçları hesapla
  const sonuclar = useMemo(() => {
    if (!acik) return { gruplar: [], toplam: 0 }
    const q = arama.trim()
    if (!q) {
      // Boş input — recent'lar
      return {
        gruplar: recent.length > 0 ? [{
          baslik: 'SON GÖRÜNTÜLENENLER',
          ogeler: recent.map(r => ({
            tip: r.tip,
            id: r.id,
            baslik: r.baslik,
            altbaslik: r.altbaslik,
            yol: r.yol,
          })),
        }] : [],
        toplam: recent.length,
      }
    }

    const tumOgeler = []
    // Sonuç başına 5'e kadar göster (her grupta)
    const ekleGrup = (tipKey, kayitlar) => {
      const def = TIPLER[tipKey]
      const eslesir = (kayitlar || [])
        .filter(k => trContains(def.ara(k), q))
        .slice(0, 5)
        .map(k => ({
          tip: tipKey,
          id: k.id,
          baslik: def.baslik(k),
          altbaslik: def.altbaslik(k),
          yol: def.yol(k),
          _ham: k,
        }))
      if (eslesir.length > 0) {
        tumOgeler.push({ tipKey, baslik: def.grup, ogeler: eslesir })
      }
    }

    if (!isMusteri) {
      ekleGrup('musteri', veri.musteri)
      ekleGrup('gorev', veri.gorev)
      ekleGrup('gorusme', veri.gorusme)
      ekleGrup('teklif', veri.teklif)
      ekleGrup('servis', servisTalepleri)
      ekleGrup('satis', veri.satis)
      ekleGrup('stok', veri.stok)
    }

    // Hızlı eylem filtre
    const eylemEslesen = HIZLI_EYLEMLER.filter(e =>
      trContains(e.ara + ' ' + e.label, q)
    )

    const gruplar = tumOgeler.map(g => ({ baslik: g.baslik.toUpperCase(), ogeler: g.ogeler }))
    if (eylemEslesen.length > 0) {
      gruplar.push({
        baslik: 'HIZLI EYLEMLER',
        ogeler: eylemEslesen.map(e => ({
          tip: 'eylem',
          id: e.id,
          baslik: e.label,
          altbaslik: '',
          yol: e.yol,
          _eylem: true,
          Icon: e.Icon,
        })),
      })
    }

    const toplam = gruplar.reduce((acc, g) => acc + g.ogeler.length, 0)
    // Eğer hiç sonuç yok ama eylemler varsa hep göster
    if (toplam === 0 && !isMusteri) {
      gruplar.push({
        baslik: 'HIZLI EYLEMLER',
        ogeler: HIZLI_EYLEMLER.map(e => ({
          tip: 'eylem', id: e.id, baslik: e.label, altbaslik: '', yol: e.yol, _eylem: true, Icon: e.Icon,
        })),
      })
    }
    return { gruplar, toplam }
  }, [acik, arama, veri, servisTalepleri, recent, isMusteri])

  // Düz liste — klavye navigasyonu için
  const duzListe = useMemo(() => {
    return sonuclar.gruplar.flatMap(g => g.ogeler)
  }, [sonuclar])

  // Sonuçlar değişince selection sıfırla
  useEffect(() => { setSecili(0) }, [arama])

  const sonucuAc = useCallback((oge) => {
    if (!oge) return
    if (!oge._eylem) {
      // Recent'a ekle
      recentEkle({ tip: oge.tip, id: oge.id, baslik: oge.baslik, altbaslik: oge.altbaslik, yol: oge.yol })
    }
    onClose?.()
    navigate(oge.yol)
  }, [navigate, onClose])

  // Klavye
  const handleKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSecili(i => Math.min(i + 1, duzListe.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSecili(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      sonucuAc(duzListe[secili])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose?.()
    }
  }

  if (!acik) return null

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh',
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        width: 'min(640px, 92vw)',
        maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-card, #fff)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--border-default, #e2e8f0)',
        overflow: 'hidden',
      }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-default, #e2e8f0)' }}>
          <Search size={18} strokeWidth={1.8} style={{ color: 'var(--text-tertiary, #94a3b8)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={arama}
            onChange={e => setArama(e.target.value)}
            onKeyDown={handleKey}
            placeholder={isMusteri ? 'Aramaya başla…' : 'Müşteri, görev, görüşme, teklif, servis, fatura, stok…'}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              font: '500 16px/22px var(--font-sans)',
              color: 'var(--text-primary, #0f172a)',
              background: 'transparent',
            }}
          />
          {yukleniyor && <span style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary, #94a3b8)' }}>yükleniyor…</span>}
        </div>

        {/* Sonuçlar */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {sonuclar.gruplar.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-tertiary, #94a3b8)', font: '400 13px/18px var(--font-sans)' }}>
              {arama ? 'Sonuç bulunamadı.' : 'Aramaya başla — müşteri, görev, görüşme, teklif…'}
            </div>
          ) : (
            sonuclar.gruplar.map((grup, gi) => {
              let baslangicIdx = sonuclar.gruplar.slice(0, gi).reduce((acc, g) => acc + g.ogeler.length, 0)
              return (
                <div key={grup.baslik} style={{ marginBottom: 4 }}>
                  <div style={{
                    padding: '8px 18px 4px',
                    font: '700 10px/14px var(--font-sans)',
                    color: 'var(--text-tertiary, #94a3b8)',
                    letterSpacing: '0.06em',
                  }}>
                    {grup.baslik}
                  </div>
                  {grup.ogeler.map((oge, oi) => {
                    const idx = baslangicIdx + oi
                    const aktif = idx === secili
                    const def = oge.tip !== 'eylem' ? TIPLER[oge.tip] : null
                    const Icon = oge._eylem ? oge.Icon : (def?.Icon || ArrowRight)
                    return (
                      <button
                        key={`${oge.tip}-${oge.id}`}
                        onClick={() => sonucuAc(oge)}
                        onMouseEnter={() => setSecili(idx)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          width: '100%', padding: '8px 18px',
                          background: aktif ? 'var(--brand-primary-soft, #eff6ff)' : 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: 'var(--text-primary, #0f172a)',
                        }}
                      >
                        {oge._eylem ? (
                          <div style={{
                            width: 28, height: 28, borderRadius: 6,
                            background: 'var(--brand-primary-soft, #eff6ff)',
                            color: 'var(--brand-primary, #0176D3)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Plus size={14} strokeWidth={2} />
                          </div>
                        ) : (
                          <div style={{
                            width: 28, height: 28, borderRadius: 6,
                            background: 'var(--surface-sunken, #f1f5f9)',
                            color: 'var(--text-secondary, #475569)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Icon size={14} strokeWidth={1.5} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '500 14px/20px var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {oge.baslik || '—'}
                          </div>
                          {oge.altbaslik && (
                            <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary, #94a3b8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {oge.altbaslik}
                            </div>
                          )}
                        </div>
                        {aktif && (
                          <ArrowRight size={14} strokeWidth={1.5} style={{ color: 'var(--brand-primary, #0176D3)' }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid var(--border-default, #e2e8f0)',
          display: 'flex', alignItems: 'center', gap: 16,
          font: '400 11px/14px var(--font-sans)',
          color: 'var(--text-tertiary, #94a3b8)',
          background: 'var(--surface-sunken, #f8fafc)',
        }}>
          <span><kbd style={kbdStil}>↑↓</kbd> gez</span>
          <span><kbd style={kbdStil}>↵</kbd> aç</span>
          <span><kbd style={kbdStil}>esc</kbd> kapat</span>
          <span style={{ marginLeft: 'auto' }}><kbd style={kbdStil}>Ctrl/⌘</kbd> + <kbd style={kbdStil}>K</kbd></span>
        </div>
      </div>
    </div>
  )
}

const kbdStil = {
  display: 'inline-block',
  padding: '1px 5px',
  background: 'var(--surface-card, #fff)',
  border: '1px solid var(--border-default, #cbd5e1)',
  borderRadius: 4,
  font: '500 10px/14px var(--font-mono, monospace)',
  color: 'var(--text-secondary, #475569)',
}
