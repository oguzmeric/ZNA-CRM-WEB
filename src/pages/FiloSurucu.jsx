// Sürücüler — araç ↔ personel ataması + ehliyet takibi.
// Atama sirket_araclari.surucu_kullanici_id'de; ehliyet bilgisi kullanicilar'da (mig 143).

import { useEffect, useMemo, useState } from 'react'
import { UserCog, Pencil } from 'lucide-react'
import { Button, Card, Modal, Input, Select, Label, Table, THead, TBody, TR, TH, TD, Badge } from '../components/ui'
import { filoAraclariGetir, surucuAta, ehliyetGuncelle } from '../services/filoService'
import { fmtTarih, kalanGun, FiloKpi } from '../components/FiloOrtak'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { arrayToCamel } from '../lib/mapper'
import { SkeletonList } from '../components/Skeleton'

const EHLIYET_SINIFLARI = ['B', 'BE', 'C', 'CE', 'D', 'A2', 'M']

export default function FiloSurucu() {
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const [araclar, setAraclar] = useState([])
  const [personeller, setPersoneller] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [ehliyetModal, setEhliyetModal] = useState(null) // düzenlenen personel

  const yukle = async () => {
    const [a, { data: p }] = await Promise.all([
      filoAraclariGetir(),
      supabase.from('kullanicilar')
        .select('id, ad, rol, tip, ehliyet_sinifi, ehliyet_bitis')
        .neq('tip', 'musteri')
        .order('ad'),
    ])
    setAraclar(a)
    setPersoneller(arrayToCamel(p || []))
    setYukleniyor(false)
  }
  useEffect(() => { yukle() }, [])

  const isAdmin = kullanici?.rol === 'admin'

  const ata = async (aracId, kullaniciId) => {
    const sonuc = await surucuAta(aracId, kullaniciId ? Number(kullaniciId) : null)
    if (sonuc) { toast.success('Sürücü ataması güncellendi.'); yukle() }
    else toast.error('Atama kaydedilemedi.')
  }

  const ozet = useMemo(() => ({
    atanmis: araclar.filter(a => a.surucuKullaniciId).length,
    bos: araclar.filter(a => !a.surucuKullaniciId).length,
    ehliyetYaklasan: personeller.filter(p => {
      const g = kalanGun(p.ehliyetBitis)
      return g != null && g <= 60
    }).length,
  }), [araclar, personeller])

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <UserCog size={22} strokeWidth={1.75} /> Sürücüler
        </h1>
        <p className="t-caption" style={{ marginTop: 4 }}>
          Hangi araç kimde — sorumluluk ataması ve ehliyet geçerlilik takibi.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <FiloKpi etiket="Sürücü Atanmış" deger={ozet.atanmis} renk="var(--success)" />
        <FiloKpi etiket="Sürücüsüz Araç" deger={ozet.bos} renk={ozet.bos > 0 ? '#B45309' : 'var(--text-primary)'} />
        <FiloKpi etiket="Ehliyeti 60 Gün İçinde Bitecek" deger={ozet.ehliyetYaklasan} renk={ozet.ehliyetYaklasan > 0 ? '#DC2626' : 'var(--text-primary)'} />
      </div>

      {/* Araç → sürücü ataması */}
      <h2 className="t-h3" style={{ marginBottom: 8 }}>Araç Atamaları</h2>
      <Card style={{ padding: 0, marginBottom: 20 }}>
        <Table>
          <THead>
            <TR>
              <TH>Araç</TH>
              <TH>Sürücü</TH>
              <TH>Sürücü Ehliyeti</TH>
            </TR>
          </THead>
          <TBody>
            {araclar.map(a => {
              const surucu = personeller.find(p => p.id === a.surucuKullaniciId)
              const g = surucu ? kalanGun(surucu.ehliyetBitis) : null
              return (
                <TR key={a.id}>
                  <TD>
                    <strong>{a.plaka}</strong>
                    {(a.marka || a.model) && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[a.marka, a.model].filter(Boolean).join(' ')}</div>}
                  </TD>
                  <TD>
                    <Select
                      value={a.surucuKullaniciId || ''}
                      onChange={e => ata(a.id, e.target.value)}
                      disabled={!isAdmin}
                      style={{ maxWidth: 240 }}
                    >
                      <option value="">— Atanmadı —</option>
                      {personeller.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
                    </Select>
                  </TD>
                  <TD>
                    {surucu ? (
                      surucu.ehliyetBitis
                        ? (g < 0
                            ? <Badge tone="kayip">{surucu.ehliyetSinifi || ''} · süresi geçti!</Badge>
                            : g <= 60
                              ? <Badge tone="beklemede">{surucu.ehliyetSinifi || ''} · {g} gün kaldı</Badge>
                              : <Badge tone="aktif">{surucu.ehliyetSinifi || ''} · {fmtTarih(surucu.ehliyetBitis)}</Badge>)
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>ehliyet bilgisi yok</span>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </Card>

      {/* Personel ehliyetleri */}
      <h2 className="t-h3" style={{ marginBottom: 8 }}>Personel Ehliyetleri</h2>
      <Card style={{ padding: 0 }}>
        <Table>
          <THead>
            <TR>
              <TH>Personel</TH>
              <TH>Sınıf</TH>
              <TH>Geçerlilik</TH>
              <TH>Kullandığı Araç</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {personeller.map(p => {
              const arac = araclar.find(a => a.surucuKullaniciId === p.id)
              const g = kalanGun(p.ehliyetBitis)
              return (
                <TR key={p.id}>
                  <TD><strong>{p.ad}</strong></TD>
                  <TD>{p.ehliyetSinifi || <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}</TD>
                  <TD>
                    {p.ehliyetBitis
                      ? (g < 0
                          ? <Badge tone="kayip">{fmtTarih(p.ehliyetBitis)} · geçti</Badge>
                          : g <= 60
                            ? <Badge tone="beklemede">{fmtTarih(p.ehliyetBitis)} · {g} gün</Badge>
                            : <span>{fmtTarih(p.ehliyetBitis)}</span>)
                      : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </TD>
                  <TD>{arac ? <strong>{arac.plaka}</strong> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}</TD>
                  <TD>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" iconLeft={<Pencil size={13} strokeWidth={1.5} />} onClick={() => setEhliyetModal(p)}>
                        Düzenle
                      </Button>
                    )}
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </Card>

      {ehliyetModal && (
        <EhliyetModal
          personel={ehliyetModal}
          onKapat={() => setEhliyetModal(null)}
          onKaydedildi={() => { setEhliyetModal(null); yukle() }}
        />
      )}
    </div>
  )
}

function EhliyetModal({ personel, onKapat, onKaydedildi }) {
  const { toast } = useToast()
  const [sinif, setSinif] = useState(personel.ehliyetSinifi || '')
  const [bitis, setBitis] = useState(personel.ehliyetBitis || '')
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const kaydet = async () => {
    setKaydediliyor(true)
    const ok = await ehliyetGuncelle(personel.id, { ehliyetSinifi: sinif, ehliyetBitis: bitis })
    setKaydediliyor(false)
    if (ok) { toast.success('Ehliyet bilgisi güncellendi.'); onKaydedildi() }
    else toast.error('Kaydedilemedi.')
  }

  return (
    <Modal open onClose={onKapat} title={`Ehliyet — ${personel.ad}`} width={400}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <Label>Ehliyet Sınıfı</Label>
          <Select value={sinif} onChange={e => setSinif(e.target.value)}>
            <option value="">Seçiniz</option>
            {EHLIYET_SINIFLARI.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div>
          <Label>Geçerlilik Bitiş Tarihi</Label>
          <Input type="date" value={bitis} onChange={e => setBitis(e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onKapat} disabled={kaydediliyor}>Vazgeç</Button>
          <Button variant="primary" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
