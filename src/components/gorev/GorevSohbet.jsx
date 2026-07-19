// Görev içi iletişim — sohbet görünümü (spek madde 17 + 23 birleşik):
// yorumlar (web + mobil) ve hareket geçmişi TEK zaman çizgisinde akar.
// Kendi mesajların sağda, diğerleri solda avatarlı; sistem olayları ortada kapsül.
import { useMemo, useState } from 'react'
import { Pencil, Trash2, Smartphone, History } from 'lucide-react'
import { segmentMetin } from '../../lib/mention'
import { durumBilgi, KABUL_MAP, oncelikBilgi } from '../../lib/gorevSabitleri'
import MentionTextarea from '../MentionTextarea'
import { EkSecici, EkListesi } from '../EkAlani'
import { Button, Card, CardTitle, Avatar } from '../ui'

const trTarih = (t) => (t ? String(t).slice(0, 10).split('-').reverse().join('.') : '—')
const saat = (z) => {
  try { return new Date(z).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

// Hareket kaydını insan diline çevir (madde 23)
const ONAY_ISIM = { bekliyor: 'Onay Bekliyor', onaylandi: 'Onaylandı', revize: 'Revize İstendi', reddedildi: 'Reddedildi' }
const hareketMetni = (h, kullanicilar) => {
  const kisiAd = (id) => kullanicilar?.find(k => String(k.id) === String(id))?.ad || (id ? `#${id}` : '—')
  if (h.islem === 'olusturuldu') {
    const d = h.detay || {}
    return `${h.yapanAd || 'Sistem'} görevi oluşturdu${d.atanan ? ` ve ${d.atanan} kişisine atadı` : ''}${d.son_tarih ? ` · son tarih ${trTarih(d.son_tarih)}` : ''}`
  }
  const parcalar = (Array.isArray(h.detay) ? h.detay : []).map(d => {
    switch (d.alan) {
      case 'durum':        return `Durum: ${durumBilgi(d.eski).isim} → ${durumBilgi(d.yeni).isim}`
      case 'atanan':       return `Atanan: ${d.eski || '—'} → ${d.yeni || '—'}`
      case 'son_tarih':    return `Bitiş: ${trTarih(d.eski)} → ${trTarih(d.yeni)}`
      case 'oncelik':      return `Öncelik: ${oncelikBilgi(d.eski).isim} → ${oncelikBilgi(d.yeni).isim}`
      case 'ilerleme':     return `İlerleme: %${d.eski ?? 0} → %${d.yeni ?? 0}`
      case 'kabul_durumu': return `Kabul: ${(KABUL_MAP[d.yeni]?.isim || d.yeni)}${d.sebep ? ` (${d.sebep})` : ''}`
      case 'onay_durumu':  return `Onay: ${ONAY_ISIM[d.yeni] || d.yeni || '—'}${d.not ? ` — ${d.not}` : ''}`
      case 'onaylayici':   return `Onaylayıcı: ${kisiAd(d.yeni)}`
      case 'baslik':       return 'Başlık güncellendi'
      case 'gizlilik':     return `Gizlilik: ${d.yeni}`
      case 'devir':        return `Devredildi: ${d.eski || '—'} → ${d.yeni || '—'}${d.sebep ? ` (${d.sebep})` : ''}`
      case 'durum_sebebi': return d.yeni ? `Sebep: ${d.yeni}` : null
      default:             return null
    }
  }).filter(Boolean)
  if (!parcalar.length) return null
  return `${h.yapanAd || 'Sistem'} — ${parcalar.join(' · ')}`
}

export default function GorevSohbet({
  gorev, kullanici, kullanicilar,
  yorumlar, hareketler,
  yeniYorum, setYeniYorum, yorumEkleri, setYorumEkleri, gonderiliyor, onGonder,
  duzenleYorumId, duzenleIcerik, setDuzenleIcerik, onDuzenleBaslat, onDuzenleKaydet, onDuzenleIptal,
  onSil, kendisiMi,
}) {
  const [gecmisGizli, setGecmisGizli] = useState(false)

  // Yorumlar + hareketler tek akışta (zamana göre)
  const akis = useMemo(() => {
    const y = (yorumlar || []).map(x => ({ tur: 'yorum', zaman: x.zaman || 0, veri: x }))
    const h = gecmisGizli ? [] : (hareketler || [])
      .map(x => ({ tur: 'sistem', zaman: x.olusturmaTarih || 0, veri: x, metin: hareketMetni(x, kullanicilar) }))
      .filter(x => x.metin)
    return [...y, ...h].sort((a, b) => new Date(a.zaman || 0) - new Date(b.zaman || 0))
  }, [yorumlar, hareketler, gecmisGizli, kullanicilar])

  const mentionRender = (icerik) =>
    segmentMetin(icerik, kullanicilar).map((seg, i) =>
      seg.tip === 'mention'
        ? <span key={i} style={{ color: 'var(--brand-primary)', fontWeight: 600, background: 'var(--brand-primary-soft)', padding: '0 4px', borderRadius: 3 }}>{seg.deger}</span>
        : <span key={i}>{seg.deger}</span>)

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
        <div>
          <CardTitle>Görev Sohbeti</CardTitle>
          <p className="t-caption" style={{ marginTop: 2 }}>
            <span className="tabular-nums">{(yorumlar || []).length}</span> mesaj · yazışma ve görev geçmişi tek akışta
          </p>
        </div>
        <button
          onClick={() => setGecmisGizli(g => !g)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            background: gecmisGizli ? 'transparent' : 'var(--brand-primary-soft)',
            border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)',
            padding: '4px 10px', font: '500 12px/16px var(--font-sans)',
            color: gecmisGizli ? 'var(--text-tertiary)' : 'var(--brand-primary)',
          }}
          title="Sistem olaylarını göster/gizle"
        >
          <History size={12} strokeWidth={1.5} /> Hareketler {gecmisGizli ? 'kapalı' : 'açık'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {akis.length === 0 && <p className="t-caption">Henüz mesaj yok — ilk mesajı sen yaz.</p>}

        {akis.map((satir, i) => {
          if (satir.tur === 'sistem') {
            return (
              <div key={'h' + satir.veri.id} style={{ textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block', maxWidth: '92%', padding: '3px 12px',
                  borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)',
                  border: '1px solid var(--border-default)',
                  font: '400 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)',
                }}>
                  {satir.metin} · {saat(satir.zaman)}
                </span>
              </div>
            )
          }

          const yorum = satir.veri
          const mobilMi = yorum.kaynak === 'mobil'
          const benim = !mobilMi && kendisiMi(yorum)
          const duzenlemede = duzenleYorumId === yorum.id
          return (
            <div key={yorum.id} style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
              flexDirection: benim ? 'row-reverse' : 'row',
            }}>
              <div style={{ flexShrink: 0, marginBottom: 2 }}>
                <Avatar name={yorum.yazar} size="sm" />
              </div>
              <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: benim ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 2, flexDirection: benim ? 'row-reverse' : 'row' }}>
                  <span style={{ font: '500 11.5px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                    {benim ? 'Sen' : yorum.yazar} · {yorum.zaman ? saat(yorum.zaman) : yorum.tarih}
                    {yorum.duzenlendi && <span style={{ fontStyle: 'italic' }}> (düzenlendi)</span>}
                  </span>
                  {mobilMi && (
                    <span title="Mobil uygulamadan" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 5px',
                      borderRadius: 'var(--radius-pill)', background: 'var(--brand-primary-soft)',
                      color: 'var(--brand-primary)', font: '600 9.5px/14px var(--font-sans)',
                    }}>
                      <Smartphone size={9} strokeWidth={2} /> Mobil
                    </span>
                  )}
                  {benim && !duzenlemede && (
                    <span style={{ display: 'inline-flex', gap: 2 }}>
                      <button aria-label="Düzenle" onClick={() => onDuzenleBaslat(yorum)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}>
                        <Pencil size={11} strokeWidth={1.5} />
                      </button>
                      <button aria-label="Sil" onClick={() => onSil(yorum.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}>
                        <Trash2 size={11} strokeWidth={1.5} />
                      </button>
                    </span>
                  )}
                </div>

                {duzenlemede ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 360, maxWidth: '100%' }}>
                    <MentionTextarea
                      value={duzenleIcerik} onChange={setDuzenleIcerik}
                      kullanicilar={kullanicilar || []} rows={3}
                      placeholder="Mesajı düzenle… (@ ile etiketle)"
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="primary" size="sm" onClick={onDuzenleKaydet}>Kaydet</Button>
                      <Button variant="secondary" size="sm" onClick={onDuzenleIptal}>İptal</Button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: benim ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    background: benim ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                    border: '1px solid var(--border-default)',
                  }}>
                    <p style={{ font: '400 13.5px/20px var(--font-sans)', color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {mentionRender(yorum.icerik)}
                    </p>
                    <EkListesi dosyalar={yorum.dosyalar} />
                    {mobilMi && yorum.fotoUrls?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {yorum.fotoUrls.filter(u => /^https?:\/\//.test(u)).map((url, j) => (
                          <a key={j} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt="not fotoğrafı" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mesaj yazma alanı */}
      <div style={{ paddingTop: 14, borderTop: '1px solid var(--border-default)' }}>
        <MentionTextarea
          value={yeniYorum} onChange={setYeniYorum}
          kullanicilar={kullanicilar || []} rows={2}
          placeholder="Mesaj yaz… (@ ile etiketle, Ctrl+V ile ekran görüntüsü yapıştır)"
          style={{ marginBottom: 8 }}
          onResimYapistir={(resimler) => setYorumEkleri(prev => [...prev, ...resimler])}
        />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <EkSecici dosyalar={yorumEkleri} onChange={setYorumEkleri} disabled={gonderiliyor} />
          <Button variant="primary" onClick={onGonder} disabled={gonderiliyor}>
            {gonderiliyor ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
