// Sicil → Maaş & Bordro sekmesi.
//
// GİZLİLİK: personel_maaslari RLS'i ik_puantaj_yetkili() — mig 309 ile
// 'ik_yonetim' modülüne bağlandı (Ali 1, Oğuz 2, Abdullah 44). Sicil kartına
// giren zaten bu üç kişiden biri, o yüzden burada EK kontrol yok.
//
// Maaş geçmişi: zam = yeni satır (eski dönem bozulmaz). En üstteki satır
// yürürlükteki maaştır.

import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { Badge, Button, Table, THead, TBody, TR, TH, TD } from '../ui'
import { useToast } from '../../context/ToastContext'
import { indirmeBaslat } from '../../lib/dosyaAc'
import { maasGecmisiGetir } from '../../services/personelSicilService'
import { bordrolariGetir, bordroIndirUrl, tutarBicim } from '../../services/ikService'
import { useSekmeVeri } from './useSekmeVeri'
import { SekmeYukleniyor, SekmeHata, SekmeBos, OzetKutular } from './ortak'
import { tarihBicim } from './bicim'

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export default function MaasBordroSekmesi({ kullaniciId }) {
  const { toast } = useToast()
  const [indirilen, setIndirilen] = useState(null)

  const { veri, yukleniyor, hata, yenile } = useSekmeVeri(
    async () => {
      const [maaslar, bordrolar] = await Promise.all([
        maasGecmisiGetir(kullaniciId),
        bordrolariGetir(kullaniciId),
      ])
      return { maaslar, bordrolar }
    },
    [kullaniciId],
  )

  if (yukleniyor) return <SekmeYukleniyor metin="Maaş ve bordro bilgileri yükleniyor…" />
  if (hata) return <SekmeHata hata={hata} tekrar={yenile} />

  const maaslar = veri?.maaslar || []
  const bordrolar = veri?.bordrolar || []
  const guncel = maaslar[0] || null

  // ⚠️ window.open KULLANILMAZ: imzalı URL await'in ardından geliyor, o noktada
  // tarayıcının kullanıcı-etkileşimi penceresi kapandığı için popup engelleniyor
  // ve null dönüyordu — istisna da fırlatmadığı için hata görünmüyordu.
  // bordroIndirUrl attachment olarak imzalıyor; adres ataması sayfayı
  // değiştirmeden indirmeyi başlatır. (bkz. src/lib/dosyaAc.js)
  const indir = async (b) => {
    setIndirilen(b.id)
    try {
      const url = await bordroIndirUrl(b.dosyaYol, b.dosyaAd)
      if (!url) throw new Error('Bordro bağlantısı üretilemedi.')
      indirmeBaslat(url)
    } catch (e) {
      toast.error(e?.message || 'Bordro indirilemedi.')
    } finally {
      setIndirilen(null)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <OzetKutular
        kutular={[
          {
            label: 'YÜRÜRLÜKTEKİ MAAŞ',
            value: guncel ? tutarBicim(guncel.brutTutar) : '—',
            ipucu: guncel
              ? `${guncel.maasTuru === 'net' ? 'NET' : 'BRÜT'} · ${tarihBicim(guncel.gecerliBaslangic)} itibarıyla`
              : 'Maaş kaydı girilmemiş',
          },
          {
            label: 'BES KESİNTİSİ',
            value: guncel ? (guncel.besDahil === false ? 'Muaf' : 'Dahil') : '—',
            color: guncel?.besDahil === false ? 'var(--text-tertiary)' : 'var(--text-primary)',
          },
          { label: 'MAAŞ KAYDI', value: String(maaslar.length), ipucu: 'Zam geçmişi dahil' },
          { label: 'BORDRO', value: String(bordrolar.length), ipucu: 'Yüklenmiş PDF' },
        ]}
      />

      {/* Maaş geçmişi */}
      <div style={{ marginBottom: 22 }}>
        <div style={{
          font: '700 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: 0.3,
          marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border-default)',
        }}>
          Maaş Geçmişi
        </div>
        {maaslar.length === 0 ? (
          <SekmeBos>Bu personel için maaş kaydı girilmemiş. Puantaj sekmesinden eklenebilir.</SekmeBos>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <THead>
                <TR>
                  <TH>Geçerlilik</TH>
                  <TH style={{ textAlign: 'right' }}>Tutar</TH>
                  <TH>Tür</TH>
                  <TH>BES</TH>
                  <TH>Not</TH>
                  <TH>Kayıt</TH>
                </TR>
              </THead>
              <TBody>
                {maaslar.map((m, i) => (
                  <TR key={m.id}>
                    <TD className="tabular-nums" style={{ fontWeight: i === 0 ? 600 : 400 }}>
                      {tarihBicim(m.gecerliBaslangic)}
                      {i === 0 && <Badge tone="basarili" style={{ marginLeft: 6 }}>Güncel</Badge>}
                    </TD>
                    <TD style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                      {tutarBicim(m.brutTutar)}
                    </TD>
                    <TD>
                      <Badge tone={m.maasTuru === 'net' ? 'bilgi' : 'neutral'}>
                        {m.maasTuru === 'net' ? 'NET' : 'BRÜT'}
                      </Badge>
                    </TD>
                    <TD>{m.besDahil === false ? 'Muaf' : 'Dahil'}</TD>
                    <TD style={{ maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.not_ || m.not || '—'}
                      </div>
                    </TD>
                    <TD style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }} className="tabular-nums">
                      {tarihBicim(m.olusturmaTarih)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>

      {/* Bordrolar */}
      <div>
        <div style={{
          font: '700 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: 0.3,
          marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border-default)',
        }}>
          Bordrolar
        </div>
        {bordrolar.length === 0 ? (
          <SekmeBos>Bu personele ait bordro yüklenmemiş.</SekmeBos>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <THead>
                <TR>
                  <TH>Dönem</TH>
                  <TH>Dosya</TH>
                  <TH>Açıklama</TH>
                  <TH>Yüklenme</TH>
                  <TH style={{ width: 110 }}>İşlem</TH>
                </TR>
              </THead>
              <TBody>
                {bordrolar.map(b => (
                  <TR key={b.id}>
                    <TD style={{ fontWeight: 600 }} className="tabular-nums">
                      {AYLAR[Number(b.donemAy) - 1] || b.donemAy} {b.donemYil}
                    </TD>
                    <TD>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <FileText size={12} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                        {b.dosyaAd || 'bordro.pdf'}
                      </span>
                    </TD>
                    <TD style={{ maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.aciklama || '—'}
                      </div>
                    </TD>
                    <TD style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }} className="tabular-nums">
                      {tarihBicim(b.olusturmaTarih)}
                    </TD>
                    <TD>
                      <Button variant="secondary" size="sm" disabled={indirilen === b.id}
                        iconLeft={<Download size={13} strokeWidth={1.5} />} onClick={() => indir(b)}>
                        {indirilen === b.id ? 'Açılıyor…' : 'İndir'}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
