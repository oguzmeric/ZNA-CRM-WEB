// Filo Yönetimi — Bakım / Belgeler / Yakıt / Sürücüler için ortak placeholder.
// Migration 095 + edge fn arac-km-sync deploy edildi; UI'lar aşamalı olarak
// ekleniyor. Şu an ortak durum sayfası: hızlı özet + yakında ekranı.

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Wrench, FileCheck, Fuel, UserCog, Car } from 'lucide-react'
import { Card, EmptyState, Button } from '../components/ui'
import { supabase } from '../lib/supabase'

const SEKMELER = [
  { yol: '/filo/bakim',    baslik: 'Araç Bakımları', ikon: Wrench,   aciklama: 'Periyodik bakım, servis geçmişi, sonraki bakım hatırlatıcıları.' },
  { yol: '/filo/belgeler', baslik: 'Araç Belgeleri', ikon: FileCheck, aciklama: 'Muayene, sigorta, kasko, ruhsat — bitiş tarihlerinden önce uyarı.' },
  { yol: '/filo/yakit',    baslik: 'Yakıt Fişleri',  ikon: Fuel,      aciklama: 'Yakıt gideri takibi, tüketim raporları (100km başına litre).' },
  { yol: '/filo/surucu',   baslik: 'Sürücüler',      ikon: UserCog,   aciklama: 'Araca atanan sürücüler, ehliyet takibi, sorumluluk ataması.' },
]

export default function FiloYonetimi() {
  const loc = useLocation()
  const aktif = SEKMELER.find(s => s.yol === loc.pathname) ?? SEKMELER[0]
  const [ozet, setOzet] = useState({ arac: 0, bakimYakin: 0, belgeYakin: 0 })

  useEffect(() => {
    (async () => {
      const { count: aracSayi } = await supabase
        .from('sirket_araclari').select('id', { count: 'exact', head: true }).eq('aktif', true)
      setOzet(o => ({ ...o, arac: aracSayi ?? 0 }))
    })()
  }, [])

  const kmSyncTetikle = async () => {
    const { data, error } = await supabase.functions.invoke('arac-km-sync')
    if (error) return alert('Sync hata: ' + error.message)
    alert(`✓ ${data?.kmGuncelleme ?? 0} araç KM'si güncellendi · ${data?.yeniBildirim ?? 0} yeni bildirim`)
  }

  const Ikon = aktif.ikon
  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 className="t-h1" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ikon size={22} strokeWidth={1.75} />
            {aktif.baslik}
          </h1>
          <p className="t-caption" style={{ marginTop: 4 }}>{aktif.aciklama}</p>
        </div>
        <Button variant="secondary" onClick={kmSyncTetikle}>
          Mobiltek KM Sync
        </Button>
      </div>

      {/* Özet stat */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <Card style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ font: '700 24px/28px var(--font-sans)' }}>{ozet.arac}</div>
          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>Aktif Araç</div>
        </Card>
        <Card style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ font: '700 24px/28px var(--font-sans)', color: '#f59e0b' }}>—</div>
          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>Bakım Yaklaşıyor</div>
        </Card>
        <Card style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ font: '700 24px/28px var(--font-sans)', color: '#dc2626' }}>—</div>
          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>Belge Yakın Bitiş</div>
        </Card>
      </div>

      <Card style={{ padding: 40 }}>
        <EmptyState
          icon={<Ikon size={40} />}
          title={aktif.baslik + ' — yakında'}
          aciklama="Altyapı hazır (migration 095 + arac-km-sync edge fn). CRUD ekranları aşamalı ekleniyor. Sen istersen bakım geçmişi, belge takibi ve yakıt fişi ekranlarını önce hangisiyle başlatalım?"
        />
      </Card>
    </div>
  )
}
