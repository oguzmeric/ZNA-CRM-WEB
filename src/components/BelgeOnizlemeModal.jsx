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

import { useEffect, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { Button, Modal } from './ui'
import { dosyayiKaydet } from '../lib/dosyaIndir'

export default function BelgeOnizlemeModal({ baslik, url, indirmeAdi = 'belge.pdf', onKapat }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [blob, setBlob] = useState(null)
  const [hata, setHata] = useState(null)

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

  const indir = async () => {
    if (!blob) return
    await dosyayiKaydet(blob, indirmeAdi)
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
          // #view=FitH: sayfa GENİŞLİĞE oturur — %100 yakınlıkta sağdan kesilme sorunu buydu
          <iframe title="belge-onizleme" src={`${blobUrl}#view=FitH`}
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span className="t-caption">{indirmeAdi}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" disabled={!blobUrl}
            iconLeft={<ExternalLink size={13} strokeWidth={1.5} />}
            onClick={() => blobUrl && window.open(blobUrl, '_blank', 'noopener')}>
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
