// Depolanan belgeyi (imzalı sözleşme PDF'i vb.) UYGULAMA İÇİNDE gösterir.
//
// Neden doğrudan window.open(signedUrl) değil:
//   1) Adres çubuğunda "hcrbwxeuscfibgmchdtt.supabase.co/...?token=eyJ..."
//      görünüyordu — kullanıcıya yabancı ve güvensiz duruyor, ayrıca imzalı
//      token adres çubuğuna/geçmişe düşüyor.
//   2) Tarayıcının PDF görüntüleyicisi belgeyi %100 yakınlıkta açıp sayfaya
//      SIĞDIRMIYOR; geniş sözleşme çıktıları sağdan kesik görünüyordu.
// Belge blob olarak indirilip blob: URL'den gösteriliyor: token sızmıyor,
// #view=FitH ile sayfa genişliğe oturuyor, indirme dosya adını biz veriyoruz
// (storage'daki ad "imzali-1784883594087.pdf" gibi anlamsız).

import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { Button, Modal } from './ui'
import { dosyayiKaydet } from '../lib/dosyaIndir'

export default function BelgeOnizlemeModal({ baslik, url, indirmeAdi = 'belge.pdf', onKapat }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [blob, setBlob] = useState(null)
  const [hata, setHata] = useState(null)
  // Çerçeve içinde gerçekten göründü mü? Görünmediyse (CSP, PDF eklentisi kapalı,
  // kurumsal politika) kullanıcı boş gri kutuya bakıp "bozuk" sanmasın.
  const [cerceveBos, setCerceveBos] = useState(false)

  useEffect(() => {
    if (!url) return
    let iptal = false
    let olusan = null
    ;(async () => {
      try {
        const cevap = await fetch(url)
        if (!cevap.ok) throw new Error(`Belge alınamadı (HTTP ${cevap.status})`)
        const veri = await cevap.blob()
        if (iptal) return
        olusan = URL.createObjectURL(veri)
        setBlob(veri)
        setBlobUrl(olusan)
      } catch (e) {
        if (!iptal) setHata(e?.message || 'Belge yüklenemedi.')
      }
    })()
    return () => { iptal = true; if (olusan) URL.revokeObjectURL(olusan) }
  }, [url])

  // Çerçeve 3 sn içinde yüklenmediyse alternatifleri öne çıkar
  const yuklendiRef = useRef(false)
  useEffect(() => {
    if (!blobUrl) return
    yuklendiRef.current = false
    setCerceveBos(false)
    const t = setTimeout(() => { if (!yuklendiRef.current) setCerceveBos(true) }, 3000)
    return () => clearTimeout(t)
  }, [blobUrl])

  const indir = async () => {
    if (!blob) return
    await dosyayiKaydet(blob, indirmeAdi)
  }

  /**
   * Yeni sekmeye AYRI bir object URL verilir. Aynı URL paylaşılsaydı modal
   * kapanınca revoke edilir ve arkada açık duran sekmedeki belge ölürdü —
   * "bir kere açıp kapatınca ikinci sefer açılmıyor" şikâyetinin kaynağı buydu.
   * Bu URL bilinçli olarak revoke EDİLMEZ; sekme kapanınca tarayıcı temizler.
   */
  const yeniSekmedeAc = () => {
    if (!blob) return
    // noopener blob: sekmelerinde bazı Chrome sürümlerinde boş sayfa üretiyor
    window.open(URL.createObjectURL(blob), '_blank')
  }

  return (
    <Modal open onClose={onKapat} title={baslik} width={1000}>
      <div style={{
        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
        overflow: 'hidden', background: 'var(--surface-sunken)', height: '72vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {hata ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--danger)' }}>{hata}</p>
            <p className="t-caption" style={{ marginTop: 6 }}>
              Dosya taşınmış veya silinmiş olabilir. Belgeyi yeniden yükleyin.
            </p>
          </div>
        ) : !blobUrl ? (
          <p className="t-caption">Belge yükleniyor…</p>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* #view=FitH: sayfa GENİŞLİĞE oturur — %100 yakınlıkta sağdan kesilme sorunu buydu */}
            <iframe title="belge-onizleme" src={`${blobUrl}#view=FitH`}
              onLoad={() => { yuklendiRef.current = true; setCerceveBos(false) }}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
            {cerceveBos && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24,
                background: 'var(--surface-sunken)', textAlign: 'center',
              }}>
                <p style={{ font: '600 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>
                  Belge bu pencerede gösterilemiyor
                </p>
                <p className="t-caption" style={{ maxWidth: 380 }}>
                  Tarayıcınızın PDF görüntüleyicisi kapalı olabilir. Belge hazır —
                  yeni sekmede açabilir veya bilgisayarınıza indirebilirsiniz.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <Button variant="primary" size="sm" iconLeft={<ExternalLink size={13} strokeWidth={1.5} />}
                    onClick={yeniSekmedeAc}>Yeni Sekmede Aç</Button>
                  <Button variant="secondary" size="sm" iconLeft={<Download size={13} strokeWidth={1.5} />}
                    onClick={indir}>İndir</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span className="t-caption">{indirmeAdi}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" disabled={!blob}
            iconLeft={<ExternalLink size={13} strokeWidth={1.5} />}
            onClick={yeniSekmedeAc}>
            Yeni Sekmede Aç
          </Button>
          <Button variant="secondary" size="sm" disabled={!blob}
            iconLeft={<Download size={13} strokeWidth={1.5} />} onClick={indir}>
            İndir
          </Button>
          <Button variant="ghost" size="sm" onClick={onKapat}>Kapat</Button>
        </div>
      </div>
    </Modal>
  )
}
