// Sicil → Genel Bakış sekmesi: kartın özeti + son hareketler.
//
// Diğer sekmelerin verisini TEKRAR çeker (izin + avans + son 30 gün mesai).
// Bunu paylaşılan bir state'e taşımak sayfayı erken yüklemeye zorlardı;
// tembel yükleme ilkesi korunuyor — kullanıcı bu sekmeye girmezse sorgu gitmez.

import { CalendarCheck, Banknote, Clock, TrendingUp } from 'lucide-react'
import { Badge, Table, THead, TBody, TR, TH, TD } from '../ui'
import { izinTalepleriGetir, avansTalepleriGetir, izinTurBilgi, izinDurumBilgi, avansDurumBilgi, tutarBicim } from '../../services/ikService'
import { mesaiKayitlariGetir } from '../../services/personelSicilService'
import { mesaiKayitDakika } from '../../lib/mesaiSure'
import { hakedisOzeti } from '../../lib/izinHakedis'
import { useSekmeVeri } from './useSekmeVeri'
import { SekmeYukleniyor, SekmeHata, SekmeBos, OzetKutular } from './ortak'
import { tarihBicim, saatBicim } from './bicim'

const iso = (d) => d.toISOString().slice(0, 10)

export default function GenelBakisSekmesi({ kullaniciId, sicil }) {
  const { veri, yukleniyor, hata, yenile } = useSekmeVeri(
    async () => {
      const bugun = new Date()
      const ayBasi = new Date(bugun.getFullYear(), bugun.getMonth(), 1)
      const [izinler, avanslar, mesai] = await Promise.all([
        izinTalepleriGetir({ kullaniciId }),
        avansTalepleriGetir({ kullaniciId }),
        mesaiKayitlariGetir(kullaniciId, iso(ayBasi), iso(bugun)),
      ])
      return { izinler, avanslar, mesai }
    },
    [kullaniciId],
  )

  if (yukleniyor) return <SekmeYukleniyor metin="Özet hazırlanıyor…" />
  if (hata) return <SekmeHata hata={hata} tekrar={yenile} />

  const izinler = veri?.izinler || []
  const avanslar = veri?.avanslar || []
  const mesai = veri?.mesai || []

  const hak = hakedisOzeti({
    iseGiris: sicil?.iseGirisTarihi,
    dogumTarihi: sicil?.dogumTarihi,
    talepler: izinler,
  })

  const kalanBorc = avanslar.reduce((s, a) => s + (Number(a.kalanBorc) || 0), 0)
  const buAyDk = mesai.reduce((s, k) => s + (k.tip === 'fazla' ? 0 : mesaiKayitDakika(k)), 0)
  const buAyFazlaDk = mesai.reduce((s, k) => s + (k.tip === 'fazla' ? mesaiKayitDakika(k) : 0), 0)
  const bekleyenIzin = izinler.filter(t => t.durum === 'bekliyor').length
  const bekleyenAvans = avanslar.filter(a => a.durum === 'bekliyor').length

  // Son hareketler — izin + avans tek listede, tarihe göre
  const hareketler = [
    ...izinler.map(t => ({
      id: `izin-${t.id}`,
      tarih: t.olusturmaTarih,
      Icon: CalendarCheck,
      tur: 'İzin',
      baslik: `${izinTurBilgi(t.tur).isim} — ${t.gunSayisi ?? '?'} gün`,
      detay: `${tarihBicim(t.baslangic)} → ${tarihBicim(t.bitis)}`,
      durum: izinDurumBilgi(t.durum),
    })),
    ...avanslar.map(a => ({
      id: `avans-${a.id}`,
      tarih: a.olusturmaTarih,
      Icon: Banknote,
      tur: 'Avans',
      baslik: tutarBicim(a.tutar),
      detay: `${a.taksitSayisi} taksit${a.gerekce ? ` · ${a.gerekce}` : ''}`,
      durum: avansDurumBilgi(a.durum),
    })),
  ]
    .filter(h => h.tarih)
    .sort((a, b) => new Date(b.tarih) - new Date(a.tarih))
    .slice(0, 10)

  return (
    <div style={{ padding: 16 }}>
      <OzetKutular
        kutular={[
          {
            label: 'KIDEM',
            value: hak.gecerli ? hak.kidemMetni : '—',
            ipucu: hak.gecerli ? `Yılda ${hak.yilBasina} gün izin` : 'İşe giriş tarihi yok',
            color: hak.gecerli ? 'var(--text-primary)' : 'var(--text-tertiary)',
          },
          {
            label: 'KALAN İZİN',
            value: hak.gecerli ? `${hak.kalan} gün` : '—',
            color: !hak.gecerli ? 'var(--text-tertiary)'
              : hak.kalan < 0 ? 'var(--danger)' : hak.kalan === 0 ? 'var(--warning)' : 'var(--success)',
            ipucu: hak.gecerli ? `${hak.hakEdilen} hak · ${hak.kullanilan} kullanıldı` : undefined,
          },
          {
            label: 'AVANS BORCU',
            value: tutarBicim(kalanBorc),
            color: kalanBorc > 0 ? 'var(--warning)' : 'var(--success)',
            ipucu: kalanBorc > 0 ? 'Maaştan kesilecek' : 'Borç yok',
          },
          {
            label: 'BU AY ÇALIŞMA',
            value: saatBicim(buAyDk),
            ipucu: buAyFazlaDk > 0 ? `+ ${saatBicim(buAyFazlaDk)} fazla mesai` : 'Fazla mesai yok',
          },
        ]}
      />

      {(bekleyenIzin > 0 || bekleyenAvans > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '9px 14px', marginBottom: 16,
          border: '1px solid rgba(245,158,11,0.35)', borderRadius: 'var(--radius-md)',
          background: 'rgba(245,158,11,0.07)',
        }}>
          <Clock size={15} strokeWidth={1.7} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ font: '500 12.5px/18px var(--font-sans)', color: 'var(--text-primary)' }}>
            Karar bekleyen:
            {bekleyenIzin > 0 && ` ${bekleyenIzin} izin talebi`}
            {bekleyenIzin > 0 && bekleyenAvans > 0 && ' ·'}
            {bekleyenAvans > 0 && ` ${bekleyenAvans} avans talebi`}
          </span>
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        font: '700 12.5px/17px var(--font-sans)', color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: 0.3,
        marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border-default)',
      }}>
        <TrendingUp size={13} strokeWidth={1.7} />
        Son Hareketler
      </div>

      {hareketler.length === 0 ? (
        <SekmeBos>Bu personele ait izin veya avans hareketi yok.</SekmeBos>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH style={{ width: 90 }}>Tarih</TH>
                <TH style={{ width: 70 }}>Tür</TH>
                <TH>İşlem</TH>
                <TH>Detay</TH>
                <TH style={{ width: 110 }}>Durum</TH>
              </TR>
            </THead>
            <TBody>
              {hareketler.map(h => (
                <TR key={h.id}>
                  <TD className="tabular-nums">{tarihBicim(h.tarih)}</TD>
                  <TD>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
                      <h.Icon size={12} strokeWidth={1.5} /> {h.tur}
                    </span>
                  </TD>
                  <TD style={{ fontWeight: 500 }}>{h.baslik}</TD>
                  <TD style={{ maxWidth: 240, color: 'var(--text-secondary)' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.detay}
                    </div>
                  </TD>
                  <TD><Badge tone={h.durum.tone}>{h.durum.isim}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}
