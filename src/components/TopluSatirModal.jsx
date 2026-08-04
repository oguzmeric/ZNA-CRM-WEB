// Excel'den kopyala-yapıştır ile toplu teklif satırı ekleme.
//
// Kullanıcı Excel'de "Ürün Kodu | Miktar" sütunlarını seçip kopyalar, buraya
// yapıştırır; satırlar anında çözümlenip önizlenir ve tek tıkla teklife eklenir.
//
// ⭐ Stokta OLMAYAN kod da eklenir (kullanıcı kararı: "Stoğumuzda bu
// ürünlerden olmak zorunda değil"). Eşleşende ad/fiyat/KDV stoktan gelir,
// eşleşmeyende kod satıra yazılır ve fiyat elle girilir.
//
// ⚠️ Yapıştırılan kod çoğunlukla ÜRETİCİ MODEL KODUDUR ve ZNA stokunda bu
// alan `stokAdi`dir (`stokKodu` = "STK00505" iç sayaç). Eşleştirme bu yüzden
// çok kanallıdır — bkz. topluSatirAyristir.js.

import { useMemo, useRef, useState, useEffect } from 'react'
import { ClipboardPaste, Check, AlertCircle, X, Package, PackageX, HelpCircle } from 'lucide-react'
import { Modal, Button, Badge, CodeBadge } from './ui'
import { yapistirmaAyristir, stoklaEslestir, ESLESME_KAYNAKLARI } from '../lib/topluSatirAyristir'

export default function TopluSatirModal({ acik, onKapat, stokUrunler = [], onEkle }) {
  const [metin, setMetin] = useState('')
  // Belirsiz satırlarda elle seçilen ürün. Seçimler HANGİ METNE ait olduğuyla
  // birlikte tutulur: metin değişince satır indeksleri kayar, eski seçim yanlış
  // satıra oturur. Effect'le sıfırlamak yerine render'da türetiliyor.
  const [secimDurumu, setSecimDurumu] = useState({ metin: '', harita: {} })
  const alanRef = useRef(null)

  const secimler = useMemo(
    () => (secimDurumu.metin === metin ? secimDurumu.harita : {}),
    [secimDurumu, metin],
  )
  const secimYap = (i, stokKodu) => setSecimDurumu({ metin, harita: { ...secimler, [i]: stokKodu } })

  // Modal açılınca yapıştırma alanına odaklan — kullanıcı doğrudan Ctrl+V yapsın
  useEffect(() => {
    if (!acik) return undefined
    const t = setTimeout(() => alanRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [acik])

  // Temizlik kapanışta yapılır (açılışta setState = gereksiz cascade render)
  const kapat = () => { setMetin(''); setSecimDurumu({ metin: '', harita: {} }); onKapat() }

  const hamSatirlar = useMemo(
    () => stoklaEslestir(yapistirmaAyristir(metin), stokUrunler),
    [metin, stokUrunler],
  )

  // Elle seçim, otomatik eşleşmenin yerine geçer
  const satirlar = useMemo(() => hamSatirlar.map((s, i) => {
    const secilenKod = secimler[i]
    if (!secilenKod) return s
    const urun = s.adaylar?.find(a => a.stokKodu === secilenKod)
    if (!urun) return s
    return { ...s, urun, eslesti: true, belirsiz: false, eslesmeKaynagi: 'secim', cozulmusAd: urun.stokAdi }
  }), [hamSatirlar, secimler])

  const eslesen = satirlar.filter(s => s.eslesti).length
  const belirsiz = satirlar.filter(s => s.belirsiz).length
  const yeni = satirlar.length - eslesen - belirsiz

  const ekle = () => {
    if (satirlar.length === 0) return
    // Alan adları stok kartıyla birebir: birimFiyat = satış, alisFiyat = maliyet
    const yeniSatirlar = satirlar.map(s => ({
      id: crypto.randomUUID(),
      stokKodu: s.urun?.stokKodu || s.kod,
      stokAdi: s.cozulmusAd,
      miktar: s.miktar,
      birim: s.urun?.birim || 'Adet',
      marka: s.urun?.marka || '',
      birimFiyat: Number(s.urun?.birimFiyat ?? 0) || 0,
      iskonto: 0,
      kdv: Number(s.urun?.kdvOrani ?? 20),
      // Maliyet de taşınsın — kâr yüzdesi göstergesi doğru hesaplansın
      ...(s.urun?.alisFiyat != null ? { alisFiyat: Number(s.urun.alisFiyat) || 0 } : {}),
    }))
    onEkle(yeniSatirlar)
    setMetin('')
    setSecimDurumu({ metin: '', harita: {} })
  }

  return (
    <Modal open={acik} onClose={kapat} title="Excel'den Toplu Satır Ekle" width={780}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '10px 12px', borderRadius: 8,
          background: 'var(--brand-primary-soft)',
          font: '400 12px/17px var(--font-sans)', color: 'var(--text-secondary)',
        }}>
          <ClipboardPaste size={15} strokeWidth={1.75} style={{ color: 'var(--brand-primary)', flexShrink: 0, marginTop: 1 }} />
          <div>
            Excel'de <b>ürün kodu ve miktar</b> sütunlarını seçip kopyalayın, aşağıya yapıştırın.
            Ürün tanımı, fiyatı ve KDV'si stoktan otomatik gelir — kod, ürün adı, üretici model
            kodu veya barkod üzerinden aranır. Başlık satırı atlanır; stokta olmayan kodlar da
            eklenir, fiyatlarını sonra satır üzerinde girersiniz.
          </div>
        </div>

        <textarea
          ref={alanRef}
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          placeholder={'FC722-ZZ\t1\nOH731\t12\nFDB221\t12'}
          spellCheck={false}
          style={{
            width: '100%', minHeight: 130, resize: 'vertical',
            padding: '10px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'var(--surface-default)', color: 'var(--text-primary)',
            font: '400 13px/20px ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre', overflowX: 'auto',
          }}
        />

        {/* Önizleme */}
        {satirlar.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone="brand">{satirlar.length} satır</Badge>
              {eslesen > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '500 12px/16px var(--font-sans)', color: '#059669' }}>
                  <Package size={13} strokeWidth={1.75} /> {eslesen} ürün stokta bulundu
                </span>
              )}
              {belirsiz > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '500 12px/16px var(--font-sans)', color: '#b45309' }}>
                  <HelpCircle size={13} strokeWidth={1.75} /> {belirsiz} satırda birden çok ürün eşleşti — seçin
                </span>
              )}
              {yeni > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '500 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                  <PackageX size={13} strokeWidth={1.75} /> {yeni} kod stokta yok — yine de eklenecek
                </span>
              )}
            </div>

            <div style={{
              maxHeight: 280, overflowY: 'auto',
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12px/16px var(--font-sans)' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: 'var(--surface-sunken)' }}>
                    {['Kod', 'Ürün', 'Miktar', 'Birim Fiyat', ''].map((h, i) => (
                      <th key={h + i} style={{
                        padding: '8px 10px', textAlign: i >= 2 && i <= 3 ? 'right' : 'left',
                        font: '600 11px/14px var(--font-sans)', color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--border-default)',
                        textTransform: 'uppercase', letterSpacing: 0.3,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td style={{ padding: '7px 10px' }}><CodeBadge>{s.kod}</CodeBadge></td>
                      <td style={{ padding: '7px 10px', color: s.eslesti ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        {s.belirsiz ? (
                          /* Aynı koda birden çok kart uyuyor — otomatik seçmek yanlış
                             ürünü teklife koyar; kararı kullanıcı verir. */
                          <select
                            value={secimler[i] || ''}
                            onChange={(e) => secimYap(i, e.target.value)}
                            style={{
                              width: '100%', padding: '4px 6px', borderRadius: 6,
                              border: '1px solid #f59e0b', background: 'var(--surface-default)',
                              color: 'var(--text-primary)', font: '400 12px/16px var(--font-sans)',
                            }}
                          >
                            <option value="">{s.adaylar.length} ürün eşleşti — seçin…</option>
                            {s.adaylar.map(a => (
                              <option key={a.stokKodu} value={a.stokKodu}>
                                {a.stokKodu} — {a.stokAdi}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            {s.cozulmusAd}
                            {s.eslesti && (
                              <span style={{
                                marginLeft: 6, padding: '1px 5px', borderRadius: 4,
                                background: 'var(--surface-sunken)', color: 'var(--text-tertiary)',
                                font: '500 10px/14px var(--font-sans)', whiteSpace: 'nowrap',
                              }}>
                                {ESLESME_KAYNAKLARI[s.eslesmeKaynagi] || 'eşleşti'}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {s.miktar}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                        {/* Stokta fiyatsız kart çok (2599'un 1595'i) — 0,00 yerine tire */}
                        {s.eslesti && Number(s.urun?.birimFiyat) > 0
                          ? Number(s.urun.birimFiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
                          : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        {s.eslesti
                          ? <Check size={14} strokeWidth={2} style={{ color: '#10b981' }} />
                          : s.belirsiz
                            ? <HelpCircle size={14} strokeWidth={2} style={{ color: '#f59e0b' }} />
                            : <AlertCircle size={14} strokeWidth={1.75} style={{ color: 'var(--text-tertiary)' }} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {metin.trim() && satirlar.length === 0 && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.25)',
            font: '400 12px/17px var(--font-sans)', color: '#dc2626',
          }}>
            Yapıştırılan içerikten satır çıkarılamadı. Her satırda en az bir ürün kodu olmalı.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {belirsiz > 0 && (
            <span style={{ marginRight: 'auto', font: '400 12px/16px var(--font-sans)', color: '#b45309' }}>
              Seçilmeyen {belirsiz} satır, ürün bağlanmadan yalnız kodla eklenir.
            </span>
          )}
          <Button variant="secondary" iconLeft={<X size={14} strokeWidth={1.5} />} onClick={kapat}>
            Vazgeç
          </Button>
          <Button variant="primary" disabled={satirlar.length === 0} onClick={ekle}>
            {satirlar.length > 0 ? `${satirlar.length} Satırı Ekle` : 'Ekle'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
