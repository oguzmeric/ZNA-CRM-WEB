// Sicil → Çalışma Saatleri sekmesi: son 12 ayın aylık özeti + seçilen ayın
// gün gün dökümü.
//
// Süre hesabı src/lib/mesaiSure.js'te (TEK KAYNAK): çıkış varsa DB'deki
// sure_dakika otoritedir, yoksa girişten şu ana kadar geçen hesaplanır.
// ⚠️ mesaiKayitDakika SNAKE_CASE alan okur — servis bilerek camelCase'e
// çevirmeden döndürüyor.
//
// tip: 'normal' | 'fazla'. Sunucuda belirlenir: hafta sonu her saat 'fazla',
// hafta içi 19:00 ve sonrası başlayan 'fazla' (15.08 kuralı).

import { useState, useMemo } from 'react'
import { Badge, Table, THead, TBody, TR, TH, TD } from '../ui'
import CustomSelect from '../CustomSelect'
import { mesaiKayitDakika, mesaiDevamEdiyor } from '../../lib/mesaiSure'
import { mesaiKayitlariGetir } from '../../services/personelSicilService'
import { useSekmeVeri } from './useSekmeVeri'
import { SekmeYukleniyor, SekmeHata, SekmeBos, OzetKutular } from './ortak'
import { saatBicim } from './bicim'

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

const iso = (d) => d.toISOString().slice(0, 10)
const saatGoster = (i) => i ? new Date(i).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'

/** Son 12 ayın { anahtar: 'YYYY-MM', etiket: 'Ağustos 2026' } listesi (yeniden eskiye). */
function son12Ay() {
  const bugun = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(bugun.getFullYear(), bugun.getMonth() - i, 1)
    return {
      anahtar: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      etiket: `${AYLAR[d.getMonth()]} ${d.getFullYear()}`,
    }
  })
}

export default function CalismaSaatleriSekmesi({ kullaniciId }) {
  const aylar = useMemo(() => son12Ay(), [])
  const [seciliAy, setSeciliAy] = useState(aylar[0].anahtar)

  // 12 aylık pencere tek sorguda çekilir — ay değiştirince yeniden sorgu atılmaz
  const { veri: kayitlar, yukleniyor, hata, yenile } = useSekmeVeri(
    () => {
      const bugun = new Date()
      const bas = new Date(bugun.getFullYear(), bugun.getMonth() - 11, 1)
      return mesaiKayitlariGetir(kullaniciId, iso(bas), iso(bugun))
    },
    [kullaniciId],
  )

  const aylikOzet = useMemo(() => {
    const harita = new Map(aylar.map(a => [a.anahtar, {
      ...a, normalDk: 0, fazlaDk: 0, gunler: new Set(), devam: 0,
    }]))
    for (const k of kayitlar || []) {
      const d = new Date(k.giris_zamani)
      const anahtar = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const satir = harita.get(anahtar)
      if (!satir) continue
      const dk = mesaiKayitDakika(k)
      if (k.tip === 'fazla') satir.fazlaDk += dk
      else satir.normalDk += dk
      satir.gunler.add(iso(d))
      if (mesaiDevamEdiyor(k)) satir.devam += 1
    }
    return aylar.map(a => {
      const s = harita.get(a.anahtar)
      return { ...s, gunSayisi: s.gunler.size }
    })
  }, [kayitlar, aylar])

  const ayKayitlari = useMemo(() => {
    return (kayitlar || []).filter(k => {
      const d = new Date(k.giris_zamani)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === seciliAy
    })
  }, [kayitlar, seciliAy])

  if (yukleniyor) return <SekmeYukleniyor metin="Çalışma saatleri yükleniyor…" />
  if (hata) return <SekmeHata hata={hata} tekrar={yenile} />

  const toplamNormal = aylikOzet.reduce((s, a) => s + a.normalDk, 0)
  const toplamFazla = aylikOzet.reduce((s, a) => s + a.fazlaDk, 0)
  const buAy = aylikOzet.find(a => a.anahtar === aylar[0].anahtar) || { normalDk: 0, fazlaDk: 0, gunSayisi: 0 }

  return (
    <div style={{ padding: 16 }}>
      <OzetKutular
        kutular={[
          { label: 'BU AY ÇALIŞMA', value: saatBicim(buAy.normalDk), ipucu: `${buAy.gunSayisi} gün` },
          { label: 'BU AY FAZLA MESAİ', value: saatBicim(buAy.fazlaDk), color: buAy.fazlaDk > 0 ? 'var(--warning)' : 'var(--text-primary)' },
          { label: '12 AY TOPLAM', value: saatBicim(toplamNormal) },
          { label: '12 AY FAZLA MESAİ', value: saatBicim(toplamFazla), color: toplamFazla > 0 ? 'var(--warning)' : 'var(--text-primary)' },
        ]}
      />

      {/* Aylık özet */}
      <div style={{ marginBottom: 22 }}>
        <div style={{
          font: '700 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: 0.3,
          marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border-default)',
        }}>
          Son 12 Ay
        </div>
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Dönem</TH>
                <TH style={{ textAlign: 'right' }}>Çalışma</TH>
                <TH style={{ textAlign: 'right' }}>Fazla Mesai</TH>
                <TH style={{ textAlign: 'right' }}>Toplam</TH>
                <TH style={{ textAlign: 'right' }}>Gün</TH>
              </TR>
            </THead>
            <TBody>
              {aylikOzet.map(a => {
                const bos = a.normalDk === 0 && a.fazlaDk === 0
                return (
                  <TR key={a.anahtar} onClick={() => setSeciliAy(a.anahtar)}
                    style={{ cursor: 'pointer', background: a.anahtar === seciliAy ? 'var(--brand-primary-soft)' : undefined }}>
                    <TD style={{ fontWeight: a.anahtar === seciliAy ? 600 : 400 }}>{a.etiket}</TD>
                    <TD style={{ textAlign: 'right', color: bos ? 'var(--text-tertiary)' : undefined }} className="tabular-nums">
                      {saatBicim(a.normalDk)}
                    </TD>
                    <TD style={{ textAlign: 'right', color: a.fazlaDk > 0 ? 'var(--warning)' : 'var(--text-tertiary)', fontWeight: a.fazlaDk > 0 ? 600 : 400 }} className="tabular-nums">
                      {saatBicim(a.fazlaDk)}
                    </TD>
                    <TD style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                      {saatBicim(a.normalDk + a.fazlaDk)}
                    </TD>
                    <TD style={{ textAlign: 'right' }} className="tabular-nums">{a.gunSayisi || '—'}</TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </div>
      </div>

      {/* Gün dökümü */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border-default)',
        }}>
          <span style={{ font: '700 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Gün Dökümü
          </span>
          {/* w-auto ŞART — yoksa select tüm satırı kaplar (18.08 vakası) */}
          <CustomSelect className="w-auto" value={seciliAy} onChange={e => setSeciliAy(e.target.value)} style={{ minWidth: 170 }}>
            {aylar.map(a => <option key={a.anahtar} value={a.anahtar}>{a.etiket}</option>)}
          </CustomSelect>
          <span className="t-caption" style={{ marginLeft: 'auto' }}>{ayKayitlari.length} kayıt</span>
        </div>

        {ayKayitlari.length === 0 ? (
          <SekmeBos>Bu ayda mesai kaydı yok.</SekmeBos>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <THead>
                <TR>
                  <TH>Tarih</TH>
                  <TH>Giriş</TH>
                  <TH>Çıkış</TH>
                  <TH style={{ textAlign: 'right' }}>Süre</TH>
                  <TH>Tip</TH>
                  <TH>Not</TH>
                </TR>
              </THead>
              <TBody>
                {ayKayitlari.map(k => {
                  const devam = mesaiDevamEdiyor(k)
                  const d = new Date(k.giris_zamani)
                  return (
                    <TR key={k.id}>
                      <TD className="tabular-nums">
                        {d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' })}
                      </TD>
                      <TD className="tabular-nums">{saatGoster(k.giris_zamani)}</TD>
                      <TD className="tabular-nums" style={{ color: devam ? 'var(--text-tertiary)' : undefined }}>
                        {devam ? 'açık' : saatGoster(k.cikis_zamani)}
                      </TD>
                      <TD style={{ textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                        {saatBicim(mesaiKayitDakika(k))}{devam ? '+' : ''}
                      </TD>
                      <TD>
                        {k.tip === 'fazla'
                          ? <Badge tone="beklemede">Fazla mesai</Badge>
                          : <Badge tone="neutral">Normal</Badge>}
                        {devam && <Badge tone="bilgi" style={{ marginLeft: 4 }}>Devam ediyor</Badge>}
                      </TD>
                      <TD style={{ maxWidth: 220, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {k.not_ || '—'}
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
