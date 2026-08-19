// Sicil → Zimmet & Demirbaş sekmesi (mig 312).
//
// ⚠️ Bu sekme bir kez KALDIRILMIŞTI: demirbas_zimmet RLS'i `demirbas_yetkili()`
// fonksiyonuna bakıyor, o fonksiyon da yalnız admin + demirbas_yetkilisi
// bayrağını kapsadığı için Abdullah (İK) 162 kaydın SIFIRINI görüyordu.
// mig 312 fonksiyona ik_yonetim modülünü ekledi; ölçüm: Abdullah 0 → 162.
//
// Tutanak ayrı tablo DEĞİL — aynı teslimdeki kalemler aynı tutanak_no'yu
// paylaşır. Numarayı DB üretir (istemci sayacı yarış yaratır,
// bkz. reference_belge_no_trigger).

import { useState } from 'react'
import { Plus, Printer, FileText, PackageCheck } from 'lucide-react'
import { Button, Badge, Input, Select, Table, THead, TBody, TR, TH, TD } from '../ui'
import { teknisyenDemirbaslari, demirbasEkle, tutanakOlustur } from '../../services/zimmetService'
import { useSekmeVeri } from './useSekmeVeri'
import { SekmeYukleniyor, SekmeHata, SekmeBos, OzetKutular } from './ortak'
import { tarihBicim } from './bicim'
import { useToast } from '../../context/ToastContext'

const KATEGORILER = [
  { id: 'bilgisayar', ad: 'Bilgisayar' },
  { id: 'laptop', ad: 'Dizüstü' },
  { id: 'telefon', ad: 'Telefon' },
  { id: 'alet', ad: 'Alet / Ekipman' },
  { id: 'canta', ad: 'Çanta' },
  { id: 'diger', ad: 'Diğer' },
]
const kategoriAd = (id) => KATEGORILER.find(k => k.id === id)?.ad || id || '—'

// Cihazlarda seri no ZORUNLU: tutanağın hukuki dayanağı "hangi cihaz" sorusuna
// verilen cevaptır, marka/model tek başına o cevabı vermez.
const SERI_ZORUNLU = ['bilgisayar', 'laptop', 'telefon']

const BOS_FORM = { kategori: 'bilgisayar', marka: '', model: '', seriNo: '', aciklama: '', teslimNotu: '' }
const etiket = { font: '500 11px/15px var(--font-sans)', color: 'var(--text-secondary)' }

export default function ZimmetSekmesi({ kullaniciId, personelAd }) {
  // useToast() { showToast, toast } döner — destructure ŞART, yoksa
  // toast.success sessizce undefined kalır (MaasBordroSekmesi bu tuzağa düşmüş).
  const { toast } = useToast()
  const { veri, yukleniyor, hata, yenile } = useSekmeVeri(
    () => teknisyenDemirbaslari(kullaniciId),
    [kullaniciId],
  )

  const [formAcik, setFormAcik] = useState(false)
  const [form, setForm] = useState(BOS_FORM)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [secili, setSecili] = useState([])
  const [tutanakYapiliyor, setTutanakYapiliyor] = useState(false)

  if (yukleniyor) return <SekmeYukleniyor metin="Demirbaş kayıtları yükleniyor…" />
  if (hata) return <SekmeHata hata={hata} tekrar={yenile} />

  const liste = veri || []
  const cihazlar = liste.filter(d => SERI_ZORUNLU.includes(d.kategori))
  const tutanaksiz = liste.filter(d => !d.tutanak_no)

  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const secimDegis = (id) => setSecili(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  const kaydet = async () => {
    if (!form.marka.trim() && !form.aciklama.trim()) {
      toast.warning('Marka ya da açıklama girin.')
      return
    }
    if (SERI_ZORUNLU.includes(form.kategori) && !form.seriNo.trim()) {
      toast.warning('Bu kategoride seri numarası zorunlu — tutanağın dayanağı odur.')
      return
    }
    setKaydediliyor(true)
    try {
      await demirbasEkle({ kullaniciId, ...form })
      toast.success('Demirbaş eklendi.')
      setForm(BOS_FORM)
      setFormAcik(false)
      await yenile()
    } catch (e) {
      toast.error(e.message || 'Demirbaş eklenemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  const tutanakYap = async () => {
    if (!secili.length) return
    setTutanakYapiliyor(true)
    try {
      const no = await tutanakOlustur(secili)
      toast.success('Tutanak oluşturuldu: ' + no)
      setSecili([])
      await yenile()
      window.open('/demirbas-tutanak/' + no, '_blank', 'noopener')
    } catch (e) {
      toast.error(e.message || 'Tutanak oluşturulamadı.')
    } finally {
      setTutanakYapiliyor(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <OzetKutular
        kutular={[
          { label: 'ÜZERİNDEKİ DEMİRBAŞ', value: String(liste.length), ipucu: 'İade edilmemiş' },
          { label: 'CİHAZ (SERİ NOLU)', value: String(cihazlar.length), ipucu: 'Bilgisayar / dizüstü / telefon' },
          {
            label: 'TUTANAKSIZ',
            value: String(tutanaksiz.length),
            color: tutanaksiz.length > 0 ? 'var(--warning)' : 'var(--success)',
            ipucu: tutanaksiz.length > 0 ? 'Belgesi yok' : 'Hepsi belgeli',
          },
        ]}
        sutun={3}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0 12px' }}>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus size={14} strokeWidth={1.8} />}
          onClick={() => setFormAcik(a => !a)}
        >
          Demirbaş Ekle
        </Button>
        <Button
          variant={secili.length ? 'secondary' : 'tertiary'}
          size="sm"
          disabled={!secili.length || tutanakYapiliyor}
          iconLeft={<FileText size={14} strokeWidth={1.8} />}
          onClick={tutanakYap}
        >
          {tutanakYapiliyor
            ? 'Oluşturuluyor…'
            : 'Teslim Tutanağı Oluştur' + (secili.length ? ' (' + secili.length + ')' : '')}
        </Button>
      </div>

      {formAcik && (
        <div style={{
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: 14,
          marginBottom: 14,
          background: 'var(--surface-sunken)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={etiket}>Kategori</span>
              <Select value={form.kategori} onChange={e => alan('kategori', e.target.value)}>
                {KATEGORILER.map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}
              </Select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={etiket}>Marka</span>
              <Input value={form.marka} onChange={e => alan('marka', e.target.value)} placeholder="Örn. Lenovo" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={etiket}>Model</span>
              <Input value={form.model} onChange={e => alan('model', e.target.value)} placeholder="Örn. ThinkPad E14" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={etiket}>
                Seri No{SERI_ZORUNLU.includes(form.kategori) ? ' *' : ''}
              </span>
              <Input value={form.seriNo} onChange={e => alan('seriNo', e.target.value)} placeholder="Cihaz seri numarası" />
            </label>
            <label style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
              <span style={etiket}>Açıklama</span>
              <Input value={form.aciklama} onChange={e => alan('aciklama', e.target.value)} placeholder="Örn. Ofis bilgisayarı" />
            </label>
            <label style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
              <span style={etiket}>Teslim notu</span>
              <Input
                value={form.teslimNotu}
                onChange={e => alan('teslimNotu', e.target.value)}
                placeholder="Örn. çantası ve şarj adaptörü ile birlikte"
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
              {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
            <Button variant="tertiary" size="sm" onClick={() => { setForm(BOS_FORM); setFormAcik(false) }}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}

      {liste.length === 0 ? (
        <SekmeBos>
          <PackageCheck size={26} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
          <div style={{ marginTop: 8 }}>{personelAd || 'Bu personel'} üzerinde kayıtlı demirbaş yok.</div>
        </SekmeBos>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH style={{ width: 34 }}> </TH>
              <TH>DEMİRBAŞ NO</TH>
              <TH>KATEGORİ</TH>
              <TH>MARKA / MODEL</TH>
              <TH>SERİ NO</TH>
              <TH>VERİLİŞ</TH>
              <TH>TUTANAK</TH>
            </TR>
          </THead>
          <TBody>
            {liste.map(d => (
              <TR key={d.id}>
                <TD>
                  <input
                    type="checkbox"
                    checked={secili.includes(d.id)}
                    onChange={() => secimDegis(d.id)}
                    disabled={!!d.tutanak_no}
                    title={d.tutanak_no ? 'Zaten tutanağa bağlı' : 'Tutanağa ekle'}
                    style={{ cursor: d.tutanak_no ? 'not-allowed' : 'pointer' }}
                  />
                </TD>
                <TD>{d.demirbas_no || '—'}</TD>
                <TD>{kategoriAd(d.kategori)}</TD>
                <TD>
                  {[d.marka, d.model].filter(Boolean).join(' ') || d.aciklama || '—'}
                  {d.marka && d.aciklama && (
                    <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      {d.aciklama}
                    </div>
                  )}
                </TD>
                <TD>{d.seri_no || '—'}</TD>
                <TD>{tarihBicim(d.verildi_tarih)}</TD>
                <TD>
                  {d.tutanak_no ? (
                    <a
                      href={'/demirbas-tutanak/' + d.tutanak_no}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        color: 'var(--accent-primary)', textDecoration: 'none',
                      }}
                    >
                      <Printer size={13} strokeWidth={1.7} />
                      {d.tutanak_no}
                    </a>
                  ) : (
                    <Badge tone="warning">Tutanaksız</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}
