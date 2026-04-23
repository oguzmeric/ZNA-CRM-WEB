import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button, Input, Label } from '../components/ui'

function Login() {
  const [kullaniciAdi, setKullaniciAdi] = useState('')
  const [sifre, setSifre] = useState('')
  const [hata, setHata] = useState('')
  const navigate = useNavigate()
  const { girisYap } = useAuth()

  const handleGiris = async () => {
    setHata('')
    try {
      const basarili = await girisYap(kullaniciAdi, sifre)
      if (basarili) {
        navigate('/dashboard', { replace: true })
      } else {
        setHata('Kullanıcı adı veya şifre hatalı.')
      }
    } catch (err) {
      console.error('[Login] girisYap hata:', err)
      setHata('Giriş sırasında hata: ' + (err?.message || 'bilinmeyen'))
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleGiris()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <img
        src="/logo.jpeg"
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '60%', height: '60%',
          objectFit: 'contain',
          opacity: 0.03,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 400,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          padding: 32,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <img src="/logo.jpeg" alt="ZNA Logo" style={{ height: 48, objectFit: 'contain' }} />
        </div>

        <h1 style={{ font: '600 20px/28px var(--font-sans)', color: 'var(--text-primary)', textAlign: 'center', margin: '0 0 4px' }}>
          ZNA CRM
        </h1>
        <p style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'center', margin: '0 0 24px' }}>
          Devam etmek için giriş yapın
        </p>

        <div style={{ marginBottom: 16 }}>
          <Label htmlFor="login-user">Kullanıcı adı</Label>
          <Input
            id="login-user"
            type="text"
            value={kullaniciAdi}
            onChange={(e) => setKullaniciAdi(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="kullanici_adi"
            autoComplete="username"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label htmlFor="login-pass">Şifre</Label>
          <Input
            id="login-pass"
            type="password"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        {hata && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 12px',
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)',
              font: '400 13px/18px var(--font-sans)',
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{hata}</span>
          </div>
        )}

        <Button variant="primary" onClick={handleGiris} style={{ width: '100%', justifyContent: 'center' }}>
          Giriş Yap
        </Button>
      </div>
    </div>
  )
}

export default Login
