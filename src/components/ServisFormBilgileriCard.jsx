// Servis raporu (form) icin gerekli ek bilgileri doldurmak icin kart.
// ServisTalepDetay sayfasinda kullanilir. Kaydet basilinca talepGuncelle cagrilir.
//
// Kayit edilen alanlar formun cikti komponentine (ServisFormu.jsx) yansir.
// Migration: 045_servis_form_alanlari.sql

import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Card, CardTitle, Button, Input, Label, Textarea } from './ui'

const SERVIS_TIPI = [
  { id: 'ariza',    label: 'Arıza Tespiti' },
  { id: 'bakim',    label: 'Bakım' },
  { id: 'urun',     label: 'Ürün Alımı' },
  { id: 'kurulum',  label: 'Kurulum' },
  { id: 'teslimat', label: 'Teslimat' },
]
const YUKUMLULUK = [
  { id: 'garanti', label: 'Garanti Kapsamında' },
  { id: 'servis',  label: 'Servis Sözleşmeli' },
  { id: 'bakim',   label: 'Bakım Sözleşmeli' },
]
const SERVIS_YERI = [
  { id: 'teknik',  label: 'ZNA Teknik Servis' },
  { id: 'yerinde', label: 'Müşteri Yerinde' },
  { id: 'online',  label: 'Online' },
  { id: 'diger',   label: 'Diğer' },
]

// 'ariza,bakim' -> Set('ariza','bakim')
const setOlustur = (s) => new Set((s || '').split(',').map(x => x.trim()).filter(Boolean))
const setToStr = (set) => Array.from(set).join(',')

// Checkbox group (multi-select)
function CheckGroup({ secenekler, secili, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {secenekler.map(s => {
        const aktif = secili.has(s.id)
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              const yeni = new Set(secili)
              if (aktif) yeni.delete(s.id); else yeni.add(s.id)
              onChange(yeni)
            }}
            style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              border: aktif ? '1.5px solid var(--accent, #1E5AA8)' : '1px solid var(--border-default)',
              background: aktif ? 'rgba(30,90,168,0.08)' : 'var(--surface-bg)',
              color: aktif ? 'var(--accent, #1E5AA8)' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: aktif ? 600 : 500,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: 3,
              border: '1.5px solid ' + (aktif ? 'var(--accent, #1E5AA8)' : 'var(--border-default)'),
              background: aktif ? 'var(--accent, #1E5AA8)' : 'transparent',
              color: '#fff', fontSize: 10, fontWeight: 900,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{aktif ? '✓' : ''}</span>
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

export default function ServisFormBilgileriCard({ talep, onKaydet }) {
  const [servisTipi, setServisTipi]    = useState(() => setOlustur(talep?.servisTipi))
  const [yukumluluk, setYukumluluk]    = useState(() => setOlustur(talep?.yukumluluk))
  const [servisYeri, setServisYeri]    = useState(() => setOlustur(talep?.servisYeri))
  const [seriNo, setSeriNo]            = useState(talep?.seriNumarasi || '')
  const [marka, setMarka]              = useState(talep?.marka || '')
  const [model, setModel]              = useState(talep?.model || '')
  const [kunye, setKunye]              = useState(talep?.kunyeNumarasi || '')
  const [cozumAciklamasi, setCozumAciklamasi] = useState(talep?.cozumAciklamasi || '')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [basariMsg, setBasariMsg] = useState(null)
  const [hata, setHata] = useState(null)

  // Talep degisirse local state'i tazele (realtime guncelleme)
  useEffect(() => {
    setServisTipi(setOlustur(talep?.servisTipi))
    setYukumluluk(setOlustur(talep?.yukumluluk))
    setServisYeri(setOlustur(talep?.servisYeri))
    setSeriNo(talep?.seriNumarasi || '')
    setMarka(talep?.marka || '')
    setModel(talep?.model || '')
    setKunye(talep?.kunyeNumarasi || '')
    setCozumAciklamasi(talep?.cozumAciklamasi || '')
  }, [talep?.id, talep?.servisTipi, talep?.yukumluluk, talep?.servisYeri,
      talep?.seriNumarasi, talep?.marka, talep?.model, talep?.kunyeNumarasi,
      talep?.cozumAciklamasi])

  const kaydet = async () => {
    setHata(null); setBasariMsg(null); setKaydediliyor(true)
    try {
      await onKaydet({
        servisTipi: setToStr(servisTipi),
        yukumluluk: setToStr(yukumluluk),
        servisYeri: setToStr(servisYeri),
        seriNumarasi: seriNo.trim() || null,
        marka: marka.trim() || null,
        model: model.trim() || null,
        kunyeNumarasi: kunye.trim() || null,
        cozumAciklamasi: cozumAciklamasi.trim() || null,
        // yedekParcalar BİLEREK yazılmıyor: artık servis_malzemeleri'nden DB
        // trigger'ı türetiyor. Buradan yazmak trigger'la yarışır ve listeyi ezerdi.
      })
      setBasariMsg('Form bilgileri kaydedildi.')
      setTimeout(() => setBasariMsg(null), 3000)
    } catch (e) {
      setHata(e?.message || 'Kayıt başarısız.')
    } finally {
      setKaydediliyor(false)
    }
  }

  // CSS değişkenli stil
  const labelStil = { display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }

  return (
    <Card style={{ marginTop: 20 }}>
      <CardTitle>Form Bilgileri</CardTitle>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: -8, marginBottom: 16 }}>
        Bu alanlar servis raporu (form çıktısı) için doldurulur.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Servis Tipi */}
        <div>
          <span style={labelStil}>Servis Tipi</span>
          <CheckGroup secenekler={SERVIS_TIPI} secili={servisTipi} onChange={setServisTipi} />
        </div>

        {/* Yukumluluk */}
        <div>
          <span style={labelStil}>Yükümlülük</span>
          <CheckGroup secenekler={YUKUMLULUK} secili={yukumluluk} onChange={setYukumluluk} />
        </div>

        {/* Servis Yeri */}
        <div>
          <span style={labelStil}>Servis Yeri</span>
          <CheckGroup secenekler={SERVIS_YERI} secili={servisYeri} onChange={setServisYeri} />
        </div>

        {/* Sistem Bilgileri */}
        <div style={{
          background: 'var(--surface-subtle)', borderRadius: 10, padding: 14,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        }}>
          <div>
            <Label htmlFor="sf-seri">Seri Numarası</Label>
            <Input id="sf-seri" value={seriNo} onChange={e => setSeriNo(e.target.value)} placeholder="—" />
          </div>
          <div>
            <Label htmlFor="sf-kunye">Künye Numarası</Label>
            <Input id="sf-kunye" value={kunye} onChange={e => setKunye(e.target.value)} placeholder="—" />
          </div>
          <div>
            <Label htmlFor="sf-marka">Marka</Label>
            <Input id="sf-marka" value={marka} onChange={e => setMarka(e.target.value)} placeholder="—" />
          </div>
          <div>
            <Label htmlFor="sf-model">Model</Label>
            <Input id="sf-model" value={model} onChange={e => setModel(e.target.value)} placeholder="—" />
          </div>
        </div>

        {/* Yapilan Islemler (cozum aciklamasi) */}
        <div>
          <Label htmlFor="sf-cozum">Yapılan İşlemler (Çözüm Açıklaması)</Label>
          <Textarea
            id="sf-cozum"
            value={cozumAciklamasi}
            onChange={(e) => setCozumAciklamasi(e.target.value)}
            placeholder="Sahada/Atölyede yapılan işlemleri, takılan parçaları, test sonuçlarını yazın."
            rows={5}
          />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Bu metin servis raporunda "YAPILAN İŞLEMLER" bölümünde basılır.
          </div>
        </div>

        {/* Yedek parca girisi buradan KALKTI (mig 170): artik "Kullanilan
            Malzemeler" karti tek kaynak. Iki ayri editor olsaydi biri stogu,
            digeri musteri formunu yazacak ve ikisi surekli birbirini ezecekti. */}
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 12,
          background: "var(--surface-subtle)", border: "1px dashed var(--border-subtle)",
          color: "var(--text-tertiary)",
        }}>
          Yedek parça / hizmet satırları artık yukarıdaki <strong>Kullanılan Malzemeler</strong>
          {" "}kartından girilir — oradan eklenen malzemeler stoktan düşer ve müşteri formuna
          {" "}aynen basılır.
        </div>

        {/* Hata/Basari */}
        {hata && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', color: '#991B1B', fontSize: 13 }}>
            {hata}
          </div>
        )}
        {basariMsg && (
          <div style={{ background: '#E8F7EE', border: '1px solid #10B981', borderRadius: 8, padding: '10px 14px', color: '#065F46', fontSize: 13 }}>
            ✓ {basariMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" iconLeft={<Save size={14} />} onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Form Bilgilerini Kaydet'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
