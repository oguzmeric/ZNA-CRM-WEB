// Seri takipli urune toplu S/N ekleme modali.
// Her satir bir S/N — 'depoda' durumunda eklenir.

import { useState, useMemo, useEffect } from 'react'
import { Hash, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Modal, Button, Textarea, Label, Alert } from './ui'
import { stokKalemleriToplu, modelKalemleriniGetir, tumSeriNumaralariniGetir } from '../services/stokService'

export default function SnEkleModal({ open, onClose, urun, onEklendi }) {
  const [metin, setMetin] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [mevcutSeriler, setMevcutSeriler] = useState(new Set())
  const [globalSN, setGlobalSN] = useState(new Map())  // seri_no.lower → stok_kodu (başka ürün)

  // Modal her acildiginda mevcut seri no'lari cek — dublikasyon kontrolu icin
  useEffect(() => {
    if (!open || !urun?.stokKodu) return
    setMetin(''); setHata(''); setBasari('')
    Promise.all([
      modelKalemleriniGetir(urun.stokKodu),
      tumSeriNumaralariniGetir(),
    ])
      .then(([arr, gmap]) => {
        const set = new Set(
          (arr || []).filter(k => k.seriNo).map(k => k.seriNo.trim().toLowerCase())
        )
        setMevcutSeriler(set)
        setGlobalSN(gmap || new Map())
      })
      .catch(() => { setMevcutSeriler(new Set()); setGlobalSN(new Map()) })
  }, [open, urun?.stokKodu])

  const satirlar = useMemo(
    () => metin.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    [metin]
  )

  const analiz = useMemo(() => {
    const yeni = [], dublike = [], cakisma = [], baskaUrunde = []  // { sn, stokKodu }
    const goruldu = new Set()
    for (const s of satirlar) {
      const k = s.toLowerCase()
      if (goruldu.has(k)) { dublike.push(s); continue }
      goruldu.add(k)
      if (mevcutSeriler.has(k)) { cakisma.push(s); continue }
      const digerStok = globalSN.get(k)
      if (digerStok && digerStok !== urun?.stokKodu) {
        baskaUrunde.push({ sn: s, stokKodu: digerStok })
        continue
      }
      yeni.push(s)
    }
    return { yeni, dublike, cakisma, baskaUrunde }
  }, [satirlar, mevcutSeriler, globalSN, urun?.stokKodu])

  const kaydet = async () => {
    setHata(''); setBasari('')
    if (analiz.yeni.length === 0) { setHata('Eklenecek yeni S/N yok.'); return }
    setYukleniyor(true)
    try {
      const kalemler = analiz.yeni.map(seriNo => ({
        stokKodu: urun.stokKodu,
        seriNo,
        durum: 'depoda',
        marka: urun.marka || null,
        model: urun.stokAdi || null,
      }))
      const eklendi = await stokKalemleriToplu(kalemler)
      setBasari(`${eklendi.length} adet S/N eklendi.`)
      setMetin('')
      onEklendi?.()
    } catch (e) {
      setHata(e?.message || 'S/N ekleme başarısız.')
    } finally {
      setYukleniyor(false)
    }
  }

  const kapat = () => { if (!yukleniyor) onClose?.() }

  return (
    <Modal
      open={open}
      onClose={kapat}
      title="Seri Numarası Ekle"
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={kapat} disabled={yukleniyor}>
            {basari ? 'Kapat' : 'İptal'}
          </Button>
          <Button
            variant="primary"
            onClick={kaydet}
            disabled={yukleniyor || analiz.yeni.length === 0}
            iconLeft={<Hash size={14} strokeWidth={1.5} />}
          >
            {yukleniyor ? 'Ekleniyor…' : `${analiz.yeni.length} S/N ekle`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{urun?.stokAdi}</strong>
          {' '}({urun?.stokKodu}) için seri numaralarını gir. Her satıra bir S/N — Excel/Word'den de yapıştırabilirsin.
        </div>

        <div>
          <Label htmlFor="sn-textarea">Seri numaraları</Label>
          <Textarea
            id="sn-textarea"
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            placeholder={'SN-001\nSN-002\nSN-003\n…'}
            rows={10}
            disabled={yukleniyor}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}
            autoFocus
          />
        </div>

        {satirlar.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            background: 'var(--surface-sunken)', padding: 12, borderRadius: 'var(--radius)',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>YENİ</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--success)' }}>{analiz.yeni.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>BU ÜRÜNDE</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: analiz.cakisma.length > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{analiz.cakisma.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>BAŞKA ÜRÜNDE</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: analiz.baskaUrunde.length > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>{analiz.baskaUrunde.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>TEKRAR</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: analiz.dublike.length > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>{analiz.dublike.length}</div>
            </div>
          </div>
        )}

        {analiz.baskaUrunde.length > 0 && (
          <Alert tone="danger" icon={<AlertTriangle size={14} strokeWidth={1.5} />}>
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              <strong>Bu S/N/barkodlar başka bir ürüne kayıtlı!</strong> Aynı fiziksel seri numarası iki farklı ürüne verilemez.
              <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
                {analiz.baskaUrunde.slice(0, 5).map(x => (
                  <div key={x.sn}>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{x.sn}</span> → <strong>{x.stokKodu}</strong>
                  </div>
                ))}
                {analiz.baskaUrunde.length > 5 && <div>… (+{analiz.baskaUrunde.length - 5} daha)</div>}
              </div>
            </div>
          </Alert>
        )}

        {analiz.dublike.length > 0 && (
          <Alert tone="warning" icon={<AlertTriangle size={14} strokeWidth={1.5} />}>
            <div style={{ fontSize: 12.5 }}>
              Aynı S/N metinde tekrar ediyor, sadece 1 kez eklenir:{' '}
              <strong>{analiz.dublike.slice(0, 5).join(', ')}{analiz.dublike.length > 5 ? ` … (+${analiz.dublike.length - 5})` : ''}</strong>
            </div>
          </Alert>
        )}

        {analiz.cakisma.length > 0 && (
          <Alert tone="warning" icon={<AlertTriangle size={14} strokeWidth={1.5} />}>
            <div style={{ fontSize: 12.5 }}>
              Bu S/N'ler zaten bu üründe kayıtlı, eklenmez:{' '}
              <strong>{analiz.cakisma.slice(0, 5).join(', ')}{analiz.cakisma.length > 5 ? ` … (+${analiz.cakisma.length - 5})` : ''}</strong>
            </div>
          </Alert>
        )}

        {hata && <Alert tone="danger">{hata}</Alert>}
        {basari && (
          <Alert tone="success" icon={<CheckCircle2 size={14} strokeWidth={1.5} />}>{basari}</Alert>
        )}
      </div>
    </Modal>
  )
}
