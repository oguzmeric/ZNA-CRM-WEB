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

export default function TeklifYazdir() {
  const { id } = useParams()
  const [teklif, setTeklif] = useState(null)
  const [excelYukleniyor, setExcelYukleniyor] = useState(false)

  useEffect(() => {
    teklifGetir(id).then((data) => {
      setTeklif(data)
      setTimeout(() => window.print(), 600)
    })
  }, [id])

  if (!teklif) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>Yükleniyor...</div>

  const tip = teklif.teklifTipi || 'standart'
  const Cikti = ciktiMap[tip] || StandartCikti

  const excelIndir = async () => {
    setExcelYukleniyor(true)
    try {
      const { teklifiExcelOlarakIndir } = await import('../lib/teklifExport')
      await teklifiExcelOlarakIndir(teklif)
    } catch (err) {
      console.error('[Excel indir]', err)
      alert('Excel üretilirken hata: ' + (err?.message || 'bilinmeyen'))
    } finally {
      setExcelYukleniyor(false)
    }
  }

  return (
    <>
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
