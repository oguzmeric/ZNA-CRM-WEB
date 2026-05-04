import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { teklifGetir } from '../services/teklifService'
import StandartCikti from './teklifCikti/StandartCikti'
import TrassirCikti from './teklifCikti/TrassirCikti'
import KarelCikti from './teklifCikti/KarelCikti'

const ciktiMap = {
  standart: StandartCikti,
  trassir:  TrassirCikti,
  karel:    KarelCikti,
}

const tipSecenekleri = [
  { value: 'standart', label: 'Standart' },
  { value: 'trassir',  label: 'Trassir' },
  { value: 'karel',    label: 'Karel' },
]

export default function TeklifYazdir() {
  const { id } = useParams()
  const [teklif, setTeklif] = useState(null)
  const [seciliTip, setSeciliTip] = useState(null)
  const [excelYukleniyor, setExcelYukleniyor] = useState(false)

  useEffect(() => {
    teklifGetir(id).then((data) => {
      setTeklif(data)
      // İlk açılışta kaydedilmiş tip varsayılan olur — kullanıcı buradan değiştirebilir
      setSeciliTip(data?.teklifTipi || 'standart')
    })
  }, [id])

  if (!teklif || !seciliTip) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>
  }

  const Cikti = ciktiMap[seciliTip] || StandartCikti

  const excelIndir = async () => {
    setExcelYukleniyor(true)
    try {
      const { teklifiExcelOlarakIndir } = await import('../lib/teklifExport')
      // Anlık seçilen tipi kullan (kayıttaki tip yerine)
      await teklifiExcelOlarakIndir({ ...teklif, teklifTipi: seciliTip })
    } catch (err) {
      console.error('[Excel indir]', err)
      alert('Excel üretilirken hata: ' + (err?.message || 'bilinmeyen'))
    } finally {
      setExcelYukleniyor(false)
    }
  }

  const tipBtnStil = (tip) => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: seciliTip === tip ? 700 : 500,
    color: seciliTip === tip ? '#fff' : '#475569',
    background: seciliTip === tip ? '#0176D3' : '#fff',
    border: '1px solid ' + (seciliTip === tip ? '#0176D3' : '#cbd5e1'),
    cursor: 'pointer',
    transition: 'all 120ms',
  })

  return (
    <>
      {/* Format seçici — baskıda gizlenir */}
      <div className="no-print" style={{
        position: 'fixed', top: 16, left: 16,
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#fff', borderRadius: 8, padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 999,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginRight: 4 }}>Şablon:</span>
        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden' }}>
          {tipSecenekleri.map((t, i) => (
            <button
              key={t.value}
              onClick={() => setSeciliTip(t.value)}
              style={{
                ...tipBtnStil(t.value),
                borderTopLeftRadius:    i === 0 ? 6 : 0,
                borderBottomLeftRadius: i === 0 ? 6 : 0,
                borderTopRightRadius:    i === tipSecenekleri.length - 1 ? 6 : 0,
                borderBottomRightRadius: i === tipSecenekleri.length - 1 ? 6 : 0,
                marginLeft: i > 0 ? -1 : 0,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Yazdır + Excel butonları — baskıda gizlenir */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 999 }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#0176D3', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          🖨 Yazdır / PDF
        </button>
        <button
          onClick={excelIndir}
          disabled={excelYukleniyor}
          style={{
            background: '#0d9f6e', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 18px', fontSize: 13, cursor: excelYukleniyor ? 'wait' : 'pointer',
            fontWeight: 600, opacity: excelYukleniyor ? 0.6 : 1,
          }}
        >
          {excelYukleniyor ? 'Hazırlanıyor…' : '📊 Excel İndir'}
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          ✕ Kapat
        </button>
      </div>

      <Cikti teklif={teklif} />
    </>
  )
}
