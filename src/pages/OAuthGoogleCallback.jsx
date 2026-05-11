// Google OAuth callback handler sayfası.
// URL: /oauth/google/callback?code=...&state=...
// Buraya geldiğinde: state'i doğrula, code'u edge function'a yolla,
// başarı/hata ile kullanıcıyı /takvim-baglantilari sayfasına yönlendir.

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { googleOAuthTamamla } from '../services/takvimBaglantiService'
import { Card, Button } from '../components/ui'

export default function OAuthGoogleCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [durum, setDurum] = useState('isleniyor')  // 'isleniyor' | 'basarili' | 'hata'
  const [mesaj, setMesaj] = useState('Google bağlantısı tamamlanıyor…')
  const [hesapEmail, setHesapEmail] = useState(null)

  useEffect(() => {
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    if (error) {
      setDurum('hata')
      setMesaj(`Google iznini reddettin veya hata oluştu: ${error}`)
      return
    }

    if (!code || !state) {
      setDurum('hata')
      setMesaj('Geçersiz callback — code veya state eksik.')
      return
    }

    // State doğrula (CSRF koruması)
    const beklenenState = sessionStorage.getItem('takvim_oauth_state')
    if (state !== beklenenState) {
      setDurum('hata')
      setMesaj('State eşleşmedi — güvenlik hatası. Lütfen tekrar bağlanmayı dene.')
      return
    }

    let kullaniciId
    try {
      const parsed = JSON.parse(atob(state))
      kullaniciId = parsed.kullaniciId
    } catch {
      setDurum('hata')
      setMesaj('State çözülemedi.')
      return
    }

    const redirectUri = sessionStorage.getItem('takvim_oauth_redirect_uri')
    if (!redirectUri) {
      setDurum('hata')
      setMesaj('Redirect URI bulunamadı (session expire olmuş olabilir).')
      return
    }

    googleOAuthTamamla({ code, kullaniciId, redirectUri })
      .then((sonuc) => {
        setDurum('basarili')
        setHesapEmail(sonuc.hesapEmail)
        setMesaj('Bağlantı kuruldu. Etkinliklerin senkronize edilmeye başlandı.')
        // Cleanup
        sessionStorage.removeItem('takvim_oauth_state')
        sessionStorage.removeItem('takvim_oauth_redirect_uri')
        // 3 saniye sonra ayarlar sayfasına yönlendir
        setTimeout(() => navigate('/ayarlar/takvim-baglantilari', { replace: true }), 3000)
      })
      .catch((e) => {
        setDurum('hata')
        setMesaj(`Bağlantı kurulamadı: ${e?.message ?? 'bilinmeyen hata'}`)
      })
  }, [params, navigate])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: 24, background: 'var(--surface-base)',
    }}>
      <Card padding={32} style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        {durum === 'isleniyor' && (
          <>
            <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', color: 'var(--brand-primary)', marginBottom: 16 }} />
            <h2 style={{ font: '700 18px/24px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 8 }}>
              Google Takvim Bağlanıyor
            </h2>
            <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)' }}>
              {mesaj}
            </p>
          </>
        )}
        {durum === 'basarili' && (
          <>
            <CheckCircle2 size={48} style={{ color: 'var(--success)', marginBottom: 16 }} />
            <h2 style={{ font: '700 18px/24px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 8 }}>
              Bağlantı Kuruldu
            </h2>
            <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 16 }}>
              <strong>{hesapEmail}</strong> hesabı bağlandı. {mesaj}
            </p>
            <Button variant="primary" onClick={() => navigate('/ayarlar/takvim-baglantilari', { replace: true })}>
              Bağlantılara Git
            </Button>
          </>
        )}
        {durum === 'hata' && (
          <>
            <AlertTriangle size={48} style={{ color: 'var(--danger)', marginBottom: 16 }} />
            <h2 style={{ font: '700 18px/24px var(--font-sans)', color: 'var(--text-primary)', marginBottom: 8 }}>
              Bağlantı Kurulamadı
            </h2>
            <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', marginBottom: 16 }}>
              {mesaj}
            </p>
            <Button variant="secondary" onClick={() => navigate('/ayarlar/takvim-baglantilari', { replace: true })}>
              Tekrar Dene
            </Button>
          </>
        )}
      </Card>
      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
