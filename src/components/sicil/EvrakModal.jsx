// Personel özlük evrak arşivi penceresi (mig 314).
//
// Sicil kartında sekme şeridinin sağındaki "Evrak" düğmesi buraya açılır.
// Ayrı sekme YAPILMADI: sekme çubuğu zaten sekiz öğeyle dolu ve evrak işi
// "aç, yükle, kapat" biçiminde kısa sürüyor — akışı bölmemesi için pencere.
//
// Kapı ik_yetkili() ('ik_yonetim'). Personelin kendisi bu evrakları göremez;
// burası kişinin dolabı değil, İK'nın işveren kaydı.

import { useEffect, useState, useRef } from 'react'
import { Upload, FileText, Trash2, ExternalLink, AlertTriangle } from 'lucide-react'
import { Modal, Button, Badge, Input, Select, Table, THead, TBody, TR, TH, TD } from '../ui'
import {
  EVRAK_TURLERI, turAd, turSureliMi, MAX_BOYUT_MB,
  evraklariGetir, evrakYukle, evrakUrl, evrakSil,
} from '../../services/personelEvrakService'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { yeniSekmedeAc, acmaHatasi } from '../../lib/dosyaAc'
import { tarihBicim } from './bicim'

const BOS = { tur: 'kimlik', baslik: '', gecerlilikTarihi: '', aciklama: '' }
const etiket = { font: '500 11px/15px var(--font-sans)', color: 'var(--text-secondary)' }

const boyutBicim = (b) => {
  if (!b) return '—'
  return b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`
}

// Süreli evraklarda tarih geçmişse uyarı — İK'nın asıl takip ettiği şey bu.
const suresiGecti = (tarih) => {
  if (!tarih) return false
  const bugun = new Date(); bugun.setHours(0, 0, 0, 0)
  return new Date(tarih) < bugun
}

export default function EvrakModal({ acik, kapat, kullaniciId, personelAd }) {
  // useToast() { showToast, toast } döner — destructure ŞART.
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(BOS)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [islemdeki, setIslemdeki] = useState(null)
  const dosyaRef = useRef(null)
  const [dosyaAd, setDosyaAd] = useState('')

  // Olay işleyicisinden çağrılır (yükleme/silme sonrası) — effect'ten DEĞİL.
  const yenile = async () => {
    try { setListe(await evraklariGetir(kullaniciId)) }
    catch (e) { toast.error(e.message || 'Evraklar yüklenemedi.') }
  }

  // ⚠️ setState effect GÖVDESİNDE senkron çağrılmaz (cascading render kuralı,
  // PersonelSicil.jsx'te de aynı not var). Bütün set'ler await'in ardında.
  // Yeniden açılışta `yukleniyor` sıfırlanmıyor: eski liste bir an görünüp
  // arkadan tazeleniyor — boş ekran çakması olmuyor.
  useEffect(() => {
    if (!acik || !kullaniciId) return
    let iptal = false
    ;(async () => {
      try {
        const veri = await evraklariGetir(kullaniciId)
        if (iptal) return
        setListe(veri)
        setForm(BOS)
        setDosyaAd('')
      } catch (e) {
        if (!iptal) toast.error(e.message || 'Evraklar yüklenemedi.')
      } finally {
        if (!iptal) setYukleniyor(false)
      }
    })()
    return () => { iptal = true }
  }, [acik, kullaniciId, toast])

  const alan = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const yukle = async () => {
    const dosya = dosyaRef.current?.files?.[0]
    if (!dosya) { toast.warning('Önce bir dosya seçin.'); return }
    setKaydediliyor(true)
    try {
      await evrakYukle(kullaniciId, form, dosya)
      toast.success('Evrak arşive eklendi.')
      setForm(BOS); setDosyaAd('')
      if (dosyaRef.current) dosyaRef.current.value = ''
      yenile()
    } catch (e) {
      toast.error(e.message || 'Evrak yüklenemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  // Pencere URL'den ÖNCE açılır — await sonrası window.open popup engeline
  // takılıp sessizce null dönüyor (bkz. src/lib/dosyaAc.js).
  const ac = async (yol) => {
    const sonuc = await yeniSekmedeAc(() => evrakUrl(yol))
    if (!sonuc.ok) toast.error(acmaHatasi(sonuc, 'Belge açılamadı.'))
  }

  const sil = async (e) => {
    const onay = await confirm({
      baslik: 'Evrağı Sil',
      mesaj: `"${turAd(e.tur)}" evrağı kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      onayMetin: 'Evet, sil', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    setIslemdeki(e.id)
    try {
      await evrakSil(e.id, e.dosya_yolu)
      toast.success('Evrak silindi.')
      yenile()
    } catch (err) {
      toast.error(err.message || 'Evrak silinemedi.')
    } finally {
      setIslemdeki(null)
    }
  }

  const sureliTur = turSureliMi(form.tur)

  return (
    <Modal
      open={acik}
      onClose={kapat}
      width={860}
      title={`Özlük Evrakları${personelAd ? ' — ' + personelAd : ''}`}
    >
      {/* ── Yükleme formu ─────────────────────────────────────────────── */}
      <div style={{
        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
        padding: 14, marginBottom: 16, background: 'var(--surface-sunken)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: sureliTur ? '1fr 1fr' : '1fr', gap: 10 }}>
          <div>
            <div style={etiket}>EVRAK TÜRÜ</div>
            <Select value={form.tur} onChange={e => alan('tur', e.target.value)}>
              {EVRAK_TURLERI.map(t => <option key={t.id} value={t.id}>{t.ad}</option>)}
            </Select>
          </div>
          {sureliTur && (
            <div>
              <div style={etiket}>GEÇERLİLİK TARİHİ</div>
              <Input
                type="date"
                value={form.gecerlilikTarihi}
                onChange={e => alan('gecerlilikTarihi', e.target.value)}
              />
            </div>
          )}
        </div>

        {form.tur === 'diger' && (
          <div style={{ marginTop: 10 }}>
            <div style={etiket}>EVRAK ADI</div>
            <Input
              value={form.baslik}
              onChange={e => alan('baslik', e.target.value)}
              placeholder="Örn. İş Güvenliği Eğitim Belgesi"
            />
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <div style={etiket}>AÇIKLAMA (opsiyonel)</div>
          <Input
            value={form.aciklama}
            onChange={e => alan('aciklama', e.target.value)}
            placeholder="Örn. 2026 yılı yenilemesi"
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <Button
            variant="secondary" size="sm"
            iconLeft={<FileText size={13} strokeWidth={1.7} />}
            onClick={() => dosyaRef.current?.click()}
          >
            Dosya Seç
          </Button>
          <span style={{
            font: '400 12px/16px var(--font-sans)',
            color: dosyaAd ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}>
            {dosyaAd || `PDF, JPG veya PNG · en çok ${MAX_BOYUT_MB} MB`}
          </span>
          <div style={{ flex: 1 }} />
          <Button
            variant="primary" size="sm" disabled={kaydediliyor || !dosyaAd}
            iconLeft={<Upload size={13} strokeWidth={1.7} />}
            onClick={yukle}
          >
            {kaydediliyor ? 'Yükleniyor…' : 'Arşive Ekle'}
          </Button>
        </div>

        <input
          ref={dosyaRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          style={{ display: 'none' }}
          onChange={e => setDosyaAd(e.target.files?.[0]?.name || '')}
        />
      </div>

      {/* ── Arşiv ─────────────────────────────────────────────────────── */}
      {yukleniyor ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', font: '400 13px/18px var(--font-sans)' }}>
          Evraklar yükleniyor…
        </div>
      ) : liste.length === 0 ? (
        <div style={{
          padding: '22px 16px', textAlign: 'center', color: 'var(--text-tertiary)',
          font: '400 13px/18px var(--font-sans)',
          border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)',
        }}>
          Bu personel için henüz evrak yüklenmemiş.
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>EVRAK</TH>
              <TH>DOSYA</TH>
              <TH>GEÇERLİLİK</TH>
              <TH>YÜKLENDİ</TH>
              <TH style={{ width: 150 }}>İŞLEM</TH>
            </TR>
          </THead>
          <TBody>
            {liste.map(e => {
              const mesgul = islemdeki === e.id
              const gecti = suresiGecti(e.gecerlilik_tarihi)
              return (
                <TR key={e.id}>
                  <TD>
                    {e.tur === 'diger' && e.baslik ? e.baslik : turAd(e.tur)}
                    {e.aciklama && (
                      <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                        {e.aciklama}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <div style={{ font: '400 12px/16px var(--font-sans)' }}>{e.dosya_ad || '—'}</div>
                    <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                      {boyutBicim(e.dosya_boyut)}
                    </div>
                  </TD>
                  <TD>
                    {e.gecerlilik_tarihi ? (
                      gecti ? (
                        <Badge tone="hata" icon={<AlertTriangle size={11} strokeWidth={2} />}>
                          {tarihBicim(e.gecerlilik_tarihi)}
                        </Badge>
                      ) : (
                        <span style={{ font: '400 12px/16px var(--font-sans)' }}>
                          {tarihBicim(e.gecerlilik_tarihi)}
                        </span>
                      )
                    ) : '—'}
                  </TD>
                  <TD>{tarihBicim(e.olusturma_tarih)}</TD>
                  <TD>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="secondary" size="sm" disabled={mesgul}
                        iconLeft={<ExternalLink size={13} strokeWidth={1.7} />}
                        onClick={() => ac(e.dosya_yolu)}
                      >
                        Aç
                      </Button>
                      <button
                        type="button" onClick={() => sil(e)} disabled={mesgul}
                        title="Evrağı sil" style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, padding: 0, background: 'transparent',
                          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                          color: 'var(--danger)', cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.7} />
                      </button>
                    </div>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}
    </Modal>
  )
}
