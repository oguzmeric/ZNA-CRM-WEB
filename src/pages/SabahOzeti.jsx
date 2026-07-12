// Yönetici Sabah Özeti — /sabah-ozeti (sadece Ali Uğur + Oğuz, App.jsx guard).
// Her sabah 08:00'de sabah-ozeti edge fn'i aynı kalemleri push olarak atar;
// bu sayfa anlık hesaplar — gün içinde de "durum ne?" diye bakılabilir.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sun, Compass, Wrench, AlertTriangle, FileText, Banknote,
  PackageMinus, FileSignature, KeyRound, ShoppingCart, Undo2, RefreshCw,
} from 'lucide-react'
import { Card, Button, EmptyState } from '../components/ui'
import { supabase } from '../lib/supabase'
import { kritikSeviyeUrunler } from '../services/depoService'
import { fmtTL } from '../components/FiloOrtak'
import { SkeletonList } from '../components/Skeleton'

const bugunStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
const fmtT = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const gunFarki = (t) => Math.ceil((new Date(t + 'T23:59:59') - new Date()) / 86400000)

export default function SabahOzeti() {
  const navigate = useNavigate()
  const [veri, setVeri] = useState(null)

  const yukle = async () => {
    const bugun = bugunStr()
    const gun30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    const [kesif, servisYeni, servisAktif, gorev, teklif, tahsilat, sozlesme, lisans, onSip, rma, kritik] = await Promise.all([
      supabase.from('kesifler').select('id, kesif_no, firma_adi, kesif_basligi').eq('kesif_tarihi', bugun).neq('durum', 'iptal').limit(15),
      supabase.from('servis_talepleri').select('id, talep_no, firma_adi, konu').gte('olusturma_tarihi', bugun + 'T00:00:00').limit(15),
      supabase.from('servis_talepleri').select('id, talep_no, firma_adi, konu, durum').in('durum', ['atandi', 'inceleniyor', 'devam_ediyor']).limit(15),
      supabase.from('gorevler').select('id, baslik, atanan_ad, bitis_tarihi').lt('bitis_tarihi', bugun).neq('durum', 'tamamlandi').order('bitis_tarihi').limit(15),
      supabase.from('teklifler').select('id, teklif_no, firma_adi, genel_toplam').eq('spek_durum', 'yon_onay_bekliyor').limit(15),
      supabase.from('satislar').select('id, firma_adi, genel_toplam, vade_tarihi').lt('vade_tarihi', bugun).neq('durum', 'odendi').neq('durum', 'iptal').order('vade_tarihi').limit(15),
      supabase.from('sozlesmeler').select('id, baslik, firma_adi, bitis_tarih, musteri:musteri_id (firma)').eq('aktif', true).lte('bitis_tarih', gun30).order('bitis_tarih').limit(15),
      supabase.from('trassir_lisanslar').select('id, firma_adi, proje, bitis_tarihi').lte('bitis_tarihi', gun30).gte('bitis_tarihi', '2000-01-01').order('bitis_tarihi').limit(15),
      supabase.from('on_siparisler').select('id, on_siparis_no, olusturma_tarih').eq('durum', 'onay_bekliyor').limit(15),
      supabase.from('stok_rma_kayitlari').select('id, tedarikci_ad, gonderim_tarih, tahmini_donus').is('geri_donus_tarih', null).limit(15),
      kritikSeviyeUrunler().catch(() => []),
    ])

    setVeri({
      kesifler: kesif.data || [],
      servisYeni: servisYeni.data || [],
      servisAktif: servisAktif.data || [],
      gecikenGorevler: gorev.data || [],
      onayBekleyenTeklifler: teklif.data || [],
      tahsilatlar: tahsilat.data || [],
      sozlesmeler: sozlesme.data || [],
      lisanslar: lisans.data || [],
      onSiparisler: onSip.data || [],
      rmalar: rma.data || [],
      kritikStok: (kritik || []).slice(0, 15),
    })
  }

  useEffect(() => { yukle() }, [])

  if (!veri) return <SkeletonList />

  const bolumler = [
    {
      baslik: 'Bugünkü Keşifler', ikon: Compass, renk: '#14b8a6',
      satirlar: veri.kesifler.map(k => ({
        id: k.id, ana: `${k.kesif_no} — ${k.firma_adi || ''}`, alt: k.kesif_basligi, hedef: `/kesifler/${k.id}`,
      })),
      bos: 'Bugün planlı keşif yok.',
    },
    {
      baslik: 'Bugün Açılan Servisler', ikon: Wrench, renk: '#3b82f6',
      satirlar: veri.servisYeni.map(s => ({
        id: s.id, ana: `${s.talep_no || '#' + s.id} — ${s.firma_adi || ''}`, alt: s.konu, hedef: `/servis-talepleri/${s.id}`,
      })),
      bos: 'Bugün yeni servis talebi açılmadı.',
    },
    {
      baslik: 'Devam Eden Servisler', ikon: Wrench, renk: '#8b5cf6',
      satirlar: veri.servisAktif.map(s => ({
        id: s.id, ana: `${s.talep_no || '#' + s.id} — ${s.firma_adi || ''}`, alt: s.konu, hedef: `/servis-talepleri/${s.id}`,
      })),
      bos: 'İşlemde servis yok.',
    },
    {
      baslik: 'Geciken Görevler', ikon: AlertTriangle, renk: '#dc2626',
      satirlar: veri.gecikenGorevler.map(g => ({
        id: g.id, ana: g.baslik, alt: `${g.atanan_ad || '—'} · ${-gunFarki(g.bitis_tarihi)} gün gecikti`, hedef: `/gorevler/${g.id}`,
      })),
      bos: 'Geciken görev yok 🎉',
    },
    {
      baslik: 'Onay Bekleyen Teklifler', ikon: FileText, renk: '#f59e0b',
      satirlar: veri.onayBekleyenTeklifler.map(t => ({
        id: t.id, ana: `${t.teklif_no || '#' + t.id} — ${t.firma_adi || ''}`, alt: t.genel_toplam ? fmtTL(t.genel_toplam) : null, hedef: `/teklifler/${t.id}`,
      })),
      bos: 'Onay bekleyen teklif yok.',
    },
    {
      baslik: 'Vadesi Geçen Tahsilatlar', ikon: Banknote, renk: '#dc2626',
      satirlar: veri.tahsilatlar.map(s => ({
        id: s.id, ana: s.firma_adi || '—', alt: `${fmtTL(s.genel_toplam)} · vade ${fmtT(s.vade_tarihi)}`, hedef: `/satislar/${s.id}`,
      })),
      bos: 'Vadesi geçen tahsilat yok.',
    },
    {
      baslik: 'Kritik Stok', ikon: PackageMinus, renk: '#dc2626',
      satirlar: veri.kritikStok.map(u => ({
        id: u.id, ana: u.stok_adi, alt: `${u.satilabilir ?? u.gercek_bakiye} adet kaldı (min ${u.min_stok})`, hedef: '/stok-kritik',
      })),
      bos: 'Kritik seviyede ürün yok.',
    },
    {
      baslik: 'Bitecek Sözleşmeler (30 gün)', ikon: FileSignature, renk: '#f59e0b',
      satirlar: veri.sozlesmeler.map(s => ({
        id: s.id, ana: s.baslik, alt: `${s.musteri?.firma || s.firma_adi || ''} · bitiş ${fmtT(s.bitis_tarih)}`, hedef: '/sozlesmeler',
      })),
      bos: '30 gün içinde biten sözleşme yok.',
    },
    {
      baslik: 'Bitecek Trassir Lisansları (30 gün)', ikon: KeyRound, renk: '#f59e0b',
      satirlar: veri.lisanslar.map(l => ({
        id: l.id, ana: l.firma_adi || l.proje || '—', alt: `bitiş ${fmtT(l.bitis_tarihi)}`, hedef: '/lisanslar',
      })),
      bos: '30 gün içinde biten lisans yok.',
    },
    {
      baslik: 'Açık Ön Siparişler', ikon: ShoppingCart, renk: '#3b82f6',
      satirlar: veri.onSiparisler.map(o => ({
        id: o.id, ana: o.on_siparis_no || `#${o.id}`, alt: `açılış ${fmtT(o.olusturma_tarih)}`, hedef: '/siparis-onaylari',
      })),
      bos: 'Onay bekleyen ön sipariş yok.',
    },
    {
      baslik: 'Serviste Bekleyen Cihazlar (RMA)', ikon: Undo2, renk: '#8b5cf6',
      satirlar: veri.rmalar.map(r => ({
        id: r.id, ana: r.tedarikci_ad || 'Servis', alt: `gönderim ${fmtT(r.gonderim_tarih)}${r.tahmini_donus ? ` · tahmini dönüş ${fmtT(r.tahmini_donus)}` : ''}`, hedef: '/depo-raporlar',
      })),
      bos: 'Serviste bekleyen cihaz yok.',
    },
  ]

  const toplamIs = bolumler.reduce((t, b) => t + b.satirlar.length, 0)

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sun size={22} strokeWidth={1.75} style={{ color: '#f59e0b' }} /> Sabah Özeti
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} ·
            {' '}<strong>{toplamIs}</strong> takip kalemi · her sabah 08:00'de telefona da gelir
          </p>
        </div>
        <Button variant="secondary" iconLeft={<RefreshCw size={14} strokeWidth={1.5} />} onClick={() => { setVeri(null); yukle() }}>
          Yenile
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 14 }}>
        {bolumler.map(b => {
          const Icon = b.ikon
          return (
            <Card key={b.baslik} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
                background: 'var(--surface-sunken)',
              }}>
                <Icon size={15} strokeWidth={1.75} style={{ color: b.renk }} />
                <span style={{ font: '600 13px/18px var(--font-sans)' }}>{b.baslik}</span>
                <span style={{
                  marginLeft: 'auto', minWidth: 24, textAlign: 'center',
                  padding: '1px 8px', borderRadius: 999,
                  background: b.satirlar.length > 0 ? `${b.renk}18` : 'var(--surface-card)',
                  color: b.satirlar.length > 0 ? b.renk : 'var(--text-muted)',
                  font: '700 12px/18px var(--font-sans)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {b.satirlar.length}
                </span>
              </div>
              {b.satirlar.length === 0 ? (
                <p style={{ padding: '12px 14px', margin: 0, font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                  {b.bos}
                </p>
              ) : (
                <div style={{ maxHeight: 230, overflowY: 'auto' }}>
                  {b.satirlar.map(s => (
                    <div
                      key={s.id}
                      onClick={() => navigate(s.hedef)}
                      style={{
                        padding: '8px 14px', cursor: 'pointer',
                        borderBottom: '1px solid var(--border-default)',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ font: '500 12.5px/17px var(--font-sans)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.ana}
                      </div>
                      {s.alt && (
                        <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.alt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
