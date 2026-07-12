// Personel tarafı tutanak yazdırma sayfası.
// Route: /demolar/:id/tutanak            → aktif zimmetin tutanağı
//        /demolar/:id/tutanak?z=<zimmetId> → geçmişteki bir zimmetin tutanağı
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button, EmptyState } from '../components/ui'
import { SkeletonDetay } from '../components/Skeleton'
import { demoCihazGetir, demoZimmetGecmisi } from '../services/demoService'
import DemoTutanak from './demoCikti/DemoTutanak'

export default function DemoTutanakYazdir() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const zimmetIdParam = searchParams.get('z')
  const [zimmet, setZimmet] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    Promise.all([demoCihazGetir(id), demoZimmetGecmisi(id)])
      .then(([cihaz, gecmis]) => {
        const z = zimmetIdParam
          ? gecmis.find(x => String(x.id) === String(zimmetIdParam))
          : gecmis.find(x => !x.gercekIadeTarihi) || gecmis[0]
        if (z && cihaz) {
          setZimmet({
            ...z,
            cihaz: { ad: cihaz.ad, marka: cihaz.marka, model: cihaz.model, seriNo: cihaz.seriNo, kategori: cihaz.kategori, notlar: cihaz.notlar },
            lokasyonAd: z.lokasyon?.ad || null,
          })
        }
      })
      .finally(() => setYukleniyor(false))
  }, [id, zimmetIdParam])

  if (yukleniyor) return <SkeletonDetay />
  if (!zimmet) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState title="Tutanak bulunamadı" description="Bu cihaz için zimmet kaydı yok." />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button variant="secondary" onClick={() => navigate(`/demolar/${id}`)}>Cihaza Dön</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#e5e7eb', minHeight: '100vh', padding: '16px 0' }}>
      <div className="no-print" style={{
        maxWidth: '210mm', margin: '0 auto 12px',
        display: 'flex', justifyContent: 'space-between', gap: 8,
      }}>
        <Button variant="secondary" iconLeft={<ArrowLeft size={14} strokeWidth={1.5} />} onClick={() => navigate(`/demolar/${id}`)}>
          Cihaza Dön
        </Button>
        <Button variant="primary" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={() => window.print()}>
          Yazdır / PDF
        </Button>
      </div>
      <DemoTutanak zimmet={zimmet} />
    </div>
  )
}
