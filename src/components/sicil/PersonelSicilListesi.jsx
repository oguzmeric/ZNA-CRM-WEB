// İK Yönetimi → Personel Sicil sekmesi: personel listesi.
//
// Satıra tıklayınca sicil kartı açılır (/ik-yonetim/sicil/:id). Menüye yeni
// öğe EKLENMEZ — giriş noktası yalnız burasıdır (kullanıcı kararı 18.08).
//
// Sicil kaydı olmayan personel "Sicil girilmemiş" rozetiyle işaretlenir:
// eksik veriyi görünür kılmak kurumsal davranıştır, sessizce boş bırakmak
// İK'ya "her şey tamam" yanılgısı verir.

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Users } from 'lucide-react'
import { Badge, Card, SearchInput, Table, THead, TBody, TR, TH, TD, Avatar, EmptyState } from '../ui'
import CustomSelect from '../CustomSelect'
import { trContains } from '../../lib/trSearch'
import { personelListesiGetir } from '../../services/personelSicilService'
import { kidemMetni } from '../../lib/izinHakedis'
import { useSekmeVeri } from './useSekmeVeri'
import { SekmeYukleniyor, SekmeHata } from './ortak'
import { tarihBicim } from './bicim'

export default function PersonelSicilListesi() {
  const navigate = useNavigate()
  const [arama, setArama] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('aktif')
  const [departmanFiltre, setDepartmanFiltre] = useState('')

  const { veri: personeller, yukleniyor, hata, yenile } = useSekmeVeri(personelListesiGetir, [])

  const departmanlar = useMemo(() => {
    const set = new Set((personeller || []).map(p => p.departman).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [personeller])

  const liste = useMemo(() => {
    let l = personeller || []
    if (durumFiltre === 'aktif') l = l.filter(p => !p.istenCikisTarihi)
    else if (durumFiltre === 'ayrilmis') l = l.filter(p => !!p.istenCikisTarihi)
    else if (durumFiltre === 'eksik') l = l.filter(p => !p.sicilVar || !p.iseGirisTarihi)
    if (departmanFiltre) l = l.filter(p => p.departman === departmanFiltre)
    if (arama.trim()) {
      l = l.filter(p =>
        trContains(p.ad, arama) ||
        trContains(p.unvan || '', arama) ||
        trContains(p.departman || '', arama) ||
        String(p.tcKimlik || '').includes(arama.trim()))
    }
    return l
  }, [personeller, durumFiltre, departmanFiltre, arama])

  if (yukleniyor) return <Card><SekmeYukleniyor metin="Personel listesi yükleniyor…" /></Card>
  if (hata) return <Card padding={0}><SekmeHata hata={hata} tekrar={yenile} /></Card>

  const eksikSayi = (personeller || []).filter(p => !p.sicilVar || !p.iseGirisTarihi).length

  return (
    <Card padding={0}>
      {/* Filtre şeridi — CustomSelect'lerde w-auto ŞART (yoksa her biri ayrı
          satıra düşer ve liste ekranın çok altından başlar) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '11px 14px', borderBottom: '1px solid var(--border-default)',
      }}>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <SearchInput value={arama} onChange={e => setArama(e.target.value)}
            placeholder="Ad, ünvan, departman, TC ara…" />
        </div>

        <CustomSelect className="w-auto" value={durumFiltre}
          onChange={e => setDurumFiltre(e.target.value)} style={{ minWidth: 150 }}>
          <option value="aktif">Aktif personel</option>
          <option value="ayrilmis">Ayrılmış</option>
          <option value="eksik">Sicili eksik</option>
          <option value="">Tümü</option>
        </CustomSelect>

        {departmanlar.length > 0 && (
          <CustomSelect className="w-auto" value={departmanFiltre}
            onChange={e => setDepartmanFiltre(e.target.value)} style={{ minWidth: 160 }}>
            <option value="">Tüm departmanlar</option>
            {departmanlar.map(d => <option key={d} value={d}>{d}</option>)}
          </CustomSelect>
        )}

        <span className="t-caption" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {liste.length} kişi
          {eksikSayi > 0 && durumFiltre !== 'eksik' && (
            <> · <button
              onClick={() => setDurumFiltre('eksik')}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--warning)', font: '600 12px/16px var(--font-sans)',
              }}>{eksikSayi} eksik sicil</button></>
          )}
        </span>
      </div>

      {liste.length === 0 ? (
        <EmptyState
          icon={<Users size={32} strokeWidth={1.5} />}
          title={arama ? 'Aramayla eşleşen personel yok' : 'Bu filtrede personel yok'}
          description={arama ? 'Farklı bir arama deneyin.' : 'Filtreyi değiştirerek diğer kayıtları görebilirsiniz.'}
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Personel</TH>
                <TH>Departman</TH>
                <TH>İşe Giriş</TH>
                <TH>Kıdem</TH>
                <TH>Durum</TH>
                <TH style={{ width: 40 }}></TH>
              </TR>
            </THead>
            <TBody>
              {liste.map(p => {
                const ayrildi = !!p.istenCikisTarihi
                return (
                  <TR key={p.id} onClick={() => navigate(`/ik-yonetim/sicil/${p.id}`)} style={{ cursor: 'pointer' }}>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Avatar name={p.ad} src={p.fotoUrl} size="sm" />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.ad}
                          </div>
                          {p.unvan && <div className="t-caption">{p.unvan}</div>}
                        </div>
                      </div>
                    </TD>
                    <TD>{p.departman || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</TD>
                    <TD className="tabular-nums">
                      {p.iseGirisTarihi
                        ? tarihBicim(p.iseGirisTarihi)
                        : <span style={{ color: 'var(--warning)', fontWeight: 500 }}>girilmemiş</span>}
                    </TD>
                    <TD className="tabular-nums">
                      {p.iseGirisTarihi ? kidemMetni(p.iseGirisTarihi) : '—'}
                    </TD>
                    <TD>
                      {ayrildi
                        ? <Badge tone="neutral">Ayrıldı</Badge>
                        : p.askida
                          ? <Badge tone="kayip">Askıda</Badge>
                          : !p.sicilVar
                            ? <Badge tone="beklemede">Sicil girilmemiş</Badge>
                            : <Badge tone="basarili">Aktif</Badge>}
                    </TD>
                    <TD style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>
                      <ChevronRight size={14} strokeWidth={1.5} />
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  )
}
