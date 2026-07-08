import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Shield, User, Check, AlertTriangle, Settings,
  LogIn, LogOut, FileText, Clock, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ANA_TURLER } from '../context/ServisTalebiContext'
import { supabase } from '../lib/supabase'
import { musterileriGetir } from '../services/musteriService'
import { kullaniciSifreSifirla, onayBekleyenleriGetir, kullaniciOnayla, kullaniciReddet } from '../services/kullaniciService'
import { createClient } from '@supabase/supabase-js'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import CustomSelect from '../components/CustomSelect'
import {
  Button, Input, Label, Card, Badge, Avatar, EmptyState, SearchInput,
} from '../components/ui'
import { trContains } from '../lib/trSearch'

const tumModuller = [
  { id: 'musteriler',        isim: 'Müşteri & Satış' },
  { id: 'gorevler',          isim: 'Görev Atama' },
  { id: 'gorusmeler',        isim: 'Görüşmeler' },
  { id: 'stok',              isim: 'Stok' },
  { id: 'lisanslar',         isim: 'NVR Lisanslar' },
  { id: 'raporlar',          isim: 'Raporlar' },
  { id: 'servis_talepleri',  isim: 'Servis Talepleri' },
  { id: 'demolar',           isim: 'Demolar' },
  { id: 'arac_takip',        isim: 'Araç Takip (Mobiltek)' },
]

const bos = { ad: '', kullaniciAdi: '', sifre: '', moduller: [], tip: 'zna', firmaAdi: '', izinliTurler: [], musteriId: null }

const LOG_TIP = {
  kullanici_giris: { isim: 'Giriş',           tone: 'aktif',     C: LogIn },
  kullanici_cikis: { isim: 'Çıkış',           tone: 'kayip',     C: LogOut },
  sayfa_giris:     { isim: 'Sayfa Açtı',      tone: 'lead',      C: FileText },
  sayfa_cikis:     { isim: 'Sayfada Kaldı',   tone: 'pasif',     C: Clock },
}

const saniyeFormat = (s) => {
  if (!s || s === 0) return '0 s'
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} dk ${s % 60} s`
  return `${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk`
}

// Kullanici listesi — grup baslikli, durum noktasi, son giris, kompakt yetkiler.
const DURUM_RENK = {
  cevrimici: '#10B981', mesgul: '#DC2626', disarida: '#F59E0B',
  toplantida: '#1E5AA8', cevrimdisi: '#9CA3AF',
}
const DURUM_ISIM = {
  cevrimici: 'Çevrimiçi', mesgul: 'Meşgul', disarida: 'Dışarıda',
  toplantida: 'Toplantıda', cevrimdisi: 'Çevrimdışı',
}
function sonGirisCevir(tarih) {
  if (!tarih) return null
  const d = new Date(tarih)
  if (isNaN(d.getTime())) return null
  const fark = Date.now() - d.getTime()
  const dk = Math.floor(fark / 60000)
  const saat = Math.floor(dk / 60)
  const gun = Math.floor(saat / 24)
  if (dk < 1)  return 'Az önce'
  if (dk < 60) return `${dk} dk önce`
  if (saat < 24) return `${saat} saat önce`
  if (gun < 7)  return `${gun} gün önce`
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function KullaniciListesi({ kullanicilar, kullaniciOzet, tumModuller, ANA_TURLER, aramaMetni, setAramaMetni, onDuzenle, onSil }) {
  const [yetkiAcik, setYetkiAcik] = useState({})
  const ozetMap = useMemo(() => {
    const m = new Map()
    kullaniciOzet.forEach(o => m.set(o.id, o))
    return m
  }, [kullaniciOzet])

  // Arama: ad, kullaniciAdi, firmaAdi
  const filtreli = useMemo(() => kullanicilar.filter(k => {
    if (!aramaMetni) return true
    return trContains([k.ad, k.kullaniciAdi, k.firmaAdi].filter(Boolean).join(' '), aramaMetni)
  }), [kullanicilar, aramaMetni])

  // Tip'e gore grupla — yonetici/admin onde, ZNA personel, musteri
  const gruplar = useMemo(() => {
    const adminler  = filtreli.filter(k => k.rol === 'admin')
    const personel  = filtreli.filter(k => k.tip !== 'musteri' && k.rol !== 'admin')
    const musteri   = filtreli.filter(k => k.tip === 'musteri')
    return [
      { id: 'admin',    isim: 'Yöneticiler',    renk: '#DC2626', liste: adminler  },
      { id: 'personel', isim: 'ZNA Personeli',  renk: 'var(--brand-primary)', liste: personel },
      { id: 'musteri',  isim: 'Müşteri Portalı', renk: 'var(--success)', liste: musteri  },
    ].filter(g => g.liste.length > 0)
  }, [filtreli])

  const KullaniciSatiri = ({ k }) => {
    const ozet = ozetMap.get(k.id) || {}
    const durum = k.durum || 'cevrimdisi'
    const acik = !!yetkiAcik[k.id]

    // Yetki itemlari
    const yetkiler = k.tip === 'musteri'
      ? (k.izinliTurler?.length > 0
          ? k.izinliTurler.map(tid => ANA_TURLER.find(t => t.id === tid)?.isim).filter(Boolean)
          : (k.firmaAdi ? ['Tüm türler açık'] : []))
      : (k.moduller || []).map(mid => tumModuller.find(t => t.id === mid)?.isim).filter(Boolean)
    const gosterilen = acik ? yetkiler : yetkiler.slice(0, 3)
    const kalan = yetkiler.length - gosterilen.length

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-default)',
        transition: 'background 120ms',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Avatar + online dot */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={k.ad} size="md" />
          <span aria-hidden style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 11, height: 11, borderRadius: '50%',
            background: DURUM_RENK[durum] || DURUM_RENK.cevrimdisi,
            border: '2px solid var(--surface-card)',
          }} title={DURUM_ISIM[durum] || 'Bilinmiyor'} />
        </div>

        {/* Isim + meta */}
        <div style={{ minWidth: 0, flex: '0 0 240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{k.ad}</span>
            {k.rol === 'admin' && <Badge tone="kayip">Admin</Badge>}
            {k.siparisOnayUstYetkili && <Badge tone="beklemede">Üst Onaycı</Badge>}
            {k.siparisOnayYetkilisi && !k.siparisOnayUstYetkili && <Badge tone="brand">Onaycı</Badge>}
          </div>
          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{k.kullaniciAdi}
            {k.firmaAdi && <span> · {k.firmaAdi}</span>}
          </div>
          {ozet.sonGiris && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2, font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
              <Clock size={10} strokeWidth={1.5} />
              {sonGirisCevir(ozet.sonGiris)}
            </div>
          )}
        </div>

        {/* Yetkiler */}
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {gosterilen.length === 0
            ? <span className="t-caption" style={{ fontStyle: 'italic' }}>Yetki tanımlı değil</span>
            : gosterilen.map(isim => (
                <Badge key={isim} tone={k.tip === 'musteri' ? 'brand' : 'lead'}>{isim}</Badge>
              ))}
          {kalan > 0 && (
            <button
              onClick={() => setYetkiAcik(p => ({ ...p, [k.id]: true }))}
              style={{
                padding: '2px 8px', borderRadius: 999,
                border: '1px dashed var(--border-default)',
                background: 'transparent', cursor: 'pointer',
                font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
              }}
            >
              +{kalan} daha
            </button>
          )}
          {acik && yetkiler.length > 3 && (
            <button
              onClick={() => setYetkiAcik(p => ({ ...p, [k.id]: false }))}
              style={{
                padding: '2px 8px', borderRadius: 999,
                border: '1px dashed var(--border-default)',
                background: 'transparent', cursor: 'pointer',
                font: '500 11px/16px var(--font-sans)', color: 'var(--text-tertiary)',
              }}
            >
              − Az göster
            </button>
          )}
        </div>

        {/* Aksiyon butonlari */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            aria-label="Düzenle"
            onClick={() => onDuzenle(k)}
            style={{
              width: 32, height: 32,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <Pencil size={14} strokeWidth={1.5} />
          </button>
          {k.silinebilir && (
            <button
              aria-label="Sil"
              onClick={async () => await onSil(k.id)}
              style={{
                width: 32, height: 32,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Arama */}
      <SearchInput
        value={aramaMetni}
        onChange={e => setAramaMetni(e.target.value)}
        placeholder="Kullanıcı adı, kullanıcı adı veya firmaya göre ara…"
      />

      {filtreli.length === 0 ? (
        <Card><EmptyState title="Eşleşen kullanıcı bulunamadı" /></Card>
      ) : (
        gruplar.map(g => (
          <div key={g.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 8px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.renk }} />
              <span style={{ font: '700 12px/16px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {g.isim}
              </span>
              <span style={{ font: '500 11px/14px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                ({g.liste.length})
              </span>
            </div>
            <Card padding={0}>
              {g.liste.map(k => <KullaniciSatiri key={k.id} k={k} />)}
            </Card>
          </div>
        ))
      )}
    </div>
  )
}

// Path normalize — token/ID iceren URL'leri okunabilir kategoriye cevirir.
// 'Servis Talepleri' (lower-case key url'leri de iceriyor — sayfaIsimleri'nden gelmis)
const PATH_KATEGORI = [
  { re: /^\/servis-talepleri\/[^/]+\/yazdir$/i, isim: 'Servis Talebi · Yazdırma' },
  { re: /^\/servis-talepleri\/\d+$/i,           isim: 'Servis Talep Detayı' },
  { re: /^\/servis-talepleri/i,                 isim: 'Servis Talepleri' },
  { re: /^\/servis-raporlari/i,                 isim: 'Servis Raporları' },
  { re: /^\/teklifler\/\d+$/i,                  isim: 'Teklif Detayı' },
  { re: /^\/teklifler/i,                        isim: 'Teklifler' },
  { re: /^\/musteriler\/\d+$/i,                 isim: 'Müşteri Detayı' },
  { re: /^\/musteriler/i,                       isim: 'Müşteriler' },
  { re: /^\/firmalar/i,                         isim: 'Firmalar' },
  { re: /^\/firma-gecmisi\//i,                  isim: 'Firma Geçmişi' },
  { re: /^\/gorevler\/\d+$/i,                   isim: 'Görev Detayı' },
  { re: /^\/gorevler/i,                         isim: 'Görevler' },
  { re: /^\/gorusmeler/i,                       isim: 'Görüşmeler' },
  { re: /^\/stok-hareketleri/i,                 isim: 'Stok Hareketleri' },
  { re: /^\/stok-opsiyon/i,                     isim: 'Stok Opsiyonları' },
  { re: /^\/stok\/model\//i,                    isim: 'Stok Model Detayı' },
  { re: /^\/stok/i,                             isim: 'Stok' },
  { re: /^\/demolar\/\d+/i,                     isim: 'Demo Detayı' },
  { re: /^\/demolar/i,                          isim: 'Demolar' },
  { re: /^\/satislar\/\d+/i,                    isim: 'Fatura Detayı' },
  { re: /^\/satislar/i,                         isim: 'Satış Faturaları' },
  { re: /^\/notlarim/i,                         isim: 'Notlarım' },
  { re: /^\/takvim/i,                           isim: 'Takvim' },
  { re: /^\/dashboard/i,                        isim: 'Panel' },
  { re: /^\/panel/i,                            isim: 'Panel' },
  { re: /^\/login/i,                            isim: 'Giriş' },
  { re: /^\/profil/i,                           isim: 'Profil' },
  { re: /^\/kullanici-yonetimi/i,               isim: 'Kullanıcı Yönetimi' },
  { re: /^\/raporlar/i,                         isim: 'Raporlar' },
  { re: /^\/rapor-merkezi/i,                    isim: 'Rapor Merkezi' },
  { re: /^\/performans/i,                       isim: 'Performans' },
  { re: /^\/trassir-lisanslar/i,                isim: 'Trassir Lisanslar' },
  { re: /^\/sla-ayarlari/i,                     isim: 'SLA Ayarları' },
  { re: /^\/ayarlar/i,                          isim: 'Ayarlar' },
  { re: /^\/siparis-onaylari/i,                 isim: 'Sipariş Onayları' },
  { re: /^\/memnuniyet/i,                       isim: 'Müşteri Memnuniyeti' },
  { re: /^\/duyurular/i,                        isim: 'Duyurular' },
  { re: /^\/sohbet|chat/i,                      isim: 'Sohbet' },
  { re: /^\/mesajlar/i,                         isim: 'Mesajlar' },
  { re: /^\/dokuman-merkezi/i,                  isim: 'Doküman Merkezi' },
  { re: /^\/kargolar/i,                         isim: 'Kargo Takip' },
  { re: /^\/p\//i,                              isim: 'Paylaşım Linki' },
]

function sayfaNormalize(s) {
  if (!s) return 'Diğer'
  const txt = String(s).trim()
  // Eger zaten okunabilir bir Turkce isimse (sayfaIsimleri'nden geldiyse) oldugu gibi birak
  if (!txt.startsWith('/')) return txt
  for (const k of PATH_KATEGORI) {
    if (k.re.test(txt)) return k.isim
  }
  // Bilinmeyen path: yalniz ilk segment goster
  const seg = txt.split('?')[0].split('/').filter(Boolean)[0]
  return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'Diğer'
}

function OzetRaporBolumu({ kullaniciOzet, tumLoglar, saniyeFormat }) {
  const [tumGosterilen, setTumGosterilen] = useState({})

  // En aktif (toplamSure) onde, hic aktivitesi olmayan en sona
  const siralanmis = useMemo(() => [...kullaniciOzet].sort((a, b) => {
    const aktifA = (a.toplamGiris > 0 || a.toplamSure > 0) ? 1 : 0
    const aktifB = (b.toplamGiris > 0 || b.toplamSure > 0) ? 1 : 0
    if (aktifA !== aktifB) return aktifB - aktifA
    return (b.toplamSure || 0) - (a.toplamSure || 0)
  }), [kullaniciOzet])

  const aktif = siralanmis.filter(k => k.toplamGiris > 0 || k.toplamSure > 0)
  const pasif = siralanmis.filter(k => !(k.toplamGiris > 0 || k.toplamSure > 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {aktif.map(k => {
        // Sayfa dagilimi — normalize edilmis kategori bazli
        const kategoriSay = {}
        tumLoglar.filter(l => String(l.kullaniciId) === String(k.id) && l.tip === 'sayfa_giris').forEach(l => {
          const norm = sayfaNormalize(l.sayfa)
          kategoriSay[norm] = (kategoriSay[norm] || 0) + 1
        })
        const sirali = Object.entries(kategoriSay).sort((a, b) => b[1] - a[1])
        const enCokKategori = sirali[0]?.[0] || '—'
        const tumGoster = !!tumGosterilen[k.id]
        const gosterilen = tumGoster ? sirali : sirali.slice(0, 8)
        const kalan = sirali.length - gosterilen.length
        const enYuksek = sirali[0]?.[1] || 1

        return (
          <Card key={k.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Avatar name={k.ad} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{k.ad}</div>
                <div className="t-caption">@{k.kullaniciAdi}</div>
              </div>
              {k.sonGiris && (
                <div style={{ textAlign: 'right' }}>
                  <div className="t-label">SON GİRİŞ</div>
                  <div style={{ font: '500 12.5px/16px var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(k.sonGiris).toLocaleDateString('tr-TR')} · {new Date(k.sonGiris).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
            </div>

            {/* Mini KPI ler */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
              {[
                { l: 'Toplam Giriş',  v: k.toplamGiris, renk: 'var(--brand-primary)' },
                { l: 'Aktif Süre',    v: saniyeFormat(k.toplamSure), renk: 'var(--success)' },
                { l: 'En Çok',        v: enCokKategori, renk: 'var(--info)', truncate: true },
                { l: 'Sayfa Çeşidi',  v: sirali.length, renk: 'var(--warning)' },
              ].map(i => (
                <div key={i.l} style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken)',
                  borderLeft: `3px solid ${i.renk}`,
                }}>
                  <div style={{ font: '500 10.5px/14px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{i.l}</div>
                  <div style={{
                    font: '700 15px/20px var(--font-sans)',
                    color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: i.truncate ? 'nowrap' : 'normal',
                    overflow: i.truncate ? 'hidden' : 'visible',
                    textOverflow: i.truncate ? 'ellipsis' : 'clip',
                  }}>
                    {i.v}
                  </div>
                </div>
              ))}
            </div>

            {/* Sayfa dagilimi — yatay bar liste */}
            {sirali.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p className="t-label" style={{ margin: 0 }}>SAYFA ZİYARET DAĞILIMI</p>
                  <span className="t-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>{sirali.length} kategori</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {gosterilen.map(([sayfa, adet]) => (
                    <div key={sayfa} style={{ position: 'relative', padding: '6px 10px', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: `linear-gradient(to right, var(--brand-primary-soft) ${(adet / enYuksek) * 100}%, transparent ${(adet / enYuksek) * 100}%)`,
                        opacity: 0.55,
                      }} />
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ font: '500 12.5px/18px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sayfa}
                        </span>
                        <span style={{ font: '700 12.5px/18px var(--font-sans)', color: 'var(--brand-primary)', fontVariantNumeric: 'tabular-nums', marginLeft: 12 }}>
                          {adet}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {kalan > 0 && (
                  <button
                    onClick={() => setTumGosterilen(p => ({ ...p, [k.id]: !p[k.id] }))}
                    style={{
                      marginTop: 6, padding: '4px 10px',
                      background: 'transparent', border: '1px dashed var(--border-default)',
                      borderRadius: 6, cursor: 'pointer',
                      font: '500 11.5px/16px var(--font-sans)', color: 'var(--text-secondary)',
                    }}
                  >
                    + Diğer {kalan} kategoriyi göster
                  </button>
                )}
                {tumGoster && (
                  <button
                    onClick={() => setTumGosterilen(p => ({ ...p, [k.id]: false }))}
                    style={{
                      marginTop: 6, padding: '4px 10px',
                      background: 'transparent', border: '1px dashed var(--border-default)',
                      borderRadius: 6, cursor: 'pointer',
                      font: '500 11.5px/16px var(--font-sans)', color: 'var(--text-secondary)',
                    }}
                  >
                    − Az göster
                  </button>
                )}
              </div>
            )}
          </Card>
        )
      })}

      {/* Pasif kullanicilar tek kompakt blok */}
      {pasif.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p className="t-label" style={{ margin: 0 }}>AKTİVİTESİ OLMAYAN ({pasif.length})</p>
            <span className="t-caption">Henüz giriş yapmamış kullanıcılar</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pasif.map(k => (
              <div key={k.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 10px',
                background: 'var(--surface-sunken)',
                borderRadius: 999,
              }}>
                <Avatar name={k.ad} size="xs" />
                <span style={{ font: '500 12.5px/16px var(--font-sans)', color: 'var(--text-secondary)' }}>{k.ad}</span>
                <span className="t-caption">@{k.kullaniciAdi}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// Aktivite loglarini gun gun gruplayarak gosteren bolum.
// 100lerce log varken duz akan tablo yerine: gun bazli accordion + sayfalama.
function AktiviteLoglariBolumu({ filtreliLoglar, isPending, saniyeFormat, LOG_TIP }) {
  const SAYFA_BOYUTU = 50
  const [sayfa, setSayfa] = useState(1)
  const [acikGunler, setAcikGunler] = useState({})

  // Sayfalanmis loglar
  const toplamSayfa = Math.max(1, Math.ceil(filtreliLoglar.length / SAYFA_BOYUTU))
  const aktifSayfa = Math.min(sayfa, toplamSayfa)
  const sayfaLoglari = filtreliLoglar.slice((aktifSayfa - 1) * SAYFA_BOYUTU, aktifSayfa * SAYFA_BOYUTU)

  // Sayfa loglarini gune gore grupla (key: 'YYYY-MM-DD')
  const gunGruplari = useMemo(() => {
    const m = new Map()
    sayfaLoglari.forEach(l => {
      const d = new Date(l.tarih)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      if (!m.has(key)) m.set(key, { tarih: d, loglar: [] })
      m.get(key).loglar.push(l)
    })
    return [...m.entries()] // [key, {tarih, loglar}]
  }, [sayfaLoglari])

  // Yeni filtre/sayfa degisirse ilk gun otomatik acik, geri kalanlar kapali
  useEffect(() => {
    if (gunGruplari.length === 0) { setAcikGunler({}); return }
    setAcikGunler({ [gunGruplari[0][0]]: true })
  }, [filtreliLoglar.length, aktifSayfa])

  const gunBaslik = (d) => {
    const bugun = new Date()
    const dun = new Date(); dun.setDate(dun.getDate() - 1)
    const isSame = (a, b) => a.toDateString() === b.toDateString()
    if (isSame(d, bugun)) return 'Bugün'
    if (isSame(d, dun)) return 'Dün'
    return d.toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  }

  if (filtreliLoglar.length === 0) {
    return (
      <Card padding={0}>
        <div style={{ padding: 40 }}><EmptyState title="Henüz aktivite logu yok" /></div>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms' }}>
      {gunGruplari.map(([key, { tarih, loglar }]) => {
        const acik = !!acikGunler[key]
        const girisSayisi = loglar.filter(l => l.tip === 'kullanici_giris').length
        const toplamSure = loglar.filter(l => l.tip === 'sayfa_cikis').reduce((s, l) => s + (l.sureSaniye || 0), 0)
        return (
          <Card key={key} padding={0} style={{ overflow: 'hidden' }}>
            <button
              onClick={() => setAcikGunler(p => ({ ...p, [key]: !p[key] }))}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '12px 16px',
                background: acik ? 'var(--surface-sunken)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '700 12px/1 var(--font-sans)' }}>
                  {acik ? '−' : '+'}
                </span>
                <span style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{gunBaslik(tarih)}</span>
                <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                  {tarih.toLocaleDateString('tr-TR')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, font: '400 12px/16px var(--font-sans)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                <span><strong style={{ color: 'var(--text-primary)' }}>{loglar.length}</strong> olay</span>
                {girisSayisi > 0 && <span>{girisSayisi} giriş</span>}
                {toplamSure > 0 && <span>{saniyeFormat(toplamSure)} aktif</span>}
              </div>
            </button>
            {acik && (
              <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border-default)' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
                  <tbody>
                    {loglar.map(l => {
                      const tip = LOG_TIP[l.tip] || LOG_TIP.sayfa_giris
                      const IconC = tip.C
                      return (
                        <tr key={l.id} style={{ transition: 'background 120ms' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap', width: 1 }}>
                            <span style={{ font: '400 11px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                              {new Date(l.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Avatar name={l.kullaniciAd} size="xs" />
                              <span style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>{l.kullaniciAd}</span>
                            </span>
                          </td>
                          <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            <Badge tone={tip.tone} icon={<IconC size={11} strokeWidth={1.5} />}>{tip.isim}</Badge>
                          </td>
                          <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-default)', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)', maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {l.sayfa || l.aciklama || '—'}
                          </td>
                          <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-default)', font: '400 11.5px/16px var(--font-sans)', color: l.sureSaniye ? 'var(--text-secondary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            {l.sureSaniye ? saniyeFormat(l.sureSaniye) : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )
      })}

      {/* Sayfalama */}
      {toplamSayfa > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            Toplam <strong style={{ color: 'var(--text-primary)' }}>{filtreliLoglar.length}</strong> kayıt · Sayfa {aktifSayfa} / {toplamSayfa}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="secondary" size="sm" disabled={aktifSayfa === 1} onClick={() => setSayfa(1)}>İlk</Button>
            <Button variant="secondary" size="sm" disabled={aktifSayfa === 1} onClick={() => setSayfa(p => Math.max(1, p - 1))}>← Önceki</Button>
            <Button variant="secondary" size="sm" disabled={aktifSayfa === toplamSayfa} onClick={() => setSayfa(p => Math.min(toplamSayfa, p + 1))}>Sonraki →</Button>
            <Button variant="secondary" size="sm" disabled={aktifSayfa === toplamSayfa} onClick={() => setSayfa(toplamSayfa)}>Son</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function KullaniciYonetimi() {
  const { kullanicilar, kullaniciEkle, kullaniciSil, kullaniciGuncelle } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [form, setForm] = useState(bos)
  const [duzenle, setDuzenle] = useState(null)
  // Şifre sıfırlama state — sadece edit modunda kullanılır
  const [sifreSifirlaAcik, setSifreSifirlaAcik] = useState(false)
  const [yeniSifre, setYeniSifre] = useState('')
  const [sifreKaydediliyor, setSifreKaydediliyor] = useState(false)
  const [goster, setGoster] = useState(false)
  // Düzenle/Yeni Ekle açıldığında formun göründüğüne emin olmak için
  const formCardRef = useRef(null)
  const [aktifSekme, setAktifSekme] = useState('kullanicilar')
  const [aramaMetni, setAramaMetni] = useState('')
  const [seciliKullaniciId, setSeciliKullaniciId] = useState('hepsi')
  const [seciliGun, setSeciliGun] = useState('hepsi')
  const [isPending, startTransition] = useTransition()
  const [ayarlar, setAyarlar] = useState(() => JSON.parse(localStorage.getItem('sistem_ayarlari') || '{}'))
  const [ayarKaydedildi, setAyarKaydedildi] = useState(false)
  const [musteriler, setMusteriler] = useState([])
  const [kaydediliyor, setKaydediliyor] = useState(false)

  // Müşteri listesini bir kez yükle — "Bağlı müşteri" dropdown'u için
  useEffect(() => {
    musterileriGetir().then(setMusteriler)
  }, [])

  // Onay bekleyen self-kayıtlar
  const [bekleyenler, setBekleyenler] = useState([])
  const bekleyenleriYukle = async () => {
    try { setBekleyenler(await onayBekleyenleriGetir()) }
    catch (e) { console.warn('[onay] yükleme:', e.message) }
  }
  useEffect(() => { bekleyenleriYukle() }, [])

  const onayla = async (id, erisim, ek) => {
    try {
      await kullaniciOnayla(id, erisim, ek)
      toast.success('Kullanıcı onaylandı.')
      await bekleyenleriYukle()
      // Ana kullanıcı listesi AuthContext'ten geliyor; onaylanan kullanıcının
      // güncel tip/rol'ü görünsün diye sayfayı tazele.
      setTimeout(() => window.location.reload(), 700)
    } catch (e) { toast.error('Onaylanamadı: ' + e.message) }
  }
  const reddet = async (id) => {
    const neden = window.prompt('Reddetme nedeni (opsiyonel):') ?? null
    try {
      await kullaniciReddet(id, neden)
      toast.success('Başvuru reddedildi.')
      await bekleyenleriYukle()
    } catch (e) { toast.error('Reddedilemedi: ' + e.message) }
  }

  const ayarGuncelle = (alan, deger) => setAyarlar(p => ({ ...p, [alan]: deger }))

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
      .filter(l => seciliKullaniciId === 'hepsi' || String(l.kullaniciId) === String(seciliKullaniciId))
      .filter(l => {
        if (seciliGun === 'hepsi') return true
        const logT = new Date(l.tarih).toLocaleDateString('tr-TR')
        const bugun = new Date()
        if (seciliGun === 'bugun') return logT === bugun.toLocaleDateString('tr-TR')
        if (seciliGun === 'dun') {
          const d = new Date(bugun); d.setDate(d.getDate() - 1)
          return logT === d.toLocaleDateString('tr-TR')
        }
        if (seciliGun === 'bu_hafta') {
          const hb = new Date(bugun); hb.setDate(bugun.getDate() - bugun.getDay())
          return new Date(l.tarih) >= hb
        }
        return true
      }),
    [tumLoglar, seciliKullaniciId, seciliGun]
  )

  const kullaniciOzet = kullanicilar.map(k => {
    const kLoglari = tumLoglar.filter(l => String(l.kullaniciId) === String(k.id))
    const girisler = kLoglari.filter(l => l.tip === 'kullanici_giris')
    const sayfaSureleri = kLoglari.filter(l => l.tip === 'sayfa_cikis')
    const toplamSure = sayfaSureleri.reduce((s, l) => s + (l.sureSaniye || 0), 0)
    const sayfaSayilari = {}
    kLoglari.filter(l => l.tip === 'sayfa_giris').forEach(l => {
      sayfaSayilari[l.sayfa] = (sayfaSayilari[l.sayfa] || 0) + 1
    })
    const enCok = Object.entries(sayfaSayilari).sort((a, b) => b[1] - a[1])[0]
    return {
      ...k,
      toplamGiris: girisler.length,
      toplamSure,
      enCokSayfa: enCok?.[0] || '—',
      sonGiris: girisler[0]?.tarih,
    }
  })

  const modulToggle = (id) =>
    setForm(p => ({ ...p, moduller: p.moduller.includes(id) ? p.moduller.filter(m => m !== id) : [...p.moduller, id] }))

  const turToggle = (id) =>
    setForm(p => ({ ...p, izinliTurler: p.izinliTurler.includes(id) ? p.izinliTurler.filter(t => t !== id) : [...p.izinliTurler, id] }))

  const kaydet = async () => {
    if (kaydediliyor) return          // double-click guard
    setKaydediliyor(true)
    try {
      if (duzenle) {
        if (!form.ad || !form.kullaniciAdi) {
          toast.warning('Ad ve kullanıcı adı zorunludur.'); return
        }
        const { sifre, ...guncel } = form
        await kullaniciGuncelle(duzenle, guncel)
        toast.success(`${form.ad} güncellendi.`)
        setDuzenle(null)
      } else {
        if (!form.ad || !form.kullaniciAdi || !form.sifre) {
          toast.warning('Lütfen tüm alanları doldurun.'); return
        }
        if (form.sifre.length < 8) {
          toast.warning('Şifre en az 8 karakter olmalı.'); return
        }

        // 1. Ön kontrol: kullanicilar tablosunda aynı kullanici_adi var mı?
        const cakisma = (kullanicilar || []).find(
          k => k.kullaniciAdi?.toLowerCase() === form.kullaniciAdi.toLowerCase()
        )
        if (cakisma) {
          toast.error(`Bu kullanıcı adı zaten kullanılıyor: ${cakisma.ad}`)
          return
        }

        // 2. Supabase Auth kullanıcısı oluştur — ana client'ı kirletmeden,
        // UNIQUE storageKey ile ayrı bir client: GoTrueClient aynı
        // storage key'i paylaşınca admin token'ı deaktif olabiliyor.
        const email = `${form.kullaniciAdi.toLowerCase().replace(/[^a-z0-9]/g, '')}@zna.local`
        const tempClient = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
              storageKey: `sb-tempclient-${Date.now()}`,
            },
          },
        )
        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email,
          password: form.sifre,
          options: { data: { ad: form.ad, kullanici_adi: form.kullaniciAdi, tip: form.tip } },
        })
        // tempClient oturumunu derhal kapat — ana client'a sızmasın
        try { await tempClient.auth.signOut() } catch {}

        if (authError || !authData?.user) {
          const msg = authError?.message || 'bilinmeyen'
          if (/already registered|already exists/i.test(msg)) {
            toast.error(
              `Bu e-posta için Supabase Auth'ta kalıntı kayıt var (profil eksik). ` +
              `Supabase Dashboard → Authentication → Users'dan "${email}" satırını silin.`
            )
          } else {
            toast.error('Auth hatası: ' + msg)
          }
          return
        }

        // 3. kullanicilar profil satırı — ana (admin) client üzerinden
        console.info('[KullaniciEkle] auth oluştu, profil insert başlıyor', authData.user.id)
        const { sifre, ...profil } = form
        try {
          await kullaniciEkle({ ...profil, authId: authData.user.id, email })
          console.info('[KullaniciEkle] profil insert OK')
          toast.success(`${form.ad} eklendi.`)
        } catch (err) {
          console.error('[KullaniciYonetimi] profil insert hata:', err)
          toast.error(
            `Profil oluşturulamadı: ${err?.message || err?.code || 'bilinmeyen'}. ` +
            `Auth kaydı oluşmuş — yönetici Supabase Authentication'dan "${email}" satırını silmeli.`
          )
          return
        }
      }
    } finally {
      setKaydediliyor(false)
    }
    setForm(bos); setGoster(false)
  }

  const duzenleBasla = (k) => {
    setForm({
      ad: k.ad, kullaniciAdi: k.kullaniciAdi, sifre: '',
      moduller: k.moduller || [], tip: k.tip || 'zna',
      firmaAdi: k.firmaAdi || '', izinliTurler: k.izinliTurler || [],
      musteriId: k.musteriId ?? null,
    })
    setDuzenle(k.id); setGoster(true)
    // Form yukarıda açılıyor — kullanıcı listede aşağıdaysa görmesin diye
    // formun ortasına yumuşakça kaydır
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const iptal = () => {
    setForm(bos); setDuzenle(null); setGoster(false)
    setSifreSifirlaAcik(false); setYeniSifre('')
  }

  const logTemizle = async () => {
    const onay = await confirm({
      baslik: 'Logları Temizle',
      mesaj: 'Tüm aktivite logları kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      onayMetin: 'Evet, temizle', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    localStorage.removeItem('aktiviteLog')
    toast.success('Aktivite logları temizlendi.')
    setTimeout(() => window.location.reload(), 800)
  }

  const SEKMELER = [
    { id: 'kullanicilar', isim: 'Kullanıcılar' },
    { id: 'aktivite',     isim: 'Aktivite Logları' },
    { id: 'ozet',         isim: 'Özet Rapor' },
    { id: 'ayarlar',      isim: 'Sistem Ayarları', C: Settings },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Kullanıcı Yönetimi</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{kullanicilar.length}</span> kullanıcı
          </p>
        </div>
        {aktifSekme === 'kullanicilar' && !goster && (
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => {
            setGoster(true)
            setTimeout(() => formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
          }}>
            Yeni kullanıcı
          </Button>
        )}
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
        {SEKMELER.map(s => {
          const aktif = aktifSekme === s.id
          return (
            <button
              key={s.id}
              onClick={() => setAktifSekme(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                marginBottom: -1,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.C && <s.C size={14} strokeWidth={1.5} />}
              {s.isim}
            </button>
          )
        })}
      </div>

      {/* KULLANICILAR */}
      {aktifSekme === 'kullanicilar' && (
        <>
          {bekleyenler.length > 0 && (
            <Card style={{ marginBottom: 16, borderColor: 'var(--brand-primary)' }}>
              <h2 className="t-h2" style={{ marginBottom: 4 }}>
                Onay Bekleyenler <span className="tabular-nums" style={{ color: 'var(--brand-primary)' }}>({bekleyenler.length})</span>
              </h2>
              <p className="t-caption" style={{ marginBottom: 14 }}>
                Self-kayıt olan kullanıcılar. Erişim seviyesi seçip onaylayın veya reddedin.
              </p>
              {bekleyenler.map(k => (
                <OnaySatiri
                  key={k.id}
                  kullanici={k}
                  musteriler={musteriler}
                  moduller={tumModuller}
                  turler={ANA_TURLER}
                  onOnayla={onayla}
                  onReddet={reddet}
                />
              ))}
            </Card>
          )}
          {goster && (
            <Card ref={formCardRef} style={{ marginBottom: 16, scrollMarginTop: 16 }}>
              <h2 className="t-h2" style={{ marginBottom: 16 }}>{duzenle ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı Ekle'}</h2>

              <div style={{ marginBottom: 16 }}>
                <Label>Kullanıcı tipi</Label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { id: 'zna',     isim: 'ZNA Personeli',     aciklama: 'Dahili yönetim sistemi erişimi', C: Shield },
                    { id: 'musteri', isim: 'Müşteri Portalı',   aciklama: 'Talep oluşturma ve takip',       C: User },
                  ].map(t => {
                    const active = form.tip === t.id
                    const IconC = t.C
                    return (
                      <button
                        key={t.id}
                        onClick={() => setForm({ ...form, tip: t.id, moduller: t.id === 'musteri' ? [] : form.moduller })}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 16px',
                          borderRadius: 'var(--radius-md)',
                          background: active ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                          border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          textAlign: 'left', cursor: 'pointer',
                        }}
                      >
                        <IconC size={18} strokeWidth={1.5} style={{ color: active ? 'var(--brand-primary)' : 'var(--text-secondary)', flexShrink: 0 }} />
                        <div>
                          <div style={{ font: '500 14px/20px var(--font-sans)', color: active ? 'var(--brand-primary)' : 'var(--text-primary)' }}>
                            {t.isim}
                          </div>
                          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                            {t.aciklama}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
                <div>
                  <Label required>Ad Soyad</Label>
                  <Input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} placeholder="Ahmet Yılmaz" />
                </div>
                <div>
                  <Label required>Kullanıcı adı</Label>
                  <Input
                    value={form.kullaniciAdi}
                    onChange={e => setForm({ ...form, kullaniciAdi: e.target.value })}
                    placeholder="ahmet_y"
                    autoComplete="off"
                    name="kullanici_adi_yeni_kayit"
                  />
                </div>
                <div>
                  <Label required={!duzenle}>Şifre</Label>
                  {duzenle ? (
                    !sifreSifirlaAcik ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--border-default)',
                      }}>
                        <span style={{ flex: 1, font: '400 13px/20px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                          Kullanıcı kendi profilinden değiştirir
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            // Otomatik 12 karakter güvenli random şifre
                            const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
                            let s = ''
                            for (let i = 0; i < 12; i++) s += ch[Math.floor(Math.random() * ch.length)]
                            setYeniSifre(s)
                            setSifreSifirlaAcik(true)
                          }}
                          style={{
                            font: '600 11px/14px var(--font-sans)',
                            color: 'var(--brand-primary)',
                            background: 'transparent',
                            border: '1px solid var(--brand-primary)',
                            padding: '4px 10px',
                            borderRadius: 'var(--radius-pill)',
                            cursor: 'pointer',
                          }}
                        >
                          🔑 Şifre Sıfırla
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Input
                            type="text"
                            value={yeniSifre}
                            onChange={e => setYeniSifre(e.target.value)}
                            placeholder="En az 8 karakter"
                            autoComplete="off"
                            name="yeni_sifre_admin"
                            style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)' }}
                          />
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(yeniSifre)}
                            title="Kopyala"
                            style={{
                              padding: '0 10px',
                              border: '1px solid var(--border-default)',
                              background: 'var(--surface-card)',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              font: '600 12px/16px var(--font-sans)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            📋
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            disabled={sifreKaydediliyor || yeniSifre.length < 8}
                            onClick={async () => {
                              if (yeniSifre.length < 8) {
                                toast.warning('Şifre en az 8 karakter olmalı.')
                                return
                              }
                              setSifreKaydediliyor(true)
                              try {
                                const sonuc = await kullaniciSifreSifirla(duzenle, yeniSifre)
                                toast.success(`${sonuc?.hedefAd ?? 'Kullanıcı'} için şifre güncellendi.`)
                                // Şifreyi clipboard'a kopyala (admin'e kolaylık)
                                try { await navigator.clipboard?.writeText(yeniSifre) } catch {}
                                setSifreSifirlaAcik(false)
                                setYeniSifre('')
                              } catch (e) {
                                toast.error('Sıfırlanamadı: ' + (e?.message ?? 'bilinmeyen hata'))
                              } finally {
                                setSifreKaydediliyor(false)
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              background: 'var(--brand-primary)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 'var(--radius-sm)',
                              cursor: sifreKaydediliyor ? 'wait' : 'pointer',
                              font: '600 12px/16px var(--font-sans)',
                              opacity: (sifreKaydediliyor || yeniSifre.length < 8) ? 0.5 : 1,
                            }}
                          >
                            {sifreKaydediliyor ? 'Kaydediliyor…' : '✓ Bu Şifreyi Ata'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSifreSifirlaAcik(false); setYeniSifre('') }}
                            disabled={sifreKaydediliyor}
                            style={{
                              padding: '8px 12px',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              font: '500 12px/16px var(--font-sans)',
                            }}
                          >
                            Vazgeç
                          </button>
                        </div>
                        <div style={{ font: '400 11px/14px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                          Şifre kaydedildikten sonra otomatik panoya kopyalanır. Kullanıcıya iletmeyi unutmayın.
                        </div>
                      </div>
                    )
                  ) : (
                    <Input
                      type="password"
                      value={form.sifre}
                      onChange={e => setForm({ ...form, sifre: e.target.value })}
                      placeholder="En az 8 karakter"
                      autoComplete="new-password"
                      name="sifre_yeni_kayit"
                    />
                  )}
                </div>
              </div>

              {form.tip === 'musteri' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Label>Firma adı <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(görünen ad)</span></Label>
                    <Input value={form.firmaAdi} onChange={e => setForm({ ...form, firmaAdi: e.target.value })} placeholder="ABC Teknoloji A.Ş." />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <Label required>
                      Bağlı müşteri kaydı
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                        (talep açabilmek için zorunlu)
                      </span>
                    </Label>
                    <CustomSelect
                      value={form.musteriId ?? ''}
                      onChange={e => {
                        const id = e.target.value ? Number(e.target.value) : null
                        const m = musteriler.find(x => x.id === id)
                        setForm(p => ({ ...p, musteriId: id, firmaAdi: m?.firma || p.firmaAdi }))
                      }}
                    >
                      <option value="">— Müşteri seç —</option>
                      {musteriler.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.firma}{m.kod ? ` · ${m.kod}` : ''}
                        </option>
                      ))}
                    </CustomSelect>
                    {!form.musteriId && (
                      <p style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--warning)', marginTop: 6 }}>
                        <AlertTriangle size={12} strokeWidth={1.5} />
                        Bağlı müşteri seçilmezse kullanıcı portala giriş yapabilir ama talep açamaz.
                      </p>
                    )}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <Label>İzin verilen talep türleri <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(boş bırakılırsa tüm türler açık)</span></Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                      {ANA_TURLER.map(tur => {
                        const secili = form.izinliTurler.includes(tur.id)
                        return (
                          <label
                            key={tur.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                              padding: '8px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                              border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={secili}
                              onChange={() => turToggle(tur.id)}
                              style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                            />
                            <span style={{
                              font: secili ? '600 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                              color: secili ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            }}>
                              {tur.isim}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {form.izinliTurler.length === 0 && (
                      <p style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--warning)', marginTop: 6 }}>
                        <AlertTriangle size={12} strokeWidth={1.5} /> Hiçbir tür seçilmedi — müşteri tüm türleri görecek
                      </p>
                    )}
                  </div>
                </>
              )}

              {form.tip !== 'musteri' && (
                <div style={{ marginBottom: 16 }}>
                  <Label>Modül erişimleri</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {tumModuller.map(m => {
                      const secili = form.moduller.includes(m.id)
                      return (
                        <label
                          key={m.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                            border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={secili}
                            onChange={() => modulToggle(m.id)}
                            style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                          />
                          <span style={{
                            font: secili ? '500 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                            color: secili ? 'var(--brand-primary)' : 'var(--text-primary)',
                          }}>
                            {m.isim}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
                  {kaydediliyor ? 'Kaydediliyor…' : (duzenle ? 'Güncelle' : 'Kaydet')}
                </Button>
                <Button variant="secondary" onClick={iptal}>İptal</Button>
              </div>
            </Card>
          )}

          <KullaniciListesi
            kullanicilar={kullanicilar}
            kullaniciOzet={kullaniciOzet}
            tumModuller={tumModuller}
            ANA_TURLER={ANA_TURLER}
            aramaMetni={aramaMetni}
            setAramaMetni={setAramaMetni}
            onDuzenle={duzenleBasla}
            onSil={kullaniciSil}
          />
        </>
      )}

      {/* AKTİVİTE */}
      {aktifSekme === 'aktivite' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ minWidth: 200 }}>
                <CustomSelect value={seciliKullaniciId} onChange={e => startTransition(() => setSeciliKullaniciId(e.target.value))}>
                  <option value="hepsi">Tüm kullanıcılar</option>
                  {kullanicilar.map(k => <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
                </CustomSelect>
              </div>
              <div style={{ minWidth: 160 }}>
                <CustomSelect value={seciliGun} onChange={e => startTransition(() => setSeciliGun(e.target.value))}>
                  <option value="hepsi">Tüm zamanlar</option>
                  <option value="bugun">Bugün</option>
                  <option value="dun">Dün</option>
                  <option value="bu_hafta">Bu hafta</option>
                </CustomSelect>
              </div>
              <span className="t-caption"><span className="tabular-nums">{filtreliLoglar.length}</span> kayıt</span>
            </div>
            <Button variant="tertiary" size="sm" iconLeft={<Trash2 size={12} strokeWidth={1.5} />} onClick={logTemizle}>
              Logları temizle
            </Button>
          </div>

          <AktiviteLoglariBolumu
            filtreliLoglar={filtreliLoglar}
            isPending={isPending}
            saniyeFormat={saniyeFormat}
            LOG_TIP={LOG_TIP}
          />
        </div>
      )}

      {/* ÖZET */}
      {aktifSekme === 'ozet' && (
        <OzetRaporBolumu
          kullaniciOzet={kullaniciOzet}
          tumLoglar={tumLoglar}
          saniyeFormat={saniyeFormat}
        />
      )}

      {/* AYARLAR */}
      {aktifSekme === 'ayarlar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <Card>
            <h3 className="t-h2" style={{ marginBottom: 4 }}>Müşteri Portalı</h3>
            <p className="t-caption" style={{ marginBottom: 16 }}>Müşteri portalında görüntülenecek bağlantılar ve içerikler</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <Label>Ürün kataloğu / datasheet URL</Label>
                <p className="t-caption" style={{ marginBottom: 6 }}>
                  Müşteriler "Teklif İste" sayfasında bu linki görecek — tıklayarak ürün kataloğunu inceleyebilecekler.
                </p>
                <Input type="url" value={ayarlar.datasheetUrl || ''} onChange={e => ayarGuncelle('datasheetUrl', e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Destek telefon numarası</Label>
                <Input value={ayarlar.destekTelefon || ''} onChange={e => ayarGuncelle('destekTelefon', e.target.value)} placeholder="0212 xxx xx xx" />
              </div>
              <div>
                <Label>Destek e-posta</Label>
                <Input type="email" value={ayarlar.destekEposta || ''} onChange={e => ayarGuncelle('destekEposta', e.target.value)} placeholder="destek@firma.com" />
              </div>
            </div>
          </Card>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Button variant="primary" onClick={ayarlariKaydet}>Kaydet</Button>
            {ayarKaydedildi && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '500 13px/18px var(--font-sans)', color: 'var(--success)' }}>
                <CheckCircle2 size={14} strokeWidth={1.5} /> Ayarlar kaydedildi
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Onay bekleyen tek satır — erişim seviyesi + ek alan seçimi, onayla/reddet
function OnaySatiri({ kullanici, musteriler, moduller, turler, onOnayla, onReddet }) {
  const [erisim, setErisim] = useState('musteri')
  const [musteriId, setMusteriId] = useState('')
  const [seciliModuller, setSeciliModuller] = useState([])
  const [seciliTurler, setSeciliTurler] = useState([])
  const [isleniyor, setIsleniyor] = useState(false)

  const chip = (aktif) => ({
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    border: `1px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
    background: aktif ? 'var(--brand-primary)' : 'transparent',
    color: aktif ? '#fff' : 'var(--text-secondary)',
  })

  const togGenel = (arr, set, id) =>
    set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

  const onayDisabled = isleniyor || (erisim === 'musteri' && !musteriId)

  const tikla = async () => {
    setIsleniyor(true)
    await onOnayla(kullanici.id, erisim, {
      musteriId: erisim === 'musteri' ? (musteriId || null) : null,
      moduller: erisim === 'personel' ? seciliModuller : [],
      izinliTurler: erisim === 'personel' ? seciliTurler : [],
    })
    setIsleniyor(false)
  }

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div style={{ fontWeight: 700 }}>{kullanici.email}</div>
      <div className="t-caption" style={{ marginBottom: 10 }}>{kullanici.ad}</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {[['musteri', 'Müşteri'], ['personel', 'Personel'], ['yonetici', 'Yönetici']].map(([id, label]) => (
          <button key={id} type="button" style={chip(erisim === id)} onClick={() => setErisim(id)}>{label}</button>
        ))}
      </div>

      {erisim === 'musteri' && (
        <div style={{ marginBottom: 10 }}>
          <Label>Bağlı firma</Label>
          <CustomSelect
            value={musteriId ? String(musteriId) : ''}
            onChange={(e) => setMusteriId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Firma seçin…</option>
            {musteriler.map(m => (
              <option key={m.id} value={String(m.id)}>{m.firma}</option>
            ))}
          </CustomSelect>
        </div>
      )}

      {erisim === 'personel' && (
        <div style={{ marginBottom: 10 }}>
          <Label>Modüller</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {moduller.map(mod => (
              <button key={mod.id} type="button" style={chip(seciliModuller.includes(mod.id))}
                onClick={() => togGenel(seciliModuller, setSeciliModuller, mod.id)}>{mod.isim}</button>
            ))}
          </div>
          <Label>İzinli servis türleri</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {turler.map(t => (
              <button key={t.id} type="button" style={chip(seciliTurler.includes(t.id))}
                onClick={() => togGenel(seciliTurler, setSeciliTurler, t.id)}>{t.isim}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <Button variant="primary" disabled={onayDisabled} onClick={tikla}>
          {isleniyor ? 'İşleniyor…' : 'Onayla'}
        </Button>
        <Button variant="danger" disabled={isleniyor} onClick={() => onReddet(kullanici.id)}>Reddet</Button>
      </div>
    </div>
  )
}
