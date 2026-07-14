// Bayi sözleşmesi modalleri — hem Sözleşmeler sayfası hem BayiDetay kullanır.
// YeniSozlesmeWizard: tip → bayi (eksik zorunlu bilgi engeli) → bilgiler → Sözleşme Üret
// SozlesmeGoruntuleModal: içerik + Yazdır + Bayiye Gönder + İmzalı PDF + Revize/İptal

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Send, FileUp, ExternalLink, RotateCcw, XCircle, AlertTriangle } from 'lucide-react'
import { Button, Modal, Input, Label, Badge, Textarea } from './ui'
import CustomSelect from './CustomSelect'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { belgePaylas } from '../services/belgePaylasimService'
import {
  SOZLESME_VARSAYILANLARI, SOZLESME_DURUMLARI, ODEME_TIPLERI, TEMINAT_TIPLERI,
  bayiEksikAlanlar, firmaninSozlesmeleri, yasayanSozlesme, MUKERRER_UYARI,
  sozlesmeUret, sozlesmeGonderildiIsaretle, sozlesmeRevize, sozlesmeGuncelleDb,
  imzaliSozlesmeYukle, bayiDosyaUrl, bayiBildirim,
} from '../services/bayiService'

// Bayi sözleşmesi belge formatı — satış sözleşmesiyle aynı görsel dil:
// her baskı sayfasında ZNA logosu + sözleşme no üstte, kaşe/imza şeridi altta.
// İçerik düz metin olarak saklanır; format görüntüleme/yazdırma anında giydirilir.
export const bayiSozlesmeYazdirHtml = (sozlesme, firma, { otomatikYazdir = false } = {}) => {
  const metin = (sozlesme.uretilenIcerik || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><base href="${origin}/">
<title>${sozlesme.sozlesmeNo || 'Bayi Sözleşmesi'}</title>
<style>
  body { margin: 0; color: #111; }
  .bs-ust { position: fixed; top: 0; left: 0; right: 0; height: 58px; display: flex;
    align-items: center; justify-content: space-between; padding: 6px 0 4px;
    border-bottom: 1.5px solid #1E5AA8; background: #fff; }
  .bs-ust img { height: 40px; object-fit: contain; }
  .bs-ust .no { font: 700 10pt/1.25 'Times New Roman', serif; color: #1E5AA8; text-align: right; }
  .bs-ust .no span { font-weight: 400; color: #555; }
  .bs-alt { position: fixed; bottom: 0; left: 0; right: 0; height: 52px;
    border-top: 1px solid #999; background: #fff; display: flex; justify-content: space-between;
    padding-top: 4px; font: 600 8.5pt/1.3 'Times New Roman', serif; color: #444; }
  .bs-icerik { margin: 74px 0 64px; }
  pre { white-space: pre-wrap; font: 12pt/1.55 'Times New Roman', serif; margin: 0; }
  @page { margin: 18mm 14mm; }
</style></head><body>
  <div class="bs-ust">
    <img src="/logo.jpeg" alt="ZNA Teknoloji" />
    <div class="no">${sozlesme.sozlesmeNo || ''}<br/><span>Yetkili Dış Bayilik ve Deal Register Sözleşmesi</span></div>
  </div>
  <div class="bs-alt">
    <div>ZNA TEKNOLOJİ — Kaşe / İmza:</div>
    <div style="text-align:right">BAYİ${firma?.firmaAdi ? ` (${firma.firmaAdi})` : ''} — Kaşe / İmza:</div>
  </div>
  <div class="bs-icerik"><pre>${metin}</pre></div>
  ${otomatikYazdir ? '<scr' + 'ipt>window.onload = () => setTimeout(() => window.print(), 350)</scr' + 'ipt>' : ''}
</body></html>`
}

const bugun = () => new Date().toISOString().slice(0, 10)

const aySonrasi = (baslangic, ay) => {
  const d = new Date(baslangic || bugun())
  if (isNaN(d)) return ''
  d.setMonth(d.getMonth() + Number(ay || 12))
  return d.toISOString().slice(0, 10)
}

// ---------------- Yeni Sözleşme Sihirbazı ----------------

export function YeniSozlesmeWizard({ firmalar, secilenFirmaId, sablonlar, kullanici, onKapat, onOlustu }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [firmaId, setFirmaId] = useState(secilenFirmaId ? String(secilenFirmaId) : '')
  const [sablonId, setSablonId] = useState('')
  const [mevcutYasayan, setMevcutYasayan] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [form, setForm] = useState({
    sozlesmeTarihi: bugun(),
    baslangicTarih: bugun(),
    sureAy: SOZLESME_VARSAYILANLARI.sureAy,
    bitisTarih: aySonrasi(bugun(), SOZLESME_VARSAYILANLARI.sureAy),
    yillikHedefUsd: SOZLESME_VARSAYILANLARI.yillikHedefUsd,
    statuMetni: SOZLESME_VARSAYILANLARI.statuMetni,
    odemeTipi: 'pesin', vadeGunu: '', krediLimiti: '',
    teminatIstegi: false, teminatTipi: '',
    imzaYetkilisi: 'Ali Uğur Aktepe', // sözleşme metnindeki ZNA imza yetkilisi
  })

  const bayiSablonlari = useMemo(() => (sablonlar || []).filter(s => s.tip === 'bayi' && s.aktif), [sablonlar])
  useEffect(() => {
    if (!sablonId && bayiSablonlari.length) setSablonId(String(bayiSablonlari[0].id))
  }, [bayiSablonlari, sablonId])

  const firma = useMemo(() => (firmalar || []).find(f => String(f.id) === firmaId) || null, [firmalar, firmaId])
  const eksikler = useMemo(() => firma ? bayiEksikAlanlar(firma) : [], [firma])

  // Bayi seçilince mükerrer sözleşme kontrolü
  useEffect(() => {
    setMevcutYasayan(null)
    if (!firma) return
    let iptal = false
    firmaninSozlesmeleri(firma.id).then(list => {
      if (!iptal) setMevcutYasayan(yasayanSozlesme(list))
    })
    return () => { iptal = true }
  }, [firma])

  const alan = (k, v) => setForm(f => {
    const yeni = { ...f, [k]: v }
    if (k === 'baslangicTarih' || k === 'sureAy') {
      yeni.bitisTarih = aySonrasi(k === 'baslangicTarih' ? v : f.baslangicTarih, k === 'sureAy' ? v : f.sureAy)
    }
    return yeni
  })

  const uretilebilir = firma && !eksikler.length && !mevcutYasayan && sablonId

  const uret = async () => {
    if (!uretilebilir) return
    setKaydediliyor(true)
    const sablon = bayiSablonlari.find(s => String(s.id) === sablonId)
    const sonuc = await sozlesmeUret({ firma, sablon, form, kullanici })
    setKaydediliyor(false)
    if (sonuc?._hata) { toast.error(sonuc._hata); return }
    toast.success(`Sözleşme üretildi: ${sonuc.sozlesmeNo}`)
    onOlustu?.(sonuc)
  }

  return (
    <Modal open onClose={onKapat} title="Yeni Sözleşme Oluştur" width={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Adım 1 — tip + şablon */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Sözleşme tipi</Label>
            <CustomSelect value="bayi" onChange={() => {}}>
              <option value="bayi">Bayi Sözleşmesi</option>
              <option value="" disabled>Müşteri satış / Bakım / Servis — yakında</option>
            </CustomSelect>
          </div>
          <div>
            <Label>Şablon</Label>
            <CustomSelect value={sablonId} onChange={e => setSablonId(e.target.value)}>
              {bayiSablonlari.map(s => <option key={s.id} value={s.id}>{s.ad} (v{s.versiyon})</option>)}
              {!bayiSablonlari.length && <option value="">Aktif bayi şablonu yok</option>}
            </CustomSelect>
          </div>
        </div>

        {/* Adım 2 — bayi seçimi */}
        <div>
          <Label required>Bayi</Label>
          <CustomSelect value={firmaId} onChange={e => setFirmaId(e.target.value)}>
            <option value="">Bayi seçin…</option>
            {(firmalar || []).map(f => <option key={f.id} value={f.id}>{f.firmaAdi}{f.kod ? ` (${f.kod})` : ''}</option>)}
          </CustomSelect>
        </div>

        {firma && eksikler.length > 0 && (
          <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '600 13px/18px var(--font-sans)', color: 'var(--danger)', marginBottom: 6 }}>
              <AlertTriangle size={15} strokeWidth={1.75} />
              Bayi sözleşmesi oluşturulamaz. Bayi kartında eksik zorunlu bilgiler bulunmaktadır.
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, font: '400 12.5px/20px var(--font-sans)', color: 'var(--danger)' }}>
              {eksikler.map(e => <li key={e.alan}>{e.isim}</li>)}
            </ul>
            <Button variant="secondary" size="sm" style={{ marginTop: 10 }} onClick={() => navigate(`/bayiler/${firma.id}`)}>
              Bayi kartını tamamla
            </Button>
          </div>
        )}

        {firma && mevcutYasayan && (
          <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 'var(--radius-md)', padding: '12px 14px', font: '400 13px/19px var(--font-sans)', color: 'var(--text-primary)' }}>
            <strong>{mevcutYasayan.sozlesmeNo}</strong> — {MUKERRER_UYARI}
          </div>
        )}

        {/* Adım 3 — sözleşme bilgileri */}
        {firma && !eksikler.length && !mevcutYasayan && (
          <>
            <div style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-default)', paddingBottom: 4 }}>
              Genel Bilgiler
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div>
                <Label>Sözleşme tarihi</Label>
                <Input type="date" value={form.sozlesmeTarihi} onChange={e => alan('sozlesmeTarihi', e.target.value)} />
              </div>
              <div>
                <Label>Başlangıç</Label>
                <Input type="date" value={form.baslangicTarih} onChange={e => alan('baslangicTarih', e.target.value)} />
              </div>
              <div>
                <Label>Süre (ay)</Label>
                <Input type="number" className="sayi-sade" value={form.sureAy} onChange={e => alan('sureAy', e.target.value)} />
              </div>
              <div>
                <Label>Bitiş</Label>
                <Input type="date" value={form.bitisTarih} onChange={e => alan('bitisTarih', e.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>Yıllık hedef (USD, KDV hariç net ciro)</Label>
                <Input type="number" className="sayi-sade" value={form.yillikHedefUsd} onChange={e => alan('yillikHedefUsd', e.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <Label>İmza yetkilisi (ZNA)</Label>
                <Input value={form.imzaYetkilisi} onChange={e => alan('imzaYetkilisi', e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Label>Bayi statüsü metni</Label>
                <Input value={form.statuMetni} onChange={e => alan('statuMetni', e.target.value)} />
              </div>
            </div>

            <div style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-default)', paddingBottom: 4 }}>
              Finansal Bilgiler
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div>
                <Label>Ödeme tipi</Label>
                <CustomSelect value={form.odemeTipi} onChange={e => alan('odemeTipi', e.target.value)}>
                  {ODEME_TIPLERI.map(o => <option key={o.id} value={o.id}>{o.isim}</option>)}
                </CustomSelect>
              </div>
              <div>
                <Label>Vade günü</Label>
                <Input type="number" className="sayi-sade" value={form.vadeGunu} disabled={form.odemeTipi !== 'vadeli'}
                  onChange={e => alan('vadeGunu', e.target.value)} placeholder="30 / 45 / 60" />
              </div>
              <div>
                <Label>Kredi limiti (USD)</Label>
                <Input type="number" className="sayi-sade" value={form.krediLimiti} onChange={e => alan('krediLimiti', e.target.value)} />
              </div>
              <div>
                <Label>Teminat</Label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={form.teminatIstegi} onChange={e => alan('teminatIstegi', e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: 'var(--brand-primary)' }} />
                    İsteniyor
                  </label>
                </div>
              </div>
              {form.teminatIstegi && (
                <div>
                  <Label>Teminat tipi</Label>
                  <CustomSelect value={form.teminatTipi} onChange={e => alan('teminatTipi', e.target.value)}>
                    <option value="">Seçin…</option>
                    {TEMINAT_TIPLERI.map(t => <option key={t} value={t}>{t}</option>)}
                  </CustomSelect>
                </div>
              )}
            </div>

            {form.odemeTipi === 'vadeli' && (
              <div style={{ background: 'var(--warning-soft)', borderRadius: 'var(--radius-md)', padding: '10px 12px', font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                Vade talebi olduğu için <strong>Son Mizan</strong> evrakı zorunlu olacak ve bayi
                aktif edilmeden önce <strong>Finans onayı</strong> gerekecek.
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={uret} disabled={!uretilebilir || kaydediliyor}>
            {kaydediliyor ? 'Üretiliyor…' : 'Sözleşme Üret'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------- Sözleşme Görüntüle / Yönet ----------------

export function SozlesmeGoruntuleModal({ sozlesme, firma, sablonlar, kullanici, onKapat, onDegisti }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const pdfRef = useRef(null)
  const [gonderAcik, setGonderAcik] = useState(false)
  const [email, setEmail] = useState(firma?.yetkiliEposta || firma?.email || '')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [revizeAcik, setRevizeAcik] = useState(false)
  const [revizeSebep, setRevizeSebep] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const durum = SOZLESME_DURUMLARI[sozlesme.durum] || SOZLESME_DURUMLARI.olusturuldu
  const yasiyor = ['olusturuldu', 'imza_bekleniyor', 'imzalandi'].includes(sozlesme.durum)

  const yazdir = () => {
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) { toast.error('Açılır pencere engellendi.'); return }
    w.document.write(bayiSozlesmeYazdirHtml(sozlesme, firma, { otomatikYazdir: true }))
    w.document.close()
  }

  const gonder = async () => {
    if (!email.trim()) { toast.error('E-posta adresi girin.'); return }
    setGonderiliyor(true)
    try {
      const evrakListesi = [
        'İmza Sirküleri', 'Vergi Levhası', 'Faaliyet Belgesi (son 6 ay)', 'Ticaret Sicil Gazetesi',
        ...(firma?.vadeTalebi ? ['Son Mizan (vade talebiniz nedeniyle)'] : []),
      ].join(', ')
      const sonTarih = new Date(Date.now() + 14 * 86400000).toLocaleDateString('tr-TR')
      await belgePaylas({
        belge_tipi: 'bayi_sozlesme',
        belge_id: sozlesme.id,
        kanal: 'mail',
        email: email.trim(),
        sure_gun: 30,
        ozel_mesaj:
          `Sözleşmeyi kaşeleyip imzalayarak PDF olarak tarafımıza iletiniz. ` +
          `Talep edilen evraklar: ${evrakListesi}. Geri dönüş için son tarih: ${sonTarih}.`,
      })
      await sozlesmeGonderildiIsaretle(sozlesme)
      bayiBildirim(firma, 'Sözleşme bayiye gönderildi', `${sozlesme.sozlesmeNo} — ${firma?.firmaAdi} adresine e-posta ile iletildi.`)
      toast.success('Sözleşme bayiye e-posta ile gönderildi. Durum: İmza Bekleniyor')
      setGonderAcik(false)
      onDegisti?.()
    } catch (e) {
      toast.error('Gönderilemedi: ' + e.message)
    } finally {
      setGonderiliyor(false)
    }
  }

  const imzaliYukle = async (file) => {
    if (!file) return
    setMesgul(true)
    const sonuc = await imzaliSozlesmeYukle({ sozlesme, file, kullanici })
    setMesgul(false)
    if (sonuc?._hata) { toast.error(sonuc._hata); return }
    toast.success('İmzalı sözleşme yüklendi. Durum: İmzalandı — evrak kontrolü başlayabilir.')
    onDegisti?.()
  }

  const imzaliAc = async () => {
    const url = await bayiDosyaUrl(sozlesme.imzaliPdfUrl)
    if (url) window.open(url, '_blank')
    else toast.error('Dosya açılamadı.')
  }

  const revize = async () => {
    if (!revizeSebep.trim()) { toast.error('Revizyon sebebi girin.'); return }
    setMesgul(true)
    const sablon = (sablonlar || []).find(s => s.id === sozlesme.sablonId) || (sablonlar || []).find(s => s.tip === 'bayi' && s.aktif)
    const sonuc = await sozlesmeRevize({ sozlesme, firma, sablon, sebep: revizeSebep.trim(), kullanici })
    setMesgul(false)
    if (sonuc?._hata) { toast.error(sonuc._hata); return }
    toast.success(`Revize sözleşme üretildi: ${sonuc.sozlesmeNo} (v${sonuc.versiyon})`)
    onDegisti?.()
    onKapat?.()
  }

  const iptalEt = async () => {
    const onay = await confirm({
      baslik: 'Sözleşmeyi İptal Et',
      mesaj: `${sozlesme.sozlesmeNo} iptal edilsin mi? Bayi için yeni sözleşme oluşturulabilir hale gelir.`,
      onayMetin: 'İptal Et', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const g = await sozlesmeGuncelleDb(sozlesme.id, { durum: 'iptal' })
    if (g?._hata) { toast.error(g._hata); return }
    toast.success('Sözleşme iptal edildi.')
    onDegisti?.()
    onKapat?.()
  }

  return (
    <Modal open onClose={onKapat} title={`${sozlesme.sozlesmeNo} — ${firma?.firmaAdi || ''}`} width={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={durum.tone}>{durum.isim}</Badge>
          <Badge tone="neutral">v{sozlesme.versiyon || 1}</Badge>
          {sozlesme.bitisTarih && <span className="t-caption">Bitiş: {new Date(sozlesme.bitisTarih).toLocaleDateString('tr-TR')}</span>}
          {sozlesme.revizyonSebebi && <span className="t-caption">Revizyon: {sozlesme.revizyonSebebi}</span>}
        </div>

        {/* Belge görünümü — yazdırma çıktısıyla aynı görsel dil (logo + Times) */}
        <div style={{
          maxHeight: '56vh', overflow: 'auto', background: '#fff',
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '20px 28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1.5px solid #1E5AA8', paddingBottom: 6, marginBottom: 16 }}>
            <img src="/logo.jpeg" alt="ZNA Teknoloji" style={{ height: 36, objectFit: 'contain' }} />
            <div style={{ font: "700 12px/1.3 'Times New Roman', serif", color: '#1E5AA8', textAlign: 'right' }}>
              {sozlesme.sozlesmeNo}<br />
              <span style={{ fontWeight: 400, color: '#555' }}>Yetkili Dış Bayilik ve Deal Register Sözleşmesi</span>
            </div>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: "400 13.5px/1.6 'Times New Roman', Georgia, serif", color: '#111' }}>
            {sozlesme.uretilenIcerik || 'Sözleşme içeriği bulunamadı.'}
          </pre>
        </div>

        {/* Gönderim mini formu */}
        {gonderAcik && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--brand-primary-soft)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ flex: 1 }}>
              <Label>Bayi e-posta adresi</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="yetkili@bayi.com" />
            </div>
            <Button variant="primary" onClick={gonder} disabled={gonderiliyor}>
              {gonderiliyor ? 'Gönderiliyor…' : 'E-posta Gönder'}
            </Button>
            <Button variant="ghost" onClick={() => setGonderAcik(false)}>Vazgeç</Button>
          </div>
        )}

        {/* Revize mini formu */}
        {revizeAcik && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--warning-soft)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ flex: 1 }}>
              <Label>Revizyon sebebi</Label>
              <Textarea rows={2} value={revizeSebep} onChange={e => setRevizeSebep(e.target.value)} placeholder="Örn: vade koşulları güncellendi" />
            </div>
            <Button variant="primary" onClick={revize} disabled={mesgul}>Revize Üret</Button>
            <Button variant="ghost" onClick={() => setRevizeAcik(false)}>Vazgeç</Button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button variant="secondary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={yazdir}>
            Yazdır / PDF
          </Button>
          {yasiyor && sozlesme.durum !== 'imzalandi' && (
            <Button variant="secondary" iconLeft={<Send size={14} strokeWidth={1.5} />} onClick={() => setGonderAcik(v => !v)}>
              Bayiye Gönder
            </Button>
          )}
          {yasiyor && (
            sozlesme.imzaliPdfUrl ? (
              <Button variant="secondary" iconLeft={<ExternalLink size={14} strokeWidth={1.5} />} onClick={imzaliAc}>
                İmzalı PDF'i Aç
              </Button>
            ) : (
              <Button variant="secondary" iconLeft={<FileUp size={14} strokeWidth={1.5} />} onClick={() => pdfRef.current?.click()} disabled={mesgul}>
                İmzalı PDF Yükle
              </Button>
            )
          )}
          {yasiyor && (
            <Button variant="secondary" iconLeft={<RotateCcw size={14} strokeWidth={1.5} />} onClick={() => setRevizeAcik(v => !v)}>
              Revize Et
            </Button>
          )}
          {yasiyor && (
            <Button variant="ghost" iconLeft={<XCircle size={14} strokeWidth={1.5} />} onClick={iptalEt} style={{ color: 'var(--danger)' }}>
              İptal Et
            </Button>
          )}
        </div>
        <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={e => { imzaliYukle(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </Modal>
  )
}
