// Sözleşme Arşivi — "firmalara ilettiğimiz sözleşmelerin tamamı + imzalı PDF"
// tek ekranda (Abdullah İğde / muhasebe talebi, 30.07).
//
// Satış, bayi ve bakım/hizmet sözleşmeleri tek listede; imzalı belge satırdan
// yüklenir, satırdan açılır. Sözleşme METNİ burada değişmez — arşiv ekranı
// yalnız imzalı nüshayı toplar (düzenleme /sozlesmeler'de, yönetimde kalır).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  Archive, Upload, FileText, ExternalLink, Search, Download, RefreshCw, Eye,
} from 'lucide-react'
import { Button, Card, EmptyState, Modal, Input, Select, Table, THead, TBody, TR, TH, TD, Badge } from '../components/ui'
import { FiloKpi } from '../components/FiloOrtak'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { paraFmt } from '../lib/satisSozlesmeHesap'
import { sozlesmeFormunaGirebilirMi } from '../lib/sozlesmeArsivYetki'
import {
  arsivKayitlariGetir, arsivDosyaUrl, arsivImzaliYukle, arsivBelgeIcerigi,
  arsivFiltrele, arsivOzet, ARSIV_KAYNAKLARI, ARSIV_FILTRELERI, IMZA_DURUMLARI,
} from '../services/sozlesmeArsivService'

const trTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const norm = (s) => (s || '').toLocaleLowerCase('tr')

export default function SozlesmeArsivi() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const dosyaRef = useRef(null)
  // Yükleme hedefi state DEĞİL ref: input.click() aynı turda çalışır, state
  // güncellemesi bir sonraki render'a kalır — ref olmasa yanlış satıra yüklerdi.
  const hedefRef = useRef(null)

  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [filtre, setFiltre] = useState('tumu')
  const [kaynakFiltre, setKaynakFiltre] = useState('')
  const [arama, setArama] = useState('')
  const [yuklenen, setYuklenen] = useState(null)   // yükleme sürerken satır anahtarı
  const [onizleme, setOnizleme] = useState(null)   // { kayit, icerik }

  const formaGirebilir = sozlesmeFormunaGirebilirMi(kullanici)

  const yukle = async () => {
    setYukleniyor(true)
    const liste = await arsivKayitlariGetir()
    setKayitlar(liste)
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  const gorunen = useMemo(() => {
    const q = norm(arama).trim()
    return kayitlar.filter(k => {
      if (!arsivFiltrele(k, filtre)) return false
      if (kaynakFiltre && k.kaynak !== kaynakFiltre) return false
      if (!q) return true
      return [k.belgeNo, k.firma, k.baslik, k.ham?.teklifNo, k.sorumlu]
        .some(v => norm(v).includes(q))
    })
  }, [kayitlar, filtre, kaynakFiltre, arama])

  const ozet = useMemo(() => arsivOzet(kayitlar), [kayitlar])

  // ---------- İşlemler ----------

  const yuklemeBaslat = (k) => {
    if (!k.yuklenebilir) { toast.error(k.yuklemeEngeli || 'Bu kayda yükleme yapılamaz.'); return }
    hedefRef.current = k
    if (dosyaRef.current) { dosyaRef.current.value = ''; dosyaRef.current.click() }
  }

  const dosyaSecildi = async (e) => {
    const file = e.target.files?.[0]
    const kayit = hedefRef.current
    e.target.value = ''
    if (!file || !kayit) return
    setYuklenen(kayit.anahtar)
    const sonuc = await arsivImzaliYukle({ kayit, file, kullanici })
    setYuklenen(null)
    if (sonuc?._hata) { toast.error('Yüklenemedi: ' + sonuc._hata); return }
    toast.success(`${kayit.belgeNo} — imzalı nüsha arşive eklendi.`)
    yukle()
  }

  const belgeAc = async (k) => {
    const url = await arsivDosyaUrl(k)
    if (url) window.open(url, '_blank', 'noopener')
    else toast.error('Belge açılamadı. Dosya taşınmış olabilir.')
  }

  const onizlemeAc = async (k) => {
    const icerik = await arsivBelgeIcerigi(k)
    if (!icerik) { toast.error('Bu kaydın sistemde üretilmiş sözleşme metni yok.'); return }
    setOnizleme({ kayit: k, icerik })
  }

  const excelIndir = () => {
    if (!gorunen.length) { toast.error('Dışa aktarılacak kayıt yok.'); return }
    const satirlar = gorunen.map(k => ({
      'Belge No': k.belgeNo,
      'Tür': ARSIV_KAYNAKLARI[k.kaynak]?.isim || k.kaynak,
      'Müşteri / Bayi': k.firma,
      'Konu': k.baslik,
      'Tutar': k.tutar ?? '',
      'Para Birimi': k.paraBirimi || '',
      'Tarih': trTarih(k.tarih),
      'Durum': k.durumMetni,
      'İmza Durumu': IMZA_DURUMLARI[k.imzaDurumu]?.isim || '',
      'Bekleyen Gün': k.bekleyenGun ?? '',
      'İmzalı Nüsha': k.dosyaYolu ? 'VAR' : 'YOK',
      'İmza Tarihi': trTarih(k.imzaTarihi),
      'Sorumlu': k.sorumlu || '',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(satirlar), 'Sözleşme Arşivi')
    XLSX.writeFile(wb, `ZNA_Sozlesme_Arsivi_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ---------- Görünüm ----------

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Archive size={22} strokeWidth={1.75} /> Sözleşme Arşivi
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            Firmalara ilettiğimiz tüm sözleşmeler tek listede. İmza sonrası taranmış PDF'i satırdan yükleyin —
            yükleme yapıldığında sözleşme <strong>İmzalı</strong> duruma geçer.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} strokeWidth={1.5} />} onClick={yukle}>
            Yenile
          </Button>
          <Button variant="secondary" size="sm" iconLeft={<Download size={13} strokeWidth={1.5} />} onClick={excelIndir}>
            Excel
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <FiloKpi etiket="Arşivdeki Sözleşme" deger={ozet.toplam} />
        <FiloKpi etiket="İmza Bekleyen" deger={ozet.bekleyen} renk={ozet.bekleyen > 0 ? '#B45309' : 'var(--text-primary)'} />
        <FiloKpi etiket="İmzalı Nüsha Var" deger={ozet.imzali} renk={ozet.imzali > 0 ? '#15803D' : 'var(--text-primary)'} />
        <FiloKpi etiket="15+ Gündür Bekleyen" deger={ozet.geciken} renk={ozet.geciken > 0 ? '#DC2626' : 'var(--text-primary)'} />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {ARSIV_FILTRELERI.map(f => {
          const aktif = filtre === f.id
          return (
            <button key={f.id} onClick={() => setFiltre(f.id)}
              style={{
                padding: '5px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                border: `1px solid ${aktif ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                background: aktif ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                font: `${aktif ? 600 : 400} 12px/16px var(--font-sans)`,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
              }}>
              {f.isim}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
          <Search size={14} strokeWidth={1.5}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <Input value={arama} onChange={e => setArama(e.target.value)}
            placeholder="Sözleşme no, müşteri, konu, teklif no…" style={{ paddingLeft: 30 }} />
        </div>
        <Select value={kaynakFiltre} onChange={e => setKaynakFiltre(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">Tüm sözleşme türleri</option>
          {Object.entries(ARSIV_KAYNAKLARI).map(([id, k]) => <option key={id} value={id}>{k.isim}</option>)}
        </Select>
      </div>

      {yukleniyor ? <SkeletonList /> : gorunen.length === 0 ? (
        <EmptyState
          icon={<Archive size={32} strokeWidth={1.5} />}
          title={kayitlar.length ? 'Bu filtrede sözleşme yok' : 'Arşivde sözleşme yok'}
          description={kayitlar.length ? 'Farklı bir filtre veya arama deneyin.' : 'Satış ve bayi sözleşmeleri oluşturuldukça burada listelenir.'}
        />
      ) : (
        <Card style={{ padding: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Sözleşme</TH>
                <TH>Müşteri / Bayi</TH>
                <TH>Bedel</TH>
                <TH>Tarih</TH>
                <TH>İmza Durumu</TH>
                <TH>İmzalı Nüsha</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {gorunen.map(k => {
                const kaynak = ARSIV_KAYNAKLARI[k.kaynak] || {}
                const imza = IMZA_DURUMLARI[k.imzaDurumu] || {}
                const sirada = yuklenen === k.anahtar
                return (
                  <TR key={k.anahtar}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <strong>{k.belgeNo}</strong>
                        <Badge tone={kaynak.tone}>{kaynak.kisa}</Badge>
                        {k.revizyonNo > 0 && <Badge tone="uyari">Rev. {k.revizyonNo}</Badge>}
                      </div>
                      {k.baslik && <div className="t-caption" style={{ marginTop: 2 }}>{k.baslik}</div>}
                      <Badge tone={k.durumTone} style={{ marginTop: 3 }}>{k.durumMetni}</Badge>
                    </TD>
                    <TD>
                      <strong>{k.firma || '—'}</strong>
                      {k.sorumlu && <div className="t-caption">{k.sorumlu}</div>}
                    </TD>
                    <TD style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {k.tutar != null ? <strong>{paraFmt(k.tutar, k.paraBirimi)}</strong> : <span className="t-caption">—</span>}
                    </TD>
                    <TD>
                      <span className="t-caption">{trTarih(k.tarih)}</span>
                      {k.imzaTarihi && (
                        <div className="t-caption" style={{ color: 'var(--success)' }}>
                          İmza: {trTarih(k.imzaTarihi)}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={imza.tone}>{imza.isim}</Badge>
                      {k.imzaDurumu === 'bekliyor' && k.bekleyenGun != null && (
                        <div className="t-caption" style={{ marginTop: 2, color: k.bekleyenGun >= 15 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                          {k.bekleyenGun} gündür bekliyor
                        </div>
                      )}
                    </TD>
                    <TD>
                      {k.dosyaYolu ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                          <Button variant="ghost" size="sm" iconLeft={<FileText size={13} strokeWidth={1.5} />}
                            onClick={() => belgeAc(k)}>
                            PDF'i Aç
                          </Button>
                          {k.dosyaAdi && (
                            <span className="t-caption" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={k.dosyaAdi}>{k.dosyaAdi}</span>
                          )}
                        </div>
                      ) : k.yuklenebilir ? (
                        <span className="t-caption">Yüklenmedi</span>
                      ) : (
                        // Butonu gizleyip sebebi saklamak "bozuk" hissi verir —
                        // neden yapılamadığını satırda yazıyoruz.
                        <span className="t-caption" style={{ display: 'block', maxWidth: 190, color: 'var(--text-tertiary)' }}>
                          {k.yuklemeEngeli}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {k.yuklenebilir && (
                          <Button variant={k.dosyaYolu ? 'ghost' : 'primary'} size="sm" disabled={sirada}
                            iconLeft={<Upload size={13} strokeWidth={1.5} />}
                            onClick={() => yuklemeBaslat(k)}>
                            {sirada ? 'Yükleniyor…' : k.dosyaYolu ? 'Değiştir' : 'İmzalıyı Yükle'}
                          </Button>
                        )}
                        {k.kaynak !== 'genel' && (
                          <Button variant="ghost" size="sm" iconLeft={<Eye size={13} strokeWidth={1.5} />}
                            title="Sistemde üretilen sözleşme metnini göster" onClick={() => onizlemeAc(k)}>
                            Metin
                          </Button>
                        )}
                        {k.detayYolu && (k.kaynak !== 'satis' || formaGirebilir) && (
                          <Button variant="ghost" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />}
                            onClick={() => navigate(k.detayYolu)}>
                            Aç
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <input ref={dosyaRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={dosyaSecildi} />

      {onizleme && (
        <Modal open onClose={() => setOnizleme(null)}
          title={`${onizleme.kayit.belgeNo} — Sözleşme Metni`} width={900}>
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#fff' }}>
            {/* sandbox: arşivdeki gövde salt okunur gösterilir, script çalıştırmaz */}
            <iframe title="sozlesme-metni" srcDoc={onizleme.icerik} sandbox=""
              style={{ width: '100%', height: '70vh', border: 'none' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button variant="ghost" onClick={() => setOnizleme(null)}>Kapat</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
