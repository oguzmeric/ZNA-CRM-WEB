// Sicil → Avanslar sekmesi: avans talepleri + taksit planı + kalan borç.
//
// Veri ikService.avansTalepleriGetir'den gelir; taksitler zaten iç içe
// düzleştirilmiş ve sıralanmış halde (toCamel shallow join dersi orada çözüldü).

import { Badge, Table, THead, TBody, TR, TH, TD } from '../ui'
import { avansTalepleriGetir, avansDurumBilgi, tutarBicim, donemBicim } from '../../services/ikService'
import { useSekmeVeri } from './useSekmeVeri'
import { SekmeYukleniyor, SekmeHata, SekmeBos, OzetKutular } from './ortak'
import { tarihBicim } from './bicim'

export default function AvanslarSekmesi({ kullaniciId }) {
  const { veri: avanslar, yukleniyor, hata, yenile } = useSekmeVeri(
    () => avansTalepleriGetir({ kullaniciId }),
    [kullaniciId],
  )

  if (yukleniyor) return <SekmeYukleniyor metin="Avans kayıtları yükleniyor…" />
  if (hata) return <SekmeHata hata={hata} tekrar={yenile} />

  const liste = avanslar || []
  const odenmis = liste.filter(a => a.odemeTarihi)
  const toplamAlinan = odenmis.reduce((s, a) => s + (Number(a.tutar) || 0), 0)
  const kalanBorc = liste.reduce((s, a) => s + (Number(a.kalanBorc) || 0), 0)
  const bekleyen = liste.filter(a => a.durum === 'bekliyor').length

  return (
    <div style={{ padding: 16 }}>
      <OzetKutular
        kutular={[
          { label: 'TOPLAM AVANS', value: tutarBicim(toplamAlinan), ipucu: `${odenmis.length} ödeme` },
          {
            label: 'KALAN BORÇ',
            value: tutarBicim(kalanBorc),
            color: kalanBorc > 0 ? 'var(--warning)' : 'var(--success)',
            ipucu: kalanBorc > 0 ? 'Maaştan kesilecek' : 'Borç yok',
          },
          {
            label: 'BEKLEYEN TALEP',
            value: String(bekleyen),
            color: bekleyen > 0 ? 'var(--warning)' : 'var(--text-primary)',
          },
        ]}
        sutun={3}
      />

      {liste.length === 0 ? (
        <SekmeBos>Bu personele ait avans kaydı yok.</SekmeBos>
      ) : (
        liste.map(a => {
          const durum = avansDurumBilgi(a.durum)
          return (
            <div key={a.id} style={{
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 10, overflow: 'hidden',
            }}>
              {/* Talep başlığı */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '9px 12px', background: 'var(--surface-sunken)',
              }}>
                <span style={{ font: '700 14px/20px var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>
                  {tutarBicim(a.tutar)}
                </span>
                <Badge tone={durum.tone}>{durum.isim}</Badge>
                <span className="t-caption">{a.taksitSayisi} taksit</span>
                {a.odemeTarihi && (
                  <span className="t-caption">Ödendi: {tarihBicim(a.odemeTarihi)}</span>
                )}
                {a.kalanBorc > 0 && (
                  <span style={{ marginLeft: 'auto', font: '600 12px/17px var(--font-sans)', color: 'var(--warning)' }}>
                    Kalan: {tutarBicim(a.kalanBorc)}
                  </span>
                )}
              </div>

              {a.gerekce && (
                <div style={{ padding: '8px 12px', font: '400 12px/17px var(--font-sans)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  {a.gerekce}
                </div>
              )}

              {/* Taksit planı */}
              {a.taksitler?.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <Table>
                    <THead>
                      <TR>
                        <TH style={{ width: 60 }}>Taksit</TH>
                        <TH>Dönem</TH>
                        <TH style={{ textAlign: 'right' }}>Tutar</TH>
                        <TH>Durum</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {a.taksitler.map(t => (
                        <TR key={t.id}>
                          <TD className="tabular-nums">{t.sira}</TD>
                          <TD>{donemBicim(t.donem)}</TD>
                          <TD style={{ textAlign: 'right' }} className="tabular-nums">{tutarBicim(t.tutar)}</TD>
                          <TD>
                            {t.kesintiTarihi
                              ? <Badge tone="basarili">Kesildi</Badge>
                              : <Badge tone="beklemede">Bekliyor</Badge>}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
