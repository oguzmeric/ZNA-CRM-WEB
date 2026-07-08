// Kritik seviye altındaki ürünler — satılabilir < min_stok.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Package } from 'lucide-react'
import { kritikSeviyeUrunler } from '../services/depoService'
import { Card, Badge, EmptyState, Table, THead, TBody, TR, TH, TD, CodeBadge } from '../components/ui'
import { SkeletonList } from '../components/Skeleton'

export default function StokKritik() {
  const navigate = useNavigate()
  const [liste, setListe] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    kritikSeviyeUrunler()
      .then(setListe)
      .catch(e => console.error('[StokKritik]', e))
      .finally(() => setYukleniyor(false))
  }, [])

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={22} strokeWidth={1.5} style={{ color: 'var(--danger)' }} />
          <h1 className="t-h2" style={{ margin: 0 }}>Kritik Seviye</h1>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
          Satılabilir bakiye (mevcut − rezerve) minimum stoğun altında olan ürünler.
        </div>
      </div>

      <Card>
        {liste.length === 0 ? (
          <EmptyState
            icon={<Package size={40} strokeWidth={1.5} />}
            title="Tüm ürünler yeterli seviyede"
            description="Kritik seviye altına düşen ürün yok. 👍"
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Stok Kodu</TH>
                <TH>Ürün</TH>
                <TH style={{ textAlign: 'right' }}>Mevcut</TH>
                <TH style={{ textAlign: 'right' }}>Rezerve</TH>
                <TH style={{ textAlign: 'right' }}>Satılabilir</TH>
                <TH style={{ textAlign: 'right' }}>Min Stok</TH>
                <TH style={{ textAlign: 'right' }}>Eksik</TH>
              </TR>
            </THead>
            <TBody>
              {liste.map(u => {
                const eksik = (u.min_stok || 0) - u.satilabilir
                return (
                  <TR key={u.id}
                    onClick={() => navigate(`/stok/model/${u.stok_kodu}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <TD><CodeBadge>{u.stok_kodu}</CodeBadge></TD>
                    <TD>
                      <div style={{ fontWeight: 600 }}>{u.stok_adi}</div>
                      {u.marka && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{u.marka}</div>}
                    </TD>
                    <TD style={{ textAlign: 'right' }}>{u.gercek_bakiye}</TD>
                    <TD style={{ textAlign: 'right', color: u.rezerve_adet > 0 ? '#8b5cf6' : 'var(--text-tertiary)' }}>
                      {u.rezerve_adet}
                    </TD>
                    <TD style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{u.satilabilir}</TD>
                    <TD style={{ textAlign: 'right' }}>{u.min_stok}</TD>
                    <TD style={{ textAlign: 'right' }}>
                      <Badge tone="kayip">{eksik > 0 ? `-${eksik}` : '0'}</Badge>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
