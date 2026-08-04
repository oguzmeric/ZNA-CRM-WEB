// Kullanıcı Sözleşmesi — herkese açık okuma sayfası (/kullanici-sozlesmesi).
// Giriş yapılmadan da açılır: login sayfasından tıklanabilir olması gerekiyor
// (RLS'te aktif metin anon'a da okutuluyor).
//
// Aynı bileşen onay kapısında da kullanılabilsin diye metin gövdesi ayrı
// export edilmiştir (SozlesmeMetni).

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, ArrowLeft, Printer } from 'lucide-react'
import { Card, Button } from '../components/ui'
import { aktifSozlesmeGetir } from '../services/kullaniciSozlesmeService'

/** Sözleşme gövdesi — okuma sayfası ve onay kapısı aynı görünümü paylaşsın. */
export function SozlesmeMetni({ sozlesme }) {
  if (!sozlesme) return null
  return (
    <div className="sozlesme-govde" style={{ font: '400 14px/1.75 var(--font-sans)', color: 'var(--text-primary)' }}>
      <style>{`
        .sozlesme-govde h1 { font: 700 21px/1.35 var(--font-sans); margin: 0 0 6px; }
        .sozlesme-govde h2 { font: 700 16px/1.4 var(--font-sans); margin: 26px 0 8px;
                             padding-top: 14px; border-top: 1px solid var(--border-default); }
        .sozlesme-govde h3 { font: 600 14px/1.4 var(--font-sans); margin: 16px 0 6px; }
        .sozlesme-govde p  { margin: 0 0 10px; }
        .sozlesme-govde ul { margin: 0 0 12px; padding-left: 20px; }
        .sozlesme-govde li { margin-bottom: 5px; }
        .sozlesme-govde strong { color: var(--text-primary); font-weight: 700; }
        .sozlesme-govde hr { border: none; border-top: 1px solid var(--border-default); margin: 18px 0; }
        .sozlesme-govde code { background: var(--surface-sunken); padding: 1px 5px; border-radius: 4px; font-size: 13px; }
      `}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{sozlesme.icerik}</ReactMarkdown>
    </div>
  )
}

export default function KullaniciSozlesmesi() {
  const [sozlesme, setSozlesme] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)

  useEffect(() => {
    aktifSozlesmeGetir()
      .then(setSozlesme)
      .finally(() => setYukleniyor(false))
  }, [])

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <Link
          to="/login"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={15} strokeWidth={1.75} /> Girişe dön
        </Link>
        <Button variant="secondary" size="sm" iconLeft={<Printer size={14} strokeWidth={1.5} />} onClick={() => window.print()}>
          Yazdır
        </Button>
      </div>

      <Card style={{ padding: '28px 30px' }}>
        {yukleniyor ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Yükleniyor…</div>
        ) : !sozlesme ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <FileText size={30} strokeWidth={1.25} />
            <div style={{ marginTop: 10 }}>Yayımlanmış bir sözleşme metni bulunamadı.</div>
          </div>
        ) : (
          <>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
              padding: '4px 10px', borderRadius: 999,
              background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
              font: '600 11px/16px var(--font-sans)',
            }}>
              <FileText size={12} strokeWidth={2} />
              Sürüm {sozlesme.versiyon} · yürürlük {new Date(sozlesme.yururluk_tarihi).toLocaleDateString('tr-TR')}
            </div>
            <SozlesmeMetni sozlesme={sozlesme} />
          </>
        )}
      </Card>
    </div>
  )
}
