// Siparişin TEDARİKÇİ (alış) faturaları — mig 249.
//
// ⚠️ Bu kart GELEN faturaları gösterir: tedarikçi bize kesiyor, gider tarafı.
// Sayfadaki "Fatura Kesilecek" butonu ise GİDEN (müşteriye) proformayı açar.
// İkisi karışmasın diye başlıkta ve butonda "Tedarikçi" kelimesi zorunlu.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Truck, Upload, FileText, Trash2, Search, Plus, Pencil } from 'lucide-react'
import { Card, CardTitle, Button, Badge, Input, Label, Textarea, Modal } from './ui'
import BelgeOnizlemeModal from './BelgeOnizlemeModal'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import {
  alisFaturalariGetir, alisFaturaEkle, alisFaturaDuzenle, alisFaturaSil, alisFaturaDosyaUrl,
  tedarikciAra, tedarikToplami,
} from '../services/alisFaturaService'

const PARA_SEMBOL = { TL: '₺', USD: '$', EUR: '€' }
const fmtPara = (n, pb = 'TL') =>
  `${PARA_SEMBOL[pb] || pb} ${(Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'

const BOS_FORM = {
  tedarikciAd: '', vergiNo: '', faturaNo: '', faturaTarihi: '', ettn: '',
  paraBirimi: 'TL', araToplam: '', kdvToplam: '', genelToplam: '', aciklama: '',
}

export default function AlisFaturaKarti({ siparis }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { kullanici } = useAuth()

  const [faturalar, setFaturalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  // null = kapalı | 'yeni' = ekleme | kayıt nesnesi = düzenleme
  const [modal, setModal] = useState(null)
  const [belge, setBelge] = useState(null)   // { url, baslik, indirmeAdi }

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setFaturalar(await alisFaturalariGetir(siparis?.id))
    setYukleniyor(false)
  }, [siparis?.id])

  useEffect(() => { yukle() }, [yukle])

  const belgeAc = async (f) => {
    const url = await alisFaturaDosyaUrl(f.dosyaYol)
    if (!url) { toast.error('Belge açılamadı. Dosya taşınmış olabilir.'); return }
    const uz = (f.dosyaYol.split('.').pop() || 'pdf').toLowerCase()
    const temiz = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '-')
    setBelge({
      url,
      baslik: `${f.tedarikciAd} — ${f.faturaNo}`,
      indirmeAdi: `${temiz(siparis?.siparisNo || 'siparis')} - ${temiz(f.tedarikciAd)} - ${temiz(f.faturaNo)}.${uz}`,
    })
  }

  const sil = async (f) => {
    const onay = await confirm({
      baslik: 'Tedarikçi Faturasını Sil',
      mesaj: `${f.tedarikciAd} — ${f.faturaNo} kaydı ve yüklenen dosya kalıcı olarak silinecek. Devam edilsin mi?`,
      onayMetin: 'Sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    const sonuc = await alisFaturaSil(f)
    if (sonuc?._hata) { toast.error('Silinemedi: ' + sonuc._hata); return }
    toast.success('Tedarikçi faturası silindi.')
    yukle()
  }

  const toplamlar = tedarikToplami(faturalar)

  return (
    <>
      <Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <CardTitle style={{ margin: 0 }}>
            <Truck size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
            Tedarikçi Faturaları
          </CardTitle>
          {faturalar.length > 0 && <Badge tone="neutral">{faturalar.length}</Badge>}
        </div>
        <p style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>
          Bu siparişi karşılamak için tedarikçiden alınan mal/hizmetin <strong>bize kesilen</strong> faturaları.
        </p>

        {yukleniyor ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : faturalar.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            Henüz tedarikçi faturası yüklenmedi.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {faturalar.map(f => (
              <div key={f.id} style={{
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                padding: '8px 10px', background: 'var(--surface-sunken)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, wordBreak: 'break-word' }}>{f.tedarikciAd}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      {f.faturaNo} · {fmtTarih(f.faturaTarihi)}
                    </div>
                  </div>
                  <strong style={{ fontSize: 12.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtPara(f.genelToplam, f.paraBirimi)}
                  </strong>
                </div>
                {f.aciklama && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 3 }}>{f.aciklama}</div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <Button variant="ghost" size="sm" iconLeft={<FileText size={12} strokeWidth={1.5} />}
                    onClick={() => belgeAc(f)}>Görüntüle</Button>
                  <Button variant="ghost" size="sm" iconLeft={<Pencil size={12} strokeWidth={1.5} />}
                    onClick={() => setModal(f)}>Düzenle</Button>
                  <Button variant="ghost" size="sm" style={{ color: 'var(--danger)' }}
                    iconLeft={<Trash2 size={12} strokeWidth={1.5} />} onClick={() => sil(f)}>Sil</Button>
                </div>
              </div>
            ))}

            {/* Para birimleri TOPLANMAZ — her biri ayrı satır */}
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>Toplam tedarik maliyeti</div>
              {toplamlar.map(t => (
                <div key={t.paraBirimi} style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPara(t.tutar, t.paraBirimi)}
                </div>
              ))}
            </div>
          </div>
        )}

        <Button variant="secondary" size="sm" iconLeft={<Upload size={13} strokeWidth={1.5} />}
          onClick={() => setModal('yeni')} style={{ width: '100%' }}>
          Tedarikçi Faturası Yükle
        </Button>
      </Card>

      {modal && (
        <AlisFaturaModal
          siparis={siparis}
          kullanici={kullanici}
          mevcut={modal === 'yeni' ? null : modal}
          onKapat={() => setModal(null)}
          onKaydedildi={() => { setModal(null); yukle() }}
        />
      )}

      {belge && (
        <BelgeOnizlemeModal
          baslik={belge.baslik} url={belge.url} indirmeAdi={belge.indirmeAdi}
          onKapat={() => setBelge(null)}
        />
      )}
    </>
  )
}

// ---------------- Yükleme modalı ----------------

function AlisFaturaModal({ siparis, kullanici, mevcut, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const dosyaRef = useRef(null)
  const duzenleme = !!mevcut

  const [form, setForm] = useState(() => mevcut ? {
    tedarikciAd: mevcut.tedarikciAd || '',
    vergiNo: mevcut.tedarikciVergiNo || '',
    faturaNo: mevcut.faturaNo || '',
    faturaTarihi: mevcut.faturaTarihi || '',
    ettn: mevcut.ettn || '',
    paraBirimi: mevcut.paraBirimi || 'TL',
    araToplam: mevcut.araToplam ?? '',
    kdvToplam: mevcut.kdvToplam ?? '',
    genelToplam: mevcut.genelToplam ?? '',
    aciklama: mevcut.aciklama || '',
  } : BOS_FORM)
  // Düzenlemede cari kart bağı korunur; kullanıcı "Değiştir" derse yeniden seçer.
  const [tedarikci, setTedarikci] = useState(() => mevcut?.tedarikciMusteriId
    ? { id: mevcut.tedarikciMusteriId, firma: mevcut.tedarikciAd, vergiNo: mevcut.tedarikciVergiNo, kod: '' }
    : null)
  const [arama, setArama] = useState('')
  const [sonuclar, setSonuclar] = useState([])
  const [araniyor, setAraniyor] = useState(false)
  // Cari bağı olmayan eski kayıt düzenlenirken doğrudan serbest metin açılır
  const [serbest, setSerbest] = useState(() => !!mevcut && !mevcut.tedarikciMusteriId)
  const [dosya, setDosya] = useState(null)
  const [mesgul, setMesgul] = useState(false)

  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Tedarikçi arama — yazarken gecikmeli sorgu
  useEffect(() => {
    if (serbest) return
    let iptal = false
    setAraniyor(true)
    const t = setTimeout(async () => {
      const liste = await tedarikciAra(arama)
      if (!iptal) { setSonuclar(liste); setAraniyor(false) }
    }, 280)
    return () => { iptal = true; clearTimeout(t) }
  }, [arama, serbest])

  const kaydet = async () => {
    // Düzenlemede dosya zorunlu değil — sadece künye düzeltiliyor olabilir
    if (!duzenleme && !dosya) { toast.error('Fatura dosyasını seçin.'); return }
    setMesgul(true)
    const sonuc = duzenleme
      ? await alisFaturaDuzenle({ kayit: mevcut, tedarikci, form, file: dosya })
      : await alisFaturaEkle({ siparis, tedarikci, form, file: dosya, kullanici })
    setMesgul(false)
    if (sonuc?._hata) { toast.error(sonuc._hata); return }
    toast.success(duzenleme ? 'Tedarikçi faturası güncellendi.' : 'Tedarikçi faturası yüklendi.')
    onKaydedildi()
  }

  return (
    <Modal open onClose={onKapat} width={620}
      title={`${duzenleme ? 'Tedarikçi Faturasını Düzenle' : 'Tedarikçi Faturası'} — ${siparis?.siparisNo || ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Tedarikçi seçimi */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Label style={{ margin: 0 }}>Tedarikçi *</Label>
            <Button variant="ghost" size="sm" onClick={() => { setSerbest(s => !s); setTedarikci(null) }}>
              {serbest ? 'Cari listesinden seç' : 'Listede yok, elle yaz'}
            </Button>
          </div>

          {serbest ? (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 4 }}>
              <Input placeholder="Tedarikçi ünvanı" value={form.tedarikciAd}
                onChange={e => alan('tedarikciAd', e.target.value)} />
              <Input placeholder="Vergi no" value={form.vergiNo}
                onChange={e => alan('vergiNo', e.target.value)} />
            </div>
          ) : tedarikci ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4,
              border: '1px solid var(--brand-primary)', borderRadius: 'var(--radius-md)',
              padding: '8px 10px', background: 'var(--brand-primary-soft)',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{tedarikci.firma}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                  {tedarikci.kod}{tedarikci.vergiNo ? ` · VKN ${tedarikci.vergiNo}` : ''}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setTedarikci(null)}>Değiştir</Button>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <Search size={14} strokeWidth={1.5}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <Input autoFocus value={arama} onChange={e => setArama(e.target.value)}
                  placeholder="Tedarikçi ara — ünvan, cari kod veya vergi no" style={{ paddingLeft: 30 }} />
              </div>
              <div style={{
                maxHeight: 170, overflowY: 'auto', marginTop: 6,
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
              }}>
                {araniyor ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>Aranıyor…</div>
                ) : sonuclar.length === 0 ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Eşleşen cari bulunamadı — “Listede yok, elle yaz” ile devam edebilirsiniz.
                  </div>
                ) : sonuclar.map(m => (
                  <button key={m.id} onClick={() => setTedarikci(m)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '7px 10px', border: 'none', borderBottom: '1px solid var(--border-subtle)',
                      background: 'transparent',
                    }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{m.firma}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {m.kod}{m.vergiNo ? ` · VKN ${m.vergiNo}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <Label>Fatura no *</Label>
            <Input value={form.faturaNo} onChange={e => alan('faturaNo', e.target.value)} placeholder="ANL2026000008092" />
          </div>
          <div>
            <Label>Fatura tarihi</Label>
            <Input type="date" value={form.faturaTarihi} onChange={e => alan('faturaTarihi', e.target.value)} />
          </div>
          <div>
            <Label>Para birimi</Label>
            <select value={form.paraBirimi} onChange={e => alan('paraBirimi', e.target.value)}
              style={{
                width: '100%', height: 38, borderRadius: 'var(--radius-md)', padding: '0 8px',
                border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                color: 'var(--text-primary)', font: '400 13px/1 var(--font-sans)',
              }}>
              <option value="TL">TL</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <Label>Mal/hizmet toplamı</Label>
            <Input type="number" step="0.01" value={form.araToplam}
              onChange={e => alan('araToplam', e.target.value)} placeholder="1429,50" />
          </div>
          <div>
            <Label>KDV</Label>
            <Input type="number" step="0.01" value={form.kdvToplam}
              onChange={e => alan('kdvToplam', e.target.value)} placeholder="285,90" />
          </div>
          <div>
            <Label>Ödenecek tutar *</Label>
            <Input type="number" step="0.01" value={form.genelToplam}
              onChange={e => alan('genelToplam', e.target.value)} placeholder="1715,40" />
          </div>
        </div>

        <div>
          <Label>Açıklama</Label>
          <Textarea rows={2} value={form.aciklama} onChange={e => alan('aciklama', e.target.value)}
            placeholder="Kısmi sevkiyat, iade, vade notu…" />
        </div>

        <div>
          <Label>Fatura dosyası {duzenleme ? '(değiştirmek isterseniz)' : '* (PDF veya görsel)'}</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" iconLeft={<Plus size={13} strokeWidth={1.5} />}
              onClick={() => dosyaRef.current?.click()}>
              {dosya ? 'Dosyayı Değiştir' : duzenleme ? 'Yeni Dosya Yükle' : 'Dosya Seç'}
            </Button>
            <span style={{ fontSize: 12, color: dosya ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              {dosya ? dosya.name
                : duzenleme ? `Mevcut: ${mevcut.dosyaAd || 'yüklü belge'} (korunacak)`
                : 'Henüz seçilmedi'}
            </span>
          </div>
          {duzenleme && dosya && (
            <div style={{ fontSize: 11.5, color: 'var(--warning)', marginTop: 4 }}>
              Kaydedince eski belge silinip yerine bu dosya geçecek.
            </div>
          )}
          <input ref={dosyaRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
            onChange={e => { setDosya(e.target.files?.[0] || null); e.target.value = '' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <Button variant="ghost" onClick={onKapat} disabled={mesgul}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={mesgul}>
            {mesgul ? 'Yükleniyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
