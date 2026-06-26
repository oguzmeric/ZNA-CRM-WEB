// B2B musteri portal davet kabul sayfasi — public route /davet/:token
// Akis:
//   1. Token dogrula -> email, firma, ad
//   2. Sifre belirle (iki kere)
//   3. Hesap olustur + otomatik giris -> /musteri-dashboard

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Building2, Mail, Lock, Loader2 } from 'lucide-react'
import { davetDogrula, davetKabul } from '../services/musteriDavetService'
import { emailIleGiris } from '../services/emailAuthService'

function DavetKabul() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [durum, setDurum] = useState('dogruluyor') // dogruluyor | hazir | basarili | gecersiz
  const [hata, setHata] = useState('')
  const [davet, setDavet] = useState(null)
  const [sifre, setSifre] = useState('')
  const [sifre2, setSifre2] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)

  useEffect(() => {
    let iptal = false
    ;(async () => {
      try {
        const data = await davetDogrula(token)
        if (iptal) return
        setDavet(data)
        setDurum('hazir')
      } catch (e) {
        if (iptal) return
        setHata(e?.message || 'Davet doğrulanamadı.')
        setDurum('gecersiz')
      }
    })()
    return () => { iptal = true }
  }, [token])

  const hesapOlustur = async (e) => {
    e?.preventDefault?.()
    setHata('')
    if (sifre.length < 8) { setHata('Şifre en az 8 karakter olmalı.'); return }
    if (sifre !== sifre2) { setHata('Şifreler eşleşmiyor.'); return }
    setYukleniyor(true)
    try {
      await davetKabul({ token, sifre })
      // Otomatik giris
      try {
        await emailIleGiris(davet.email, sifre)
      } catch (loginErr) {
        console.warn('[davet] otomatik login fail:', loginErr?.message)
        // Login fail olursa user manuel girer — gene basarili sayilir
      }
      setDurum('basarili')
      // 1.5sn sonra portala yonlendir
      setTimeout(() => navigate('/musteri-dashboard', { replace: true }), 1500)
    } catch (err) {
      setHata(err?.message || 'Hesap oluşturulamadı.')
    } finally {
      setYukleniyor(false)
    }
  }

  return (
    <div className="zna-davet">
      <style>{styles}</style>
      <div className="mesh" />
      <div className="card">
        <div className="brand">
          <img src="/logo.jpeg" alt="ZNA Teknoloji" className="brand-logo" />
        </div>

        {durum === 'dogruluyor' && (
          <div className="ortali">
            <div className="ikon spin"><Loader2 size={26} strokeWidth={2} /></div>
            <h1 className="title">Davet doğrulanıyor…</h1>
            <p className="sub">Lütfen bekleyin.</p>
          </div>
        )}

        {durum === 'gecersiz' && (
          <div className="ortali">
            <div className="ikon-hata"><AlertTriangle size={26} strokeWidth={2} /></div>
            <h1 className="title">Davet Geçersiz</h1>
            <p className="sub">{hata || 'Bu davet bağlantısı geçersiz veya süresi dolmuş.'}</p>
            <button type="button" className="btn-ikincil" onClick={() => navigate('/login', { replace: true })}>
              Giriş ekranına dön
            </button>
          </div>
        )}

        {durum === 'hazir' && davet && (
          <>
            <div className="ikon"><Building2 size={26} strokeWidth={2} /></div>
            <h1 className="title">Hoş geldiniz{davet.ad ? `, ${davet.ad}` : ''}!</h1>
            <p className="sub">
              <strong>{davet.firma}</strong> adına müşteri portalına davet edildiniz.
              Şifrenizi belirleyerek hesabınızı aktive edin.
            </p>

            <div className="bilgi-kutu">
              <div className="bilgi-satir">
                <Mail size={14} strokeWidth={2} />
                <span className="bilgi-label">E-posta</span>
                <span className="bilgi-deger">{davet.email}</span>
              </div>
              <div className="bilgi-satir">
                <Building2 size={14} strokeWidth={2} />
                <span className="bilgi-label">Firma</span>
                <span className="bilgi-deger">{davet.firma}</span>
              </div>
            </div>

            <form onSubmit={hesapOlustur}>
              <div className="group">
                <label className="label" htmlFor="d-sifre">Yeni şifre</label>
                <input
                  className="input" type="password" id="d-sifre" value={sifre}
                  onChange={(e) => setSifre(e.target.value)}
                  placeholder="En az 8 karakter" autoComplete="new-password" autoFocus disabled={yukleniyor}
                />
              </div>
              <div className="group">
                <label className="label" htmlFor="d-sifre2">Şifre (tekrar)</label>
                <input
                  className="input" type="password" id="d-sifre2" value={sifre2}
                  onChange={(e) => setSifre2(e.target.value)}
                  placeholder="Şifrenizi tekrar girin" autoComplete="new-password" disabled={yukleniyor}
                />
              </div>

              {hata && (
                <div className="error" role="alert">
                  <AlertTriangle size={15} strokeWidth={1.8} />
                  <span>{hata}</span>
                </div>
              )}

              <button type="submit" className="btn" disabled={yukleniyor}>
                {yukleniyor ? 'Hesap oluşturuluyor…' : <>Hesabımı aktive et <ArrowRight size={16} strokeWidth={2.5} /></>}
              </button>
            </form>

            <p className="footer">
              <Lock size={11} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Bağlantınız KVKK uyumlu ve şifrelidir.
            </p>
          </>
        )}

        {durum === 'basarili' && (
          <div className="ortali">
            <div className="ikon-basari"><CheckCircle2 size={36} strokeWidth={2} /></div>
            <h1 className="title">Hesabınız hazır!</h1>
            <p className="sub">Müşteri portalına yönlendiriliyorsunuz…</p>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = `
.zna-davet { position: fixed; inset: 0; display: grid; place-items: center; padding: 20px;
  font-family: var(--font-sans); background: var(--surface-bg); color: var(--text-primary); overflow: auto; }
.zna-davet .mesh { position: absolute; inset: 0; z-index: 0;
  background: radial-gradient(900px 600px at 15% 20%, rgba(30,90,168,0.10) 0%, transparent 60%),
              radial-gradient(800px 550px at 85% 80%, rgba(74,130,200,0.10) 0%, transparent 60%); }
.zna-davet .card { position: relative; z-index: 1; width: 100%; max-width: 440px;
  background: var(--surface-card); border: 1px solid var(--border-default); border-radius: 16px; padding: 32px;
  box-shadow: 0 24px 50px -20px rgba(30,90,168,0.18), 0 8px 20px -8px rgba(15,27,46,0.06); }
.zna-davet .brand { display: flex; justify-content: center; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--border-default); }
.zna-davet .brand-logo { height: 52px; width: auto; object-fit: contain; display: block; }
.zna-davet .ortali { text-align: center; }
.zna-davet .ikon { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; margin: 0 auto 14px;
  color: var(--brand-primary); background: var(--brand-primary-soft); }
.zna-davet .spin { animation: zna-spin 1s linear infinite; }
@keyframes zna-spin { to { transform: rotate(360deg); } }
.zna-davet .ikon-hata { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; margin: 0 auto 14px;
  color: var(--danger); background: var(--danger-soft); border: 1px solid var(--danger-border); }
.zna-davet .ikon-basari { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 16px;
  color: #2F7D4F; background: rgba(47,125,79,0.10); border: 1px solid rgba(47,125,79,0.28); }
.zna-davet .title { font-family: 'Bricolage Grotesque', var(--font-sans); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 6px; text-align: center; }
.zna-davet .sub { color: var(--text-tertiary); font-size: 13.5px; margin: 0 0 20px; line-height: 1.55; text-align: center; }

.zna-davet .bilgi-kutu { background: var(--surface-sunken); border: 1px solid var(--border-default);
  border-radius: 10px; padding: 12px 14px; margin: 16px 0 22px; }
.zna-davet .bilgi-satir { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; }
.zna-davet .bilgi-satir + .bilgi-satir { border-top: 1px dashed var(--border-default); padding-top: 8px; margin-top: 4px; }
.zna-davet .bilgi-satir svg { color: var(--brand-primary); flex-shrink: 0; }
.zna-davet .bilgi-label { color: var(--text-tertiary); font-weight: 600; min-width: 64px; }
.zna-davet .bilgi-deger { color: var(--text-primary); font-weight: 700; word-break: break-all; }

.zna-davet .group { margin-bottom: 14px; }
.zna-davet .label { display: block; font-size: 11px; font-weight: 700; color: var(--text-secondary); margin-bottom: 7px; letter-spacing: 0.06em; text-transform: uppercase; }
.zna-davet .input { width: 100%; padding: 12px 14px; background: var(--surface-sunken); border: 1.5px solid var(--border-default); border-radius: 10px; color: var(--text-primary); font: 500 14px/20px var(--font-sans); outline: none; transition: border-color 180ms, box-shadow 180ms; }
.zna-davet .input:focus { border-color: var(--brand-primary); background: var(--surface-card); box-shadow: 0 0 0 4px rgba(30,90,168,0.10); }
.zna-davet .input:disabled { opacity: 0.6; }

.zna-davet .btn { width: 100%; padding: 13px; margin-top: 4px;
  background: linear-gradient(135deg, var(--brand-primary), #4A82C8); color: #fff; border: none; border-radius: 10px;
  font: 700 14.5px/20px var(--font-sans); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 10px 24px -8px rgba(30,90,168,0.45); transition: transform 180ms; }
.zna-davet .btn:hover:not(:disabled) { transform: translateY(-1px); }
.zna-davet .btn:disabled { opacity: 0.6; cursor: wait; }
.zna-davet .btn-ikincil { padding: 10px 18px; background: var(--surface-sunken); color: var(--text-secondary);
  border: 1px solid var(--border-default); border-radius: 10px; font: 600 13px/18px var(--font-sans); cursor: pointer; }
.zna-davet .btn-ikincil:hover { border-color: var(--brand-primary); color: var(--brand-primary); }

.zna-davet .error { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px;
  background: var(--danger-soft); border: 1px solid var(--danger-border); border-radius: 8px;
  color: var(--danger); font: 500 13px/18px var(--font-sans); margin-bottom: 14px; }
.zna-davet .footer { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border-default);
  text-align: center; color: var(--text-tertiary); font-size: 12px; }
`

export default DavetKabul
