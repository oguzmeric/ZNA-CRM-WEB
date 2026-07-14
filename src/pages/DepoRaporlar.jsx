// Stok değeri (₺) + teknisyen aylık depo raporu + servisteki ürünler.
import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { BarChart3, Truck, PackageCheck, XCircle, Wallet, Warehouse, Plus, EyeOff, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  teknisyenAylikRapor, acikRMAlar, rmaGeriDondu, RMA_SONUCLARI,
  depolariGetir, depoEkle, depoGuncelle, depoBazliSayilar, DEPO_TIPLERI,
} from '../services/depoService'
import { stokUrunleriniGetir, stokHareketleriniGetir, stokKalemOzetleriniGetir } from '../services/stokService'
import { Button, Card, Badge, EmptyState, Table, THead, TBody, TR, TH, TD, CodeBadge, Input } from '../components/ui'
import { SkeletonList } from '../components/Skeleton'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import CustomSelect from '../components/CustomSelect'

const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const buAy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const fmtTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR') : '—'
const fmtTarihSaat = (t) => t
  ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function DepoRaporlar() {
  const { toast } = useToast()
  const [personel, setPersonel] = useState([])
  const [seciliId, setSeciliId] = useState('')
  const [ay, setAy] = useState(buAy())
  const [rapor, setRapor] = useState(null)
  const [rmalar, setRmalar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [donusModal, setDonusModal] = useState(null)  // { rma }

  const rmalariYenile = () => acikRMAlar().then(setRmalar).catch(e => console.error(e))

  // Stok değeri raporu verileri (bakiye hesabı Stok.jsx ile aynı mantık)
  const [urunler, setUrunler] = useState([])
  const [hareketler, setHareketler] = useState([])
  const [kalemOzetleri, setKalemOzetleri] = useState(new Map())

  useEffect(() => {
    Promise.all([
      supabase.from('kullanicilar').select('id, ad, rol').order('ad'),
      acikRMAlar(),
      stokUrunleriniGetir(),
      stokHareketleriniGetir(),
      stokKalemOzetleriniGetir(),
    ])
      .then(([r1, r2, u, h, ko]) => {
        // Yöneticiler teknisyen listesine girmesin — isim regex'i yerine rol
        // (eski hardcoded 'oğuz|ali|ferdi' filtresi yeni yönetici atanınca bozuluyordu)
        const list = (r1?.data || []).filter(k => k.rol !== 'admin')
        setPersonel(list)
        setRmalar(r2 || [])
        setUrunler(u || [])
        setHareketler(h || [])
        setKalemOzetleri(ko || new Map())
        if (list.length) setSeciliId(list[0].id)
      })
      .catch(e => {
        console.error('[DepoRaporlar]', e)
        toast.error('Rapor verileri yüklenemedi: ' + (e?.message || 'bilinmeyen hata'))
      })
      .finally(() => setYukleniyor(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stok değeri: bakiye × alış fiyatı. SN'li üründe bakiye = kalem sayısı
  // (hurda hariç), değilse hareket bazlı — Stok.jsx stokBakiye ile birebir.
  const stokDegeri = useMemo(() => {
    const bakiyeHesapla = (u) => {
      if (u.seriTakipli) {
        const ko = kalemOzetleri.get(u.stokKodu)
        return Math.max(0, (Number(ko?.toplam) || 0) - (Number(ko?.hurda) || 0))
      }
      return hareketler
        .filter(h => h.stokKodu === u.stokKodu)
        .reduce((t, h) => {
          if (h.hareketTipi === 'giris' || h.hareketTipi === 'transfer_giris') return t + Number(h.miktar)
          if (h.hareketTipi === 'cikis' || h.hareketTipi === 'transfer_cikis') return t - Number(h.miktar)
          return t
        }, 0)
    }
    let toplam = 0
    let fiyatsizUrun = 0
    const gruplar = new Map() // grupKodu → { deger, urunSayisi }
    const detay = []
    for (const u of urunler) {
      const bakiye = bakiyeHesapla(u)
      if (bakiye <= 0) continue
      const alis = Number(u.alisFiyat || 0)
      if (!(alis > 0)) { fiyatsizUrun++; continue }
      const deger = bakiye * alis
      toplam += deger
      const grup = u.grupKodu || 'GRUPSUZ'
      const g = gruplar.get(grup) || { deger: 0, urunSayisi: 0 }
      g.deger += deger
      g.urunSayisi++
      gruplar.set(grup, g)
      detay.push({ ...u, bakiye, deger })
    }
    detay.sort((a, b) => b.deger - a.deger)
    const grupListe = [...gruplar.entries()]
      .map(([grup, g]) => ({ grup, ...g }))
      .sort((a, b) => b.deger - a.deger)
    return { toplam, fiyatsizUrun, grupListe, detay }
  }, [urunler, hareketler, kalemOzetleri])

  useEffect(() => {
    if (!seciliId || !ay) return
    teknisyenAylikRapor(seciliId, ay).then(setRapor).catch(e => console.error('[rapor]', e))
  }, [seciliId, ay])

  if (yukleniyor) return <SkeletonList />

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BarChart3 size={22} strokeWidth={1.5} />
        <h1 className="t-h2" style={{ margin: 0 }}>Depo Raporları</h1>
      </div>

      {/* Depolar (Faz 4, mig 153) — Araç/Proje/Geçici depo yönetimi + doluluk */}
      <DepolarKarti />

      {/* Stok Değeri (₺) — bakiye × alış fiyatı */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Wallet size={16} strokeWidth={1.5} />
          <h3 className="t-h2" style={{ fontSize: 14, margin: 0 }}>Stok Değeri</h3>
          {stokDegeri.fiyatsizUrun > 0 && (
            <span style={{ fontSize: 11, color: 'var(--warning, #B45309)' }}>
              ⚠ {stokDegeri.fiyatsizUrun} üründe alış fiyatı girilmemiş (hesaba dahil değil)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>TOPLAM STOK DEĞERİ</div>
            <div style={{ fontWeight: 700, fontSize: 26, color: 'var(--brand-primary, #1E5AA8)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtTL(stokDegeri.toplam)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>DEĞERLİ ÜRÜN</div>
            <div style={{ fontWeight: 700, fontSize: 26 }}>{stokDegeri.detay.length}</div>
          </div>
        </div>
        {stokDegeri.grupListe.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 14 }}>
            {stokDegeri.grupListe.slice(0, 8).map(g => (
              <div key={g.grup} style={{
                padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{g.grup}</div>
                <div style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmtTL(g.deger)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{g.urunSayisi} ürün</div>
              </div>
            ))}
          </div>
        )}
        {stokDegeri.detay.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 8 }}>
            Değer hesabı için stok kartlarına alış fiyatı girin (Stok Kartları → düzenle → Alış fiyatı).
          </div>
        ) : (
          <Table>
            <THead><TR><TH>Stok</TH><TH>Ürün</TH><TH>Grup</TH><TH style={{ textAlign: 'right' }}>Bakiye</TH><TH style={{ textAlign: 'right' }}>Alış ₺</TH><TH style={{ textAlign: 'right' }}>Değer ₺</TH></TR></THead>
            <TBody>
              {stokDegeri.detay.slice(0, 15).map(u => (
                <TR key={u.id}>
                  <TD><CodeBadge>{u.stokKodu}</CodeBadge></TD>
                  <TD>{u.stokAdi}</TD>
                  <TD>{u.grupKodu || '—'}</TD>
                  <TD style={{ textAlign: 'right' }} className="tabular-nums">{u.bakiye}</TD>
                  <TD style={{ textAlign: 'right' }} className="tabular-nums">{fmtTL(u.alisFiyat)}</TD>
                  <TD style={{ textAlign: 'right', fontWeight: 700 }} className="tabular-nums">{fmtTL(u.deger)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {stokDegeri.detay.length > 15 && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
            En değerli 15 ürün gösteriliyor — tam liste için Stok Kartları'ndan "Excel indir".
          </div>
        )}
      </Card>

      {/* Açık RMA */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Truck size={16} strokeWidth={1.5} />
          <h3 className="t-h2" style={{ fontSize: 14, margin: 0 }}>Servisteki Ürünler — Dönüş Bekleniyor ({rmalar.length})</h3>
        </div>
        {rmalar.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 8 }}>Servisten dönüşü bekleyen kayıt yok.</div>
        ) : (
          <Table>
            <THead><TR><TH>SN</TH><TH>Ürün</TH><TH>Tedarikçi</TH><TH>Kargo</TH><TH>Gönderim</TH><TH>Tahmini Dönüş</TH><TH style={{ textAlign: 'right' }}>İşlem</TH></TR></THead>
            <TBody>
              {rmalar.map(r => (
                <TR key={r.id}>
                  <TD><CodeBadge>{r.kalem?.seri_no || '—'}</CodeBadge></TD>
                  <TD>{[r.kalem?.marka, r.kalem?.model].filter(Boolean).join(' ')}</TD>
                  <TD>{r.tedarikci_ad}</TD>
                  <TD>{r.kargo_no || '—'}</TD>
                  <TD>{fmtTarih(r.gonderim_tarih)}</TD>
                  <TD>{r.tahmini_donus ? fmtTarih(r.tahmini_donus) : '—'}</TD>
                  <TD style={{ textAlign: 'right' }}>
                    <Button size="sm" variant="secondary" iconLeft={<PackageCheck size={12} strokeWidth={1.5} />}
                      onClick={() => setDonusModal({ rma: r })}>
                      Servisten Döndü
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Teknisyen aylık */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 className="t-h2" style={{ fontSize: 14, margin: 0 }}>Teknisyen Aylık Rapor</h3>
          <select value={seciliId} onChange={e => setSeciliId(Number(e.target.value))} style={selectStil}>
            {personel.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
          </select>
          <input type="month" value={ay} onChange={e => setAy(e.target.value)} style={{ ...selectStil, maxWidth: 160 }} />
        </div>
        {rapor && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
            <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Toplam Hareket</div><div style={{ fontWeight: 700, fontSize: 22 }}>{rapor.ozet.toplam}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Çıkış</div><div style={{ fontWeight: 700, fontSize: 22, color: '#a855f7' }}>{rapor.ozet.cikis}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>İade</div><div style={{ fontWeight: 700, fontSize: 22, color: 'var(--success)' }}>{rapor.ozet.giris}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Arıza</div><div style={{ fontWeight: 700, fontSize: 22, color: '#f59e0b' }}>{rapor.ozet.ariza}</div></div>
          </div>
        )}
        {!rapor || rapor.hareketler.length === 0 ? (
          <EmptyState icon={<BarChart3 size={40} strokeWidth={1.5} />} title="Bu ay hareket yok" description="Farklı bir ay veya teknisyen seç." />
        ) : (
          <Table>
            <THead><TR><TH>Tarih</TH><TH>Stok Kodu</TH><TH>Tip</TH><TH>Açıklama</TH></TR></THead>
            <TBody>
              {rapor.hareketler.map(h => (
                <TR key={h.id}>
                  <TD>{fmtTarihSaat(h.tarih)}</TD>
                  <TD><CodeBadge>{h.stok_kodu}</CodeBadge></TD>
                  <TD><Badge tone="neutral">{h.hareket_tipi}</Badge></TD>
                  <TD style={{ fontSize: 12 }}>{h.aciklama}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {donusModal && (
        <ServisDonusModal
          rma={donusModal.rma}
          onKapat={() => setDonusModal(null)}
          onKaydet={async (payload) => {
            try {
              await rmaGeriDondu(donusModal.rma.id, payload)
              toast.success('Servisten dönüş işlendi.')
              setDonusModal(null)
              await rmalariYenile()
            } catch (e) {
              toast.error(e?.message || 'İşlem hatası')
            }
          }}
        />
      )}
    </div>
  )
}

function ServisDonusModal({ rma, onKapat, onKaydet }) {
  const [sonuc, setSonuc] = useState('onarildi')
  const [notlar, setNotlar] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const kaydet = async () => {
    setKaydediliyor(true)
    try { await onKaydet({ sonuc, notlar }) }
    finally { setKaydediliyor(false) }
  }
  const sn = rma?.kalem?.seri_no || '—'
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface-card)', color: 'var(--text-primary)',
        borderRadius: 12, padding: 24, maxWidth: 520, width: '100%', maxHeight: '85vh', overflow: 'auto',
        border: '1px solid var(--border-default)',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Servisten Döndü — Sonucu İşle</h3>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'monospace' }}>
          SN: {sn} — {rma.tedarikci_ad}
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Sonuç</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {RMA_SONUCLARI.map(s => (
            <button key={s.id} onClick={() => setSonuc(s.id)}
              style={{
                padding: '10px 12px', borderRadius: 8,
                background: sonuc === s.id ? s.renk : 'var(--surface-sunken)',
                color: sonuc === s.id ? '#fff' : 'var(--text-primary)',
                border: `1px solid ${sonuc === s.id ? s.renk : 'var(--border-default)'}`,
                cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>{s.ad}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
          Onarıldı/Değiştirildi → depoya alınır. Kabul edilmedi → hurda. İptal → durum değişmez.
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginTop: 14, marginBottom: 6 }}>Notlar</label>
        <textarea rows={2} value={notlar} onChange={e => setNotlar(e.target.value)}
          placeholder="Fatura no, garanti kapsamı, dönüş bilgisi vb."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
            color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box',
            resize: 'vertical', fontFamily: 'inherit',
          }} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Button variant="secondary" size="sm" onClick={onKapat}>İptal</Button>
          <Button variant="primary" size="sm" onClick={kaydet} disabled={kaydediliyor}>
            {kaydediliyor ? 'Kaydediliyor…' : 'İşle'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const selectStil = {
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border-default)', background: 'var(--surface-sunken)',
  color: 'var(--text-primary)', fontSize: 14,
}

// ─────────────────────────────────────────────────────────────
// DepolarKarti — depo listesi + doluluk + admin ekle/pasif (Faz 4)
// ─────────────────────────────────────────────────────────────
function DepolarKarti() {
  const { toast } = useToast()
  const { kullanici } = useAuth()
  const admin = kullanici?.rol === 'admin'
  const [depolar, setDepolar] = useState([])
  const [sayilar, setSayilar] = useState(new Map())
  const [yeniAd, setYeniAd] = useState('')
  const [yeniTip, setYeniTip] = useState('arac')
  const [ekleAcik, setEkleAcik] = useState(false)
  const [mesgul, setMesgul] = useState(false)

  const yukle = () => {
    Promise.all([depolariGetir(true), depoBazliSayilar()])
      .then(([d, s]) => { setDepolar(d || []); setSayilar(s || new Map()) })
      .catch(e => console.error('[DepolarKarti]', e))
  }
  useEffect(() => { yukle() }, [])

  const tipBilgi = (tip) => DEPO_TIPLERI.find(t => t.id === tip) || { ad: tip, ikon: '📦' }
  // Merkez: depo_id NULL kayıtlar + merkez deposuna atananlar
  const depoAdet = (d) => d.tip === 'merkez'
    ? (sayilar.get(null) || 0) + (sayilar.get(d.id) || 0)
    : (sayilar.get(d.id) || 0)

  const ekle = async () => {
    if (!yeniAd.trim()) return
    setMesgul(true)
    try {
      await depoEkle({ ad: yeniAd, tip: yeniTip })
      setYeniAd(''); setEkleAcik(false)
      yukle()
      toast.success('Depo eklendi.')
    } catch (e) { toast.error(e?.message || 'Depo eklenemedi.') }
    finally { setMesgul(false) }
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Warehouse size={16} strokeWidth={1.5} />
        <h3 className="t-h2" style={{ fontSize: 14, margin: 0 }}>Depolar</h3>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          SN'ler ModelDetay'daki 📦 butonuyla depoya atanır; atanmayanlar Merkez'de sayılır
        </span>
        {admin && !ekleAcik && (
          <Button variant="secondary" size="sm" iconLeft={<Plus size={12} strokeWidth={1.5} />}
            onClick={() => setEkleAcik(true)} style={{ marginLeft: 'auto' }}>
            Depo ekle
          </Button>
        )}
      </div>

      {admin && ekleAcik && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input value={yeniAd} onChange={e => setYeniAd(e.target.value)}
              placeholder="Depo adı — örn. Vito Araç Deposu"
              onKeyDown={e => { if (e.key === 'Enter') ekle() }} autoFocus />
          </div>
          <div style={{ minWidth: 160 }}>
            <CustomSelect value={yeniTip} onChange={e => setYeniTip(e.target.value)}>
              {DEPO_TIPLERI.filter(t => t.id !== 'merkez').map(t => (
                <option key={t.id} value={t.id}>{t.ikon} {t.ad}</option>
              ))}
            </CustomSelect>
          </div>
          <Button variant="primary" size="sm" onClick={ekle} disabled={mesgul || !yeniAd.trim()}>Ekle</Button>
          <Button variant="tertiary" size="sm" onClick={() => setEkleAcik(false)}>Vazgeç</Button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {depolar.map(d => {
          const t = tipBilgi(d.tip)
          const pasif = d.aktif === false
          return (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-sunken)',
              opacity: pasif ? 0.55 : 1, minWidth: 200,
            }}>
              <span style={{ fontSize: 20 }}>{t.ikon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '600 13px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
                  {d.ad} {pasif && <Badge tone="kayip">Pasif</Badge>}
                </div>
                <div style={{ font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                  {t.ad} · <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>{depoAdet(d)}</span> SN
                </div>
              </div>
              {admin && d.tip !== 'merkez' && (
                <button
                  aria-label={pasif ? 'Aktifleştir' : 'Pasife al'}
                  title={pasif ? 'Aktifleştir' : 'Pasife al'}
                  onClick={async () => {
                    try { await depoGuncelle(d.id, { aktif: pasif }); yukle() }
                    catch (e) { toast.error(e?.message || 'Değiştirilemedi.') }
                  }}
                  style={{
                    width: 26, height: 26, borderRadius: 4, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: '1px solid var(--border-default)',
                    color: pasif ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {pasif ? <Eye size={12} strokeWidth={1.5} /> : <EyeOff size={12} strokeWidth={1.5} />}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
