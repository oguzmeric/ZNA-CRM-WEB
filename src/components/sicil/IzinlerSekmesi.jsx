// Sicil → İzinler sekmesi: yıllık izin hakedişi + izin talepleri geçmişi.
//
// Hakediş hesabı src/lib/izinHakedis.js'te (TEK KAYNAK, 38 birim testi).
// Burada hesap YAPILMAZ, yalnız gösterilir.

import { useNavigate } from 'react-router-dom'
import { CalendarCheck, AlertTriangle } from 'lucide-react'
import { Badge, EmptyState, Table, THead, TBody, TR, TH, TD, Button } from '../ui'
import { izinTalepleriGetir, izinTurBilgi, izinDurumBilgi } from '../../services/ikService'
import { hakedisOzeti } from '../../lib/izinHakedis'
import { useSekmeVeri } from './useSekmeVeri'
import { SekmeYukleniyor, SekmeHata, SekmeBos, OzetKutular } from './ortak'
import { tarihBicim } from './bicim'

export default function IzinlerSekmesi({ kullaniciId, sicil, istihdamaGit }) {
  const navigate = useNavigate()
  const { veri: talepler, yukleniyor, hata, yenile } = useSekmeVeri(
    () => izinTalepleriGetir({ kullaniciId }),
    [kullaniciId],
  )

  if (yukleniyor) return <SekmeYukleniyor metin="İzin kayıtları yükleniyor…" />
  if (hata) return <SekmeHata hata={hata} tekrar={yenile} />

  const liste = talepler || []
  const ozet = hakedisOzeti({
    iseGiris: sicil?.iseGirisTarihi,
    dogumTarihi: sicil?.dogumTarihi,
    talepler: liste,
  })

  return (
    <div style={{ padding: 16 }}>
      {/* Hakediş — işe giriş tarihi yoksa SIFIR gösterme, eksiği söyle */}
      {ozet.gecerli ? (
        <OzetKutular
          kutular={[
            { label: 'KIDEM', value: ozet.kidemMetni, ipucu: `Yılda ${ozet.yilBasina} gün hak` },
            { label: 'HAK EDİLEN', value: `${ozet.hakEdilen} gün`, ipucu: 'İşe girişten bugüne toplam' },
            { label: 'KULLANILAN', value: `${ozet.kullanilan} gün`, ipucu: 'Onaylanmış yıllık izin' },
            {
              label: 'KALAN',
              value: `${ozet.kalan} gün`,
              color: ozet.kalan < 0 ? 'var(--danger)' : ozet.kalan === 0 ? 'var(--warning)' : 'var(--success)',
              ipucu: ozet.kalan < 0 ? 'Hakkından fazla kullanılmış' : 'Devreden dahil',
            },
          ]}
        />
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '11px 14px', marginBottom: 16,
          border: '1px solid rgba(245,158,11,0.35)', borderRadius: 'var(--radius-md)',
          background: 'rgba(245,158,11,0.07)',
        }}>
          <AlertTriangle size={15} strokeWidth={1.7} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 220, font: '500 12.5px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
            İşe giriş tarihi girilmediği için yıllık izin hakedişi hesaplanamıyor.
          </span>
          {istihdamaGit && (
            <Button variant="secondary" size="sm" onClick={istihdamaGit}>İstihdam sekmesine git</Button>
          )}
        </div>
      )}

      {liste.length === 0 ? (
        <SekmeBos>Bu personele ait izin talebi yok.</SekmeBos>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Tür</TH>
                <TH>Başlangıç</TH>
                <TH>Bitiş</TH>
                <TH style={{ textAlign: 'right' }}>Gün</TH>
                <TH>Durum</TH>
                <TH>Açıklama</TH>
                <TH>Karar</TH>
              </TR>
            </THead>
            <TBody>
              {liste.map(t => {
                const tur = izinTurBilgi(t.tur)
                const durum = izinDurumBilgi(t.durum)
                return (
                  <TR key={t.id}>
                    <TD style={{ fontWeight: 500 }}>{tur.isim}</TD>
                    <TD className="tabular-nums">{tarihBicim(t.baslangic)}</TD>
                    <TD className="tabular-nums">{tarihBicim(t.bitis)}</TD>
                    <TD style={{ textAlign: 'right' }} className="tabular-nums">{t.gunSayisi ?? '—'}</TD>
                    <TD><Badge tone={durum.tone}>{durum.isim}</Badge></TD>
                    <TD style={{ maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.aciklama || '—'}
                      </div>
                    </TD>
                    <TD style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      {t.onaylayanAd ? `${t.onaylayanAd}${t.kararNotu ? ` — ${t.kararNotu}` : ''}` : '—'}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </div>
      )}

      {liste.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="tertiary" size="sm" iconLeft={<CalendarCheck size={13} strokeWidth={1.5} />}
            onClick={() => navigate('/ik-yonetim')}>
            İzin onaylarına git
          </Button>
        </div>
      )}
    </div>
  )
}
