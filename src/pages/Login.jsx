// Modern split-screen login — sol tarafta marka showcase + animasyonlu yörünge,
// sağ tarafta sade login form. Müşteri portalı kullanıcıları da burayı görür,
// o yüzden iç metrik/veri yok.

import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Shield, Lock, Clock, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function Login() {
  const [kullaniciAdi, setKullaniciAdi] = useState('')
  const [sifre, setSifre] = useState('')
  const [sifreGoster, setSifreGoster] = useState(false)
  const [hata, setHata] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { girisYap } = useAuth()

  const hedef = location.state?.from?.pathname
    ? location.state.from.pathname + (location.state.from.search || '')
    : '/dashboard'

  const handleGiris = async (e) => {
    e?.preventDefault?.()
    setHata('')
    if (yukleniyor) return
    setYukleniyor(true)
    try {
      const basarili = await girisYap(kullaniciAdi, sifre)
      if (basarili) {
        navigate(hedef, { replace: true })
      } else {
        setHata('Kullanıcı adı veya şifre hatalı.')
      }
    } catch (err) {
      console.error('[Login] girisYap hata:', err)
      setHata('Giriş sırasında hata: ' + (err?.message || 'bilinmeyen'))
    } finally {
      setYukleniyor(false)
    }
  }

  return (
    <div className="zna-login">
      {/* Stiller — bileşene scope'lu (.zna-login altında) */}
      <style>{loginStyles}</style>

      <div className="mesh" />
      <div className="grid-overlay" />

      <div className="container">

        {/* SOL — Marka showcase */}
        <div className="left">
          <div className="brand">
            <img src="/logo.jpeg" alt="ZNA" className="brand-logo" />
            <div className="brand-text">
              ZNA Teknoloji
              <small>Servis & Saha Yönetim Platformu</small>
            </div>
          </div>

          <div className="hero">
            <h1 className="hero-title">
              Saha. Servis. Çözüm.<br />
              <span className="grad">Tek panelde.</span>
            </h1>
            <p className="hero-sub">
              ZNA CRM, ekiplerinizi ve hizmetlerinizi gerçek zamanlı yönetmenizi sağlayan
              güvenilir bir platform sunar.
            </p>

            <div className="feature-row">
              <span className="feature"><Shield size={14} strokeWidth={2.5} /> KVKK Uyumlu</span>
              <span className="feature"><Lock size={14} strokeWidth={2.5} /> End-to-End Şifreli</span>
              <span className="feature"><Clock size={14} strokeWidth={2.5} /> 7/24 Erişim</span>
              <span className="feature"><Zap size={14} strokeWidth={2.5} /> Gerçek Zamanlı</span>
            </div>
          </div>

          {/* Yörünge dekorasyonu — gerçek logo merkezde */}
          <div className="orbit" aria-hidden>
            <div className="ring ring-1">
              <span className="orbit-node n1" />
              <span className="orbit-node n3" />
            </div>
            <div className="ring ring-2">
              <span className="orbit-node n2" />
            </div>
            <div className="ring ring-3">
              <span className="orbit-node n4" />
            </div>
            <div className="orbit-center" />
            <div className="orbit-logo-wrap">
              <img src="/logo.jpeg" alt="" className="orbit-logo" />
            </div>
          </div>

          {/* Yıldızlanan noktalar */}
          <span className="dot d1" />
          <span className="dot d2" />
          <span className="dot d3" />
          <span className="dot d4" />
          <span className="dot d5" />

          <div className="footer-row">
            <div className="copyright">© {new Date().getFullYear()} ZNA Teknoloji</div>
            <a href="https://znateknoloji.com" target="_blank" rel="noopener noreferrer" className="footer-link">
              znateknoloji.com
            </a>
          </div>
        </div>

        {/* SAĞ — Login form */}
        <div className="right">
          <div className="login-card">
            <h1 className="login-title">Hoş geldiniz</h1>
            <p className="login-sub">ZNA CRM hesabınıza güvenli giriş yapın.</p>

            <form onSubmit={handleGiris}>
              <div className="form-group">
                <label className="form-label" htmlFor="username">Kullanıcı adı</label>
                <input
                  className="form-input"
                  type="text"
                  id="username"
                  value={kullaniciAdi}
                  onChange={(e) => setKullaniciAdi(e.target.value)}
                  placeholder="ornek.kullanici"
                  autoComplete="username"
                  autoFocus
                  disabled={yukleniyor}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">Şifre</label>
                <div className="form-input-wrap">
                  <input
                    className="form-input"
                    type={sifreGoster ? 'text' : 'password'}
                    id="password"
                    value={sifre}
                    onChange={(e) => setSifre(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={yukleniyor}
                  />
                  <button
                    type="button"
                    className="toggle-pass"
                    onClick={() => setSifreGoster(g => !g)}
                    tabIndex={-1}
                  >
                    {sifreGoster ? 'Gizle' : 'Göster'}
                  </button>
                </div>
              </div>

              {hata && (
                <div className="error-box" role="alert">
                  <AlertTriangle size={15} strokeWidth={1.8} />
                  <span>{hata}</span>
                </div>
              )}

              <button type="submit" className="submit-btn" disabled={yukleniyor}>
                {yukleniyor ? 'Giriş yapılıyor…' : (
                  <>
                    Giriş Yap
                    <ArrowRight size={16} strokeWidth={2.5} />
                  </>
                )}
              </button>
            </form>

            <p className="small-print">
              Hesabınız yok mu? <a href="/signup" className="link">Hesap oluştur</a>
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

const loginStyles = `
.zna-login {
  --zna-success: #2F7D4F;
  --zna-brand-light: #4A82C8;
  position: fixed; inset: 0;
  font-family: var(--font-sans);
  background: var(--surface-bg);
  color: var(--text-primary);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.zna-login .mesh {
  position: absolute; inset: 0;
  background:
    radial-gradient(900px 600px at 12% 25%, rgba(30,90,168,0.10) 0%, transparent 60%),
    radial-gradient(800px 550px at 88% 75%, rgba(74,130,200,0.10) 0%, transparent 60%);
  z-index: 0;
  animation: zna-meshMove 26s ease-in-out infinite;
}
@keyframes zna-meshMove {
  0%, 100% { transform: scale(1) rotate(0); }
  50% { transform: scale(1.1) rotate(2deg); }
}
.zna-login .grid-overlay {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(15,27,46,0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15,27,46,0.035) 1px, transparent 1px);
  background-size: 56px 56px;
  z-index: 0;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
}

.zna-login .container {
  position: relative; z-index: 2;
  height: 100vh;
  display: grid;
  grid-template-columns: 1.2fr 1fr;
}

/* SOL */
.zna-login .left {
  display: flex; flex-direction: column;
  justify-content: space-between;
  padding: 40px 60px;
  position: relative;
  overflow: hidden;
}
.zna-login .brand {
  display: flex; align-items: center; gap: 14px;
  z-index: 5;
}
.zna-login .brand-logo {
  height: 44px; width: auto; object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(30,90,168,0.18));
}
.zna-login .brand-text {
  font-family: 'Bricolage Grotesque', var(--font-sans);
  font-size: 20px; font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.1;
}
.zna-login .brand-text small {
  display: block;
  font-family: var(--font-sans);
  font-size: 11px; font-weight: 500;
  color: var(--text-tertiary);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-top: 4px;
}

.zna-login .hero {
  flex: 1; display: flex; flex-direction: column;
  justify-content: center;
  position: relative; z-index: 3;
  padding: 40px 0;
}
.zna-login .hero-title {
  font-family: 'Bricolage Grotesque', var(--font-sans);
  font-size: 54px; font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.02;
  margin: 0 0 24px;
  max-width: 540px;
  color: var(--text-primary);
}
.zna-login .hero-title .grad {
  background: linear-gradient(135deg, var(--brand-primary), var(--zna-brand-light));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.zna-login .hero-sub {
  font-size: 16px;
  color: var(--text-secondary);
  line-height: 1.55;
  max-width: 460px;
  margin: 0 0 36px;
}
.zna-login .feature-row {
  display: flex; gap: 10px; flex-wrap: wrap;
  max-width: 540px;
}
.zna-login .feature {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 999px;
  font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  box-shadow: 0 1px 2px rgba(15,27,46,0.06);
  transition: border-color 200ms, box-shadow 200ms, transform 200ms;
}
.zna-login .feature:hover {
  border-color: var(--zna-brand-light);
  box-shadow: 0 6px 16px -8px rgba(30,90,168,0.25);
  transform: translateY(-1px);
}
.zna-login .feature svg { color: var(--brand-primary); }

/* ORBIT */
.zna-login .orbit {
  position: absolute;
  right: -120px; top: 50%;
  transform: translateY(-50%);
  width: 520px; height: 520px;
  z-index: 1;
  pointer-events: none;
  /* container şeffaf — alt elemanlara tek tek opacity uyguluyoruz,
     böylece merkez logo net kalır */
}
.zna-login .ring,
.zna-login .orbit-node,
.zna-login .orbit-center {
  opacity: 0.55;
}
.zna-login .ring {
  position: absolute; inset: 0;
  border: 1px solid rgba(30,90,168,0.08);
  border-radius: 50%;
}
.zna-login .ring-1 { animation: zna-spin 60s linear infinite; }
.zna-login .ring-2 { inset: 60px; animation: zna-spin 42s linear infinite reverse; border-color: rgba(74,130,200,0.10); }
.zna-login .ring-3 { inset: 130px; animation: zna-spin 30s linear infinite; border-color: rgba(30,90,168,0.06); }
@keyframes zna-spin { to { transform: rotate(360deg); } }

.zna-login .orbit-node {
  position: absolute;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-primary), var(--zna-brand-light));
  opacity: 0.6;
  box-shadow: 0 0 0 3px rgba(30,90,168,0.05), 0 0 10px rgba(30,90,168,0.18);
}
.zna-login .n1 { top: -5px; left: 50%; transform: translateX(-50%); }
.zna-login .n2 { top: 50%; right: -5px; transform: translateY(-50%); }
.zna-login .n3 { bottom: -5px; left: 30%; }
.zna-login .n4 { top: 20%; left: -5px; }

.zna-login .orbit-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 100px; height: 100px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(30,90,168,0.12) 0%, transparent 70%);
  animation: zna-pulseGlow 4.5s ease-in-out infinite;
}
@keyframes zna-pulseGlow {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
  50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.75; }
}
.zna-login .orbit-logo-wrap {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 92px; height: 92px;
  border-radius: 22px;
  background: var(--surface-card);
  display: grid; place-items: center;
  box-shadow:
    0 16px 36px -10px rgba(30,90,168,0.28),
    inset 0 1px 0 rgba(255,255,255,0.8),
    0 0 0 1px var(--border-default);
  z-index: 5;
  /* logo tam net — opacity yok */
}
.zna-login .orbit-logo { width: 72%; height: 72%; object-fit: contain; }

.zna-login .dot {
  position: absolute;
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--zna-brand-light);
  box-shadow: 0 0 6px var(--zna-brand-light);
  opacity: 0.3;
  animation: zna-twinkle 4s ease-in-out infinite;
}
.zna-login .d1 { top: 18%; left: 35%; animation-delay: 0.2s; }
.zna-login .d2 { top: 70%; left: 22%; animation-delay: 0.8s; }
.zna-login .d3 { top: 40%; left: 8%; animation-delay: 1.5s; }
.zna-login .d4 { top: 25%; right: 15%; animation-delay: 0.4s; }
.zna-login .d5 { bottom: 25%; right: 32%; animation-delay: 1.0s; }
@keyframes zna-twinkle {
  0%, 100% { opacity: 0.15; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

.zna-login .footer-row {
  display: flex; align-items: center; justify-content: space-between;
  color: var(--text-tertiary); font-size: 12.5px;
  z-index: 5;
}
.zna-login .copyright { font-weight: 500; }
.zna-login .footer-link {
  color: var(--text-tertiary);
  font-weight: 500;
  text-decoration: none;
  transition: color 150ms;
}
.zna-login .footer-link:hover { color: var(--brand-primary); }

/* SAĞ */
.zna-login .right {
  display: grid; place-items: center;
  padding: 36px;
  position: relative;
}
.zna-login .login-card {
  width: 100%;
  max-width: 420px;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 16px;
  padding: 36px 32px;
  box-shadow: 0 24px 50px -20px rgba(30,90,168,0.18), 0 8px 20px -8px rgba(15,27,46,0.06);
  animation: zna-slideUp 0.7s cubic-bezier(.2,.7,.3,1) 0.15s both;
  position: relative;
}
@keyframes zna-slideUp {
  from { opacity: 0; transform: translateY(28px); }
  to { opacity: 1; transform: translateY(0); }
}

.zna-login .login-title {
  font-family: 'Bricolage Grotesque', var(--font-sans);
  font-size: 26px; font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
  color: var(--text-primary);
}
.zna-login .login-sub {
  color: var(--text-tertiary);
  font-size: 13.5px;
  margin: 0 0 26px;
}
.zna-login .form-group { margin-bottom: 16px; }
.zna-login .form-label {
  display: block;
  font-size: 11px; font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 7px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.zna-login .form-input {
  width: 100%; padding: 13px 14px;
  background: var(--surface-sunken);
  border: 1.5px solid var(--border-default);
  border-radius: 10px;
  color: var(--text-primary);
  font: 500 14px/20px var(--font-sans);
  transition: border-color 180ms, background 180ms, box-shadow 180ms;
  outline: none;
}
.zna-login .form-input::placeholder { color: var(--text-faded); }
.zna-login .form-input:focus {
  border-color: var(--brand-primary);
  background: var(--surface-card);
  box-shadow: 0 0 0 4px rgba(30,90,168,0.10);
}
.zna-login .form-input:disabled { opacity: 0.6; cursor: not-allowed; }
.zna-login .form-input-wrap { position: relative; }
.zna-login .toggle-pass {
  position: absolute; right: 8px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font: 700 11.5px/16px var(--font-sans);
  padding: 6px 10px; border-radius: 8px;
  transition: color 150ms, background 150ms;
}
.zna-login .toggle-pass:hover {
  color: var(--brand-primary);
  background: var(--brand-primary-soft);
}

.zna-login .error-box {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 10px 12px;
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  color: var(--danger);
  font: 500 13px/18px var(--font-sans);
  margin-bottom: 14px;
}
.zna-login .error-box svg { flex-shrink: 0; margin-top: 1px; }

.zna-login .submit-btn {
  width: 100%; padding: 14px;
  margin-top: 4px;
  background: linear-gradient(135deg, var(--brand-primary), var(--zna-brand-light));
  color: #fff;
  border: none;
  border-radius: 10px;
  font: 700 14.5px/20px var(--font-sans);
  cursor: pointer;
  box-shadow:
    0 10px 24px -8px rgba(30,90,168,0.45),
    inset 0 1px 0 rgba(255,255,255,0.2);
  transition: transform 180ms, box-shadow 180ms;
  letter-spacing: 0.01em;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
}
.zna-login .submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 30px -10px rgba(30,90,168,0.55);
}
.zna-login .submit-btn:active:not(:disabled) { transform: translateY(0); }
.zna-login .submit-btn:disabled { opacity: 0.6; cursor: wait; }
.zna-login .submit-btn svg { transition: transform 180ms; }
.zna-login .submit-btn:hover:not(:disabled) svg { transform: translateX(3px); }

.zna-login .small-print {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--border-default);
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
.zna-login .small-print strong { color: var(--text-secondary); font-weight: 600; }

@media (max-width: 980px) {
  .zna-login .container { grid-template-columns: 1fr; }
  .zna-login .left { display: none; }
  .zna-login .right { padding: 20px; }
}
`

export default Login
