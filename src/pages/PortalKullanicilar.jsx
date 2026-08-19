// Portal Kullanıcıları — müşteri tarafındaki hesapların tek ekranda yönetimi.
//
// NEDEN AYRI SAYFA (17.08): portal hesapları Kullanıcı Yönetimi'nde personelle
// AYNI listede duruyordu. Portal 1-2 hafta içinde onlarca firmaya açılıyor
// (Bayrampaşa Belediyesi ilk); "kim erişiyor, hangi firma adına, hesabı açık mı"
// sorusu personel listesinin içinde kaybolur.
//
// ⚠️ Bu sayfa YALNIZ GÖRÜNTÜLER ve askıya alır/açar. Hesap açma, silme ve
// şifre işlemleri Kullanıcı Yönetimi'nde kalır — yetki mantığı tek yerde
// dursun, iki ekran aynı işi farklı kurallarla yapmasın.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, RefreshCw, ExternalLink, ShieldOff, ShieldCheck } from 'lucide-react'
import { SkeletonList } from '../components/Skeleton'
import CustomSelect from '../components/CustomSelect'
import { Button, SearchInput, Card, Badge, KPICard, EmptyState } from '../components/ui'
import { trKelimeEslesir } from '../lib/trArama'
import { kullanicilariGetir, kullaniciGuncelle } from '../services/kullaniciService'
import { useToast } from '../context/ToastContext'

const fmtTarih = (t) => (t ? new Date(t).toLocaleDateString('tr-TR') : '—')

export default function PortalKullanicilar() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [kullanicilar, setKullanicilar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [arama, setArama] = useState('')
  const [firmaFiltre, setFirmaFiltre] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('')
  const [islemdeId, setIslemdeId] = useState(null)

  const veriCek = () =>
    kullanicilariGetir()
      .then(d => setKullanicilar(d || []))
      .catch(e => console.error('[PortalKullanicilar]', e?.message))
      .finally(() => setYukleniyor(false))
  useEffect(() => { veriCek() }, [])
  const yukle = () => { setYukleniyor(true); veriCek() }

  // ⚠️ Yalnız portala GERÇEKTEN erişebilen hesaplar.
  // Dışarıda kalanlar:
  //   • silinmiş kayıtlar
  //   • onayı REDDEDİLMİŞ başvurular — 17.08'de kullanıcı haklı olarak sordu:
  //     reddedilmiş bir kayıt (gurbetciftci3449) burada duruyordu. Reddedilen
  //     başvuru portal kullanıcısı değildir; yeri Kullanıcı Yönetimi'ndeki
  //     başvuru kuyruğudur. Bu liste "kim içeri girebiliyor" sorusunu
  //     cevaplamalı, başvuru geçmişini değil.
  // ⚠️ Onay BEKLEYENLER listede kalır ama rozetle ayrılır — yönetimin
  //    aksiyon alması gereken kayıtlar gözden kaçmasın.
  const portalHesaplari = useMemo(
    () => (kullanicilar || []).filter(k =>
      k.tip === 'musteri'
      && !k.hesapSilindi
      && (k.onayDurum || 'onaylandi') !== 'reddedildi'
    ),
    [kullanicilar]
  )

  const firmalar = useMemo(
    () => [...new Set(portalHesaplari.map(k => k.firmaAdi).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [portalHesaplari]
  )

  const filtreli = useMemo(() => portalHesaplari.filter(k => {
    if (firmaFiltre && k.firmaAdi !== firmaFiltre) return false
    if (durumFiltre === 'aktif' && k.askida) return false
    if (durumFiltre === 'askida' && !k.askida) return false
    if (arama) {
      const hedef = [k.ad, k.kullaniciAdi, k.email, k.firmaAdi, k.unvan].filter(Boolean).join(' ')
      if (!trKelimeEslesir(hedef, arama)) return false
    }
    return true
  }), [portalHesaplari, arama, firmaFiltre, durumFiltre])

  const askidaSayi = portalHesaplari.filter(k => k.askida).length
  // ⚠️ Sahte e-posta = şifre sıfırlama maili ULAŞMAZ (@zna.local diye bir alan
  //    adı yok). Portal açılmadan önce görülmesi gereken bir borç.
  const sahteEposta = portalHesaplari.filter(k => (k.email || '').endsWith('@zna.local'))

  const askiDegistir = async (k) => {
    const yeni = !k.askida
    const soru = yeni
      ? `${k.ad} askıya alınsın mı? Portal'a giriş yapamaz.`
      : `${k.ad} tekrar aktif edilsin mi?`
    if (!window.confirm(soru)) return
    setIslemdeId(k.id)
    try {
      await kullaniciGuncelle(k.id, { askida: yeni })
      setKullanicilar(prev => prev.map(x => x.id === k.id ? { ...x, askida: yeni } : x))
      toast.success(yeni ? 'Hesap askıya alındı.' : 'Hesap tekrar aktif.')
    } catch (e) {
      toast.error('İşlem yapılamadı: ' + (e?.message || 'bilinmeyen hata'))
    } finally {
      setIslemdeId(null)
    }
  }

  if (yukleniyor) return <div style={{ padding: 24 }}><SkeletonList /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <p className="t-caption" style={{ margin: 0, color: 'var(--text-tertiary)' }}>
          Müşteri portalına erişen hesaplar. Yeni hesap davetle açılır (Müşteriler → firma → Portal Davet Gönder);
          şifre işlemleri Kullanıcı Yönetimi'nde.
        </p>
        <Button variant="secondary" size="sm" iconLeft={<RefreshCw size={13} strokeWidth={1.5} />} onClick={yukle}>
          Yenile
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <KPICard label="Portal Hesabı" value={portalHesaplari.length} kompakt />
        <KPICard label="Firma" value={firmalar.length} kompakt />
        <KPICard label="Askıya Alınmış" value={askidaSayi} kompakt />
        <KPICard label="Şifre Sıfırlayamaz" value={sahteEposta.length} kompakt />
      </div>

      {/* Sahte e-posta uyarısı — portal açılmadan kapatılması gereken borç */}
      {sahteEposta.length > 0 && (
        <Card style={{ borderColor: '#f59e0b' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <ShieldOff size={18} strokeWidth={1.6} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} />
            <div style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>
                {sahteEposta.length} hesabın e-postası gerçek değil
              </strong>{' '}
              (<span className="t-mono">@zna.local</span>) — bu hesaplar <strong>şifre sıfırlayamaz</strong>,
              sıfırlama maili hiçbir yere ulaşmaz. Gerçek adresleri Kullanıcı Yönetimi'nden girilmeli.
              <div style={{ marginTop: 4, color: 'var(--text-tertiary)' }}>
                {sahteEposta.map(k => k.ad).join(' · ')}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 420 }}>
          <SearchInput value={arama} onChange={e => setArama(e.target.value)}
            placeholder="Ad, e-posta, firma ara…" />
        </div>
        <CustomSelect value={firmaFiltre} onChange={e => setFirmaFiltre(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Tüm Firmalar</option>
          {firmalar.map(f => <option key={f} value={f}>{f}</option>)}
        </CustomSelect>
        <CustomSelect value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} style={{ minWidth: 150 }}>
          <option value="">Tüm Durumlar</option>
          <option value="aktif">Aktif</option>
          <option value="askida">Askıya alınmış</option>
        </CustomSelect>
      </div>

      {filtreli.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users size={36} strokeWidth={1.2} />}
            title={arama || firmaFiltre || durumFiltre ? 'Filtreyle eşleşen hesap yok' : 'Henüz portal hesabı yok'}
            description="Müşteri kartındaki “Portal Davet Gönder” ile davet edilen kişiler burada görünür."
          />
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: '400 12.5px/18px var(--font-sans)' }}>
              <thead>
                <tr style={{ font: '600 11px/16px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                  {['Kişi', 'Firma', 'E-posta', 'Eklenme', 'Durum', ''].map((h, i) => (
                    <th key={i} style={{ ...hucre, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtreli.map(k => {
                  const sahte = (k.email || '').endsWith('@zna.local')
                  return (
                    <tr key={k.id}>
                      <td style={{ ...hucre, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {k.ad}
                        {k.unvan && (
                          <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> · {k.unvan}</span>
                        )}
                      </td>
                      <td style={hucre}>
                        {k.musteriId ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/musteriler/${k.musteriId}`)}
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              font: '500 12.5px/18px var(--font-sans)', color: 'var(--brand-primary)',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            {k.firmaAdi || `#${k.musteriId}`}
                            <ExternalLink size={11} strokeWidth={1.6} />
                          </button>
                        ) : (
                          // ⚠️ Müşteri bağı yoksa bu hesap kendi firmasının verisini göremez
                          <span style={{ color: 'var(--danger)' }} title="Müşteri kaydına bağlı değil">
                            {k.firmaAdi || 'bağlı değil'}
                          </span>
                        )}
                      </td>
                      <td style={hucre}>
                        <span className="t-mono" style={{ color: sahte ? 'var(--warning, #b45309)' : undefined }}>
                          {k.email || '—'}
                        </span>
                        {sahte && (
                          <span title="Sahte adres — şifre sıfırlama maili ulaşmaz"
                            style={{ marginLeft: 6, color: '#b45309', fontWeight: 700, fontSize: 10 }}>
                            ⚠ SAHTE
                          </span>
                        )}
                      </td>
                      <td style={{ ...hucre, whiteSpace: 'nowrap' }}>{fmtTarih(k.createdAt)}</td>
                      <td style={hucre}>
                        {/* Onay bekleyen başvuru henüz portal kullanıcısı değil —
                            "Aktif" göstermek yanıltıcı olurdu. */}
                        {k.onayDurum === 'bekliyor'
                          ? <Badge tone="beklemede">Onay bekliyor</Badge>
                          : k.askida
                            ? <Badge tone="kayip">Askıda</Badge>
                            : <Badge tone="aktif">Aktif</Badge>}
                      </td>
                      <td style={{ ...hucre, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Button
                          size="sm"
                          variant={k.askida ? 'secondary' : 'tertiary'}
                          disabled={islemdeId === k.id}
                          iconLeft={k.askida
                            ? <ShieldCheck size={13} strokeWidth={1.5} />
                            : <ShieldOff size={13} strokeWidth={1.5} />}
                          onClick={() => askiDegistir(k)}
                        >
                          {islemdeId === k.id ? '…' : k.askida ? 'Aktif et' : 'Askıya al'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

const hucre = { padding: '9px 12px', borderBottom: '1px solid var(--border-default)' }
