// Servis talebinde kullanılan malzemeler (Stok v2 Faz 4, mig 153).
// Spec: teknisyen malzemeyi ad/model/teknik özellikle arar (AkilliUrunSecici),
// SN'li üründe teknisyendeki SN seçilir ve kullanım kaydıyla birlikte kalem
// 'sahada' durumuna düşer (teknisyen deposundan düşüm). Silmede geri alınır.
import { useState, useEffect } from 'react'
import { Package, Trash2, Tag } from 'lucide-react'
import { Button, Card, Badge, Input, CodeBadge } from './ui'
import CustomSelect from './CustomSelect'
import AkilliUrunSecici from './AkilliUrunSecici'
import { stokUrunleriniGetir } from '../services/stokService'
import {
  servisMalzemeleriGetir, servisMalzemeEkle, servisMalzemeSil, teknisyendekiKalemler,
} from '../services/servisMalzemeService'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'

const tarihFmt = (t) => t
  ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function ServisMalzemeleriCard({ servisId, servisKodu }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [malzemeler, setMalzemeler] = useState([])
  const [urunler, setUrunler] = useState([])
  const [seciliUrun, setSeciliUrun] = useState(null)
  const [miktar, setMiktar] = useState(1)
  const [snKalemler, setSnKalemler] = useState([])   // seçili ürün SN'liyse teknisyendeki kalemler
  const [seciliKalemId, setSeciliKalemId] = useState('')
  const [mesgul, setMesgul] = useState(false)

  useEffect(() => {
    servisMalzemeleriGetir(servisId).then(setMalzemeler)
    stokUrunleriniGetir()
      .then(d => setUrunler((d || []).filter(u => u.aktif !== false)))
      .catch(() => setUrunler([]))
  }, [servisId])

  // Ürün seçilince: SN'liyse teknisyendeki kalemleri getir
  const urunSec = async (u) => {
    setSeciliUrun(u)
    setSeciliKalemId('')
    setSnKalemler([])
    if (u.seriTakipli) {
      const kalemler = await teknisyendekiKalemler(u.stokKodu)
      setSnKalemler(kalemler)
    }
  }

  const ekle = async () => {
    if (!seciliUrun) return
    if (seciliUrun.seriTakipli && !seciliKalemId) {
      toast.error('Bu ürün S/N takipli — teknisyendeki seri numarasını seçin.')
      return
    }
    setMesgul(true)
    try {
      const kalem = seciliUrun.seriTakipli
        ? snKalemler.find(k => k.id === Number(seciliKalemId))
        : null
      const yeni = await servisMalzemeEkle({
        servisId, servisKodu,
        urun: seciliUrun,
        miktar: seciliUrun.seriTakipli ? 1 : miktar,
        kalem,
      })
      setMalzemeler(prev => [yeni, ...prev])
      toast.success(kalem
        ? `${kalem.seriNo} teknisyen deposundan düşüldü (sahada).`
        : 'Malzeme eklendi.')
      setSeciliUrun(null)
      setMiktar(1)
      setSnKalemler([])
      setSeciliKalemId('')
    } catch (e) {
      toast.error(e?.message || 'Malzeme eklenemedi.')
    } finally { setMesgul(false) }
  }

  const sil = async (m) => {
    const onay = await confirm({
      baslik: 'Malzemeyi Kaldır',
      mesaj: m.seriNo
        ? `${m.urunAdi} (${m.seriNo}) kaydı silinecek ve SN teknisyen deposuna GERİ alınacak. Emin misin?`
        : `${m.urunAdi} kaydı silinecek (stok girişi geri yazılır). Emin misin?`,
      onayMetin: 'Kaldır', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    try {
      await servisMalzemeSil(m, servisKodu)
      setMalzemeler(prev => prev.filter(x => x.id !== m.id))
      toast.success('Malzeme kaydı kaldırıldı.')
    } catch (e) {
      toast.error(e?.message || 'Kaldırılamadı.')
    }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Package size={16} strokeWidth={1.5} />
        <h3 className="t-h2" style={{ fontSize: 14, margin: 0 }}>
          Kullanılan Malzemeler {malzemeler.length > 0 && <span className="tabular-nums">({malzemeler.length})</span>}
        </h3>
      </div>

      {/* Ekleme satırı — akıllı arama: "2 mp dome kamera" veya model/kod */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: 2, minWidth: 220 }}>
          <AkilliUrunSecici
            urunler={urunler}
            value={seciliUrun?.stokKodu || ''}
            placeholder="Malzeme ara — akıllı arama…"
            onSec={urunSec}
          />
        </div>
        {seciliUrun?.seriTakipli ? (
          <div style={{ flex: 1.4, minWidth: 200 }}>
            <CustomSelect value={seciliKalemId} onChange={e => setSeciliKalemId(e.target.value)}>
              <option value="">
                {snKalemler.length === 0 ? 'Teknisyende SN yok!' : 'Teknisyendeki SN seç…'}
              </option>
              {snKalemler.map(k => (
                <option key={k.id} value={k.id}>
                  {k.seriNo} — {k.teknisyen?.ad || 'teknisyen ?'}
                </option>
              ))}
            </CustomSelect>
          </div>
        ) : (
          <div style={{ width: 90 }}>
            <Input
              type="number"
              className="sayi-sade"
              min="0.001"
              value={miktar}
              onChange={e => setMiktar(e.target.value)}
              placeholder="Miktar"
              style={{ textAlign: 'right' }}
            />
          </div>
        )}
        <Button variant="primary" size="sm" onClick={ekle} disabled={mesgul || !seciliUrun}>
          {mesgul ? 'Ekleniyor…' : 'Ekle'}
        </Button>
      </div>
      {seciliUrun?.seriTakipli && snKalemler.length === 0 && (
        <p className="t-caption" style={{ color: 'var(--warning)', marginTop: -6, marginBottom: 10 }}>
          Bu üründen hiçbir teknisyenin üzerinde SN yok — önce ModelDetay'dan "Teknisyene Ver" yapılmalı.
        </p>
      )}

      {/* Liste */}
      {malzemeler.length === 0 ? (
        <p className="t-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
          Henüz malzeme eklenmedi. SN'li ürünlerde kullanım, teknisyen deposundan otomatik düşer.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {malzemeler.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ font: '500 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                    {m.urunAdi}
                  </span>
                  {m.stokKodu && <CodeBadge>{m.stokKodu}</CodeBadge>}
                  {m.seriNo && (
                    <Badge tone="brand">
                      <Tag size={10} strokeWidth={1.5} style={{ marginRight: 3 }} />{m.seriNo}
                    </Badge>
                  )}
                </div>
                <div className="t-caption" style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                  <span className="tabular-nums">{m.miktar}</span> {m.birim || 'Adet'} · {m.kullaniciAd || '—'} · {tarihFmt(m.tarih)}
                </div>
              </div>
              <button
                aria-label="Malzemeyi kaldır"
                title={m.seriNo ? 'Kaldır — SN teknisyene geri döner' : 'Kaldır'}
                onClick={() => sil(m)}
                style={{
                  width: 28, height: 28, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: '1px solid var(--border-default)',
                  color: 'var(--danger)',
                }}
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
