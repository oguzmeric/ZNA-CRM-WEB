// Self-servis sifre sifirlama — 2 adim:
//   1) Email gir -> OTP gonder (amac: 'sifre_sifirla')
//   2) OTP + yeni sifre gir -> sifre guncelle -> giris ekranina don
// Giris/Signup ile ayni gorsel dil (ortali kart, marka).

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react'
import { kayitKodGonder, kayitKodDogrula } from '../services/emailAuthService'

function SifremiUnuttum() {
  const navigate = useNavigate()
  const [adim, setAdim] = useState(1)
  const [email, setEmail] = useState('')
  const [kod, setKod] = useState('')
  const [sifre, setSifre] = useState('')
  const [sifre2, setSifre2] = useState('')
  const [hata, setHata] = useState('')
  const [bilgi, setBilgi] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [geriSayim, setGeriSayim] = useState(0)

  useEffect(() => {
    if (geriSayim <= 0) return
    const t = setTimeout(() => setGeriSayim((g) => g - 1), 1000)
    return () => clearTimeout(t)
  }, [geriSayim])

  const kodGonder = async (e) => {
    e?.preventDefault?.()
    setHata(''); setBilgi('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setHata('Geçerli bir e-posta adresi girin.')
      return
    }
    setYukleniyor(true)
    try {
      await kayitKodGonder(email, 'sifre_sifirla')
      setBilgi(`Doğrulama kodu ${email} adresine gönderildi. Gelen kutunuzu (ve spam'i) kontrol edin.`)
      setAdim(2)
      setGeriSayim(60)
    } catch (err) {
      setHata(err?.message || 'Kod gönderilemedi.')
    } finally {
      setYukleniyor(false)
    }
  }

  const kodTekrarGonder = async () => {
    if (geriSayim > 0) return
    setHata(''); setBilgi('')
    setYukleniyor(true)
    try {
      await kayitKodGonder(email, 'sifre_sifirla')
      setBilgi('Yeni kod gönderildi.')
      setGeriSayim(60)
    } catch (err) {
      setHata(err?.message || 'Kod gönderilemedi.')
    } finally {
      setYukleniyor(false)
    }
  }

  const sifreyiGuncelle = async (e) => {
    e?.preventDefault?.()
    setHata(''); setBilgi('')
    if (!/^\d{6}$/.test(kod)) { setHata('Kod 6 haneli olmalı.'); return }
    if (sifre.length < 8) { setHata('Şifre en az 8 karakter olmalı.'); return }
    if (sifre !== sifre2) { setHata('Şifreler eşleşmiyor.'); return }
    setYukleniyor(true)
    try {
      await kayitKodDogrula({ email, kod, yeniSifre: sifre, amac: 'sifre_sifirla' })
      setAdim(3)
    } catch (err) {
      setHata(err?.message || 'Şifre güncellenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }

  return (
    <div className="zna-sifre">
      <style>{styles}</style>
      <div className="mesh" />
      <div className="card">
        <div className="brand">
          <img src="/logo.jpeg" alt="ZNA Teknoloji" className="brand-logo" />
        </div>

        {adim === 1 && (
          <>
            <div className="ikon"><KeyRound size={26} strokeWidth={2} /></div>
            <h1 className="title">Şifreni sıfırla</h1>
            <p className="sub">E-posta adresinizi girin, size 6 haneli doğrulama kodu gönderelim.</p>
            <form onSubmit={kodGonder}>
              <div className="group">
                <label className="label" htmlFor="su-email">E-posta adresi</label>
                <input className="input" type="email" id="su-email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="ornek@eposta.com"
                  autoComplete="email" autoFocus disabled={yukleniyor} />
              </div>
              {hata && <ErrorBox mesaj={hata} />}
              <button type="submit" className="btn" disabled={yukleniyor}>
                {yukleniyor ? 'Gönderiliyor…' : <>Kod gönder <ArrowRight size={16} strokeWidth={2.5} /></>}
              </button>
            </form>
          </>
        )}

        {adim === 2 && (
          <>
            <button type="button" className="back" onClick={() => { setAdim(1); setKod(''); setSifre(''); setSifre2(''); setHata(''); setBilgi('') }}>
              <ArrowLeft size={13} strokeWidth={2.5} /> E-posta değiştir
            </button>
            <h1 className="title">Doğrulama kodu</h1>
            <p className="sub"><strong>{email}</strong> adresine gönderilen kodu ve yeni şifrenizi girin.</p>
            {bilgi && <div className="info"><CheckCircle2 size={15} strokeWidth={2} /> {bilgi}</div>}
            <form onSubmit={sifreyiGuncelle}>
              <div className="group">
                <label className="label" htmlFor="su-kod">6 haneli kod</label>
                <input className="input kod" type="text" id="su-kod" value={kod}
                  onChange={(e) => setKod(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus disabled={yukleniyor} />
                <button type="button" className="resend" onClick={kodTekrarGonder} disabled={geriSayim > 0 || yukleniyor}>
                  {geriSayim > 0 ? `Yeni kod (${geriSayim}sn)` : 'Yeni kod gönder'}
                </button>
              </div>
              <div className="group">
                <label className="label" htmlFor="su-sifre">Yeni şifre</label>
                <input className="input" type="password" id="su-sifre" value={sifre}
                  onChange={(e) => setSifre(e.target.value)} placeholder="En az 8 karakter" autoComplete="new-password" disabled={yukleniyor} />
              </div>
              <div className="group">
                <label className="label" htmlFor="su-sifre2">Yeni şifre (tekrar)</label>
                <input className="input" type="password" id="su-sifre2" value={sifre2}
                  onChange={(e) => setSifre2(e.target.value)} placeholder="Yeni şifrenizi tekrar girin" autoComplete="new-password" disabled={yukleniyor} />
              </div>
              {hata && <ErrorBox mesaj={hata} />}
              <button type="submit" className="btn" disabled={yukleniyor}>
                {yukleniyor ? 'İşleniyor…' : <>Şifreyi güncelle <ArrowRight size={16} strokeWidth={2.5} /></>}
              </button>
            </form>
          </>
        )}

        {adim === 3 && (
          <div className="basari">
            <div className="basari-ikon"><CheckCircle2 size={34} strokeWidth={2} /></div>
            <h1 className="title">Şifreniz güncellendi</h1>
            <p className="sub">Yeni şifrenizle giriş yapabilirsiniz.</p>
            <button type="button" className="btn" onClick={() => navigate('/login', { replace: true })}>
              Giriş ekranına git <ArrowRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {adim !== 3 && (
          <p className="footer">Şifrenizi hatırladınız mı? <a href="/login" className="link">Giriş yapın</a></p>
        )}
      </div>
    </div>
  )
}

function ErrorBox({ mesaj }) {
  return (
    <div className="error" role="alert">
      <AlertTriangle size={15} strokeWidth={1.8} /><span>{mesaj}</span>
    </div>
  )
}

const styles = `
.zna-sifre { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px;
  font-family: var(--font-sans); background: var(--surface-bg); color: var(--text-primary); overflow: auto; }
.zna-sifre .mesh { position: absolute; inset: 0; z-index: 0;
  background: radial-gradient(900px 600px at 15% 20%, rgba(30,90,168,0.10) 0%, transparent 60%),
              radial-gradient(800px 550px at 85% 80%, rgba(74,130,200,0.10) 0%, transparent 60%); }
.zna-sifre .card { position: relative; z-index: 1; width: 100%; max-width: 420px;
  background: var(--surface-card); border: 1px solid var(--border-default); border-radius: 16px; padding: 32px;
  box-shadow: 0 24px 50px -20px rgba(30,90,168,0.18), 0 8px 20px -8px rgba(15,27,46,0.06); }
.zna-sifre .brand { display: flex; justify-content: center; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--border-default); }
.zna-sifre .brand-logo { height: 52px; width: auto; object-fit: contain; display: block; }
.zna-sifre .ikon { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; margin-bottom: 14px;
  color: var(--brand-primary); background: var(--brand-primary-soft); }
.zna-sifre .title { font-family: 'Bricolage Grotesque', var(--font-sans); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 6px; }
.zna-sifre .sub { color: var(--text-tertiary); font-size: 13.5px; margin: 0 0 20px; line-height: 1.5; }
.zna-sifre .group { margin-bottom: 14px; }
.zna-sifre .label { display: block; font-size: 11px; font-weight: 700; color: var(--text-secondary); margin-bottom: 7px; letter-spacing: 0.06em; text-transform: uppercase; }
.zna-sifre .input { width: 100%; padding: 12px 14px; background: var(--surface-sunken); border: 1.5px solid var(--border-default); border-radius: 10px; color: var(--text-primary); font: 500 14px/20px var(--font-sans); outline: none; transition: border-color 180ms, box-shadow 180ms; }
.zna-sifre .input:focus { border-color: var(--brand-primary); background: var(--surface-card); box-shadow: 0 0 0 4px rgba(30,90,168,0.10); }
.zna-sifre .input:disabled { opacity: 0.6; }
.zna-sifre .kod { font-family: 'SF Mono','Monaco','Consolas',monospace; font-size: 22px; font-weight: 700; letter-spacing: 0.4em; text-align: center; }
.zna-sifre .resend { margin-top: 6px; background: none; border: none; padding: 4px 2px; font: 600 11.5px/16px var(--font-sans); color: var(--brand-primary); cursor: pointer; }
.zna-sifre .resend:disabled { color: var(--text-faded); cursor: not-allowed; }
.zna-sifre .btn { width: 100%; padding: 13px; margin-top: 4px; background: linear-gradient(135deg, var(--brand-primary), #4A82C8); color: #fff; border: none; border-radius: 10px; font: 700 14.5px/20px var(--font-sans); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 10px 24px -8px rgba(30,90,168,0.45); transition: transform 180ms; }
.zna-sifre .btn:hover:not(:disabled) { transform: translateY(-1px); }
.zna-sifre .btn:disabled { opacity: 0.6; cursor: wait; }
.zna-sifre .back { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; padding: 0; margin-bottom: 12px; font: 600 12px/16px var(--font-sans); color: var(--text-tertiary); cursor: pointer; }
.zna-sifre .error { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; background: var(--danger-soft); border: 1px solid var(--danger-border); border-radius: 8px; color: var(--danger); font: 500 13px/18px var(--font-sans); margin-bottom: 14px; }
.zna-sifre .info { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; background: rgba(47,125,79,0.08); border: 1px solid rgba(47,125,79,0.25); border-radius: 8px; color: #2F7D4F; font: 500 12.5px/17px var(--font-sans); margin-bottom: 14px; }
.zna-sifre .basari { text-align: center; }
.zna-sifre .basari-ikon { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 14px; color: #2F7D4F; background: rgba(47,125,79,0.10); border: 1px solid rgba(47,125,79,0.28); }
.zna-sifre .footer { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border-default); text-align: center; color: var(--text-tertiary); font-size: 12px; }
.zna-sifre .link { color: var(--brand-primary); text-decoration: none; font-weight: 600; }
.zna-sifre .link:hover { text-decoration: underline; }
`

export default SifremiUnuttum
