// Zorunlu sözleşme onayı kapısı (mig 264/265).
//
// Karar (04.08): onay ZORUNLU — onaylamayan personel hiçbir veriye erişemez.
// Bu bileşen uygulama gövdesini sarar; onay gerekiyorsa içeriği tamamen
// gizleyip tam ekran onay penceresi gösterir.
//
// Kapsam kapısı SUNUCUDA: sozlesme_durumum() yalnız tip='zna' personel için
// gerekli=true döner. Müşteri portalı ve bayi kullanıcıları kilitlenmez.
//
// ⚠️ HATA DURUMUNDA KİLİTLEME YOK: RPC'ye ulaşılamazsa gerekli=false döner
// (servis katmanında) — tek bir ağ hatası tüm şirketi sistem dışında
// bırakmasın. Kapı, çalışmayı engellemek için değil onayı almak için var.

import { useEffect, useState, useRef } from 'react'
import { ShieldCheck, AlertTriangle, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from './ui'
import { SozlesmeMetni } from '../pages/KullaniciSozlesmesi'
import {
  aktifSozlesmeGetir, sozlesmeDurumum, sozlesmeOnayla,
} from '../services/kullaniciSozlesmeService'

export default function SozlesmeKapisi({ children }) {
  const { kullanici, cikisYap } = useAuth()
  const [durum, setDurum] = useState(null)      // null = henüz bilinmiyor
  const [sozlesme, setSozlesme] = useState(null)
  const [sonaGeldi, setSonaGeldi] = useState(false)
  const [kabulIsaretli, setKabulIsaretli] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState(null)
  const kaydirmaRef = useRef(null)

  useEffect(() => {
    if (!kullanici?.id) { setDurum({ gerekli: false }); return }
    let iptal = false
    sozlesmeDurumum().then(d => {
      if (iptal) return
      setDurum(d)
      if (d?.gerekli) aktifSozlesmeGetir().then(s => { if (!iptal) setSozlesme(s) })
    })
    return () => { iptal = true }
  }, [kullanici?.id])

  // Metnin sonuna inilmeden onay verilemesin — "okumadım" savunmasını
  // zayıflatan asıl unsur budur.
  const kaydirmaKontrol = (e) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) setSonaGeldi(true)
  }

  const onayla = async () => {
    if (!sozlesme?.versiyon) return
    setKaydediliyor(true)
    setHata(null)
    const sonuc = await sozlesmeOnayla(sozlesme.versiyon)
    setKaydediliyor(false)
    if (sonuc?.ok) setDurum({ gerekli: false })
    else setHata(sonuc?.hata || 'Onay kaydedilemedi. Lütfen tekrar deneyin.')
  }

  // Durum bilinene kadar uygulamayı normal göster (beyaz ekran/flaş olmasın)
  if (!durum || !durum.gerekli) return children

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--surface-sunken)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--surface-default)', borderRadius: 16,
        border: '1px solid var(--border-default)',
        width: 'min(900px, 100%)', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        {/* Başlık */}
        <div style={{ padding: '20px 26px 16px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheck size={20} strokeWidth={1.75} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '700 16px/21px var(--font-sans)', color: 'var(--text-primary)' }}>
                {sozlesme?.baslik || 'Kullanıcı Sözleşmesi'}
              </div>
              <div style={{ font: '400 12px/17px var(--font-sans)', color: 'var(--text-secondary)', marginTop: 2 }}>
                Devam edebilmek için sözleşmeyi okuyup onaylamanız gerekiyor.
                {sozlesme?.versiyon && <> · Sürüm {sozlesme.versiyon}</>}
              </div>
            </div>
          </div>
        </div>

        {/* Metin */}
        <div
          ref={kaydirmaRef}
          onScroll={kaydirmaKontrol}
          style={{ flex: 1, overflowY: 'auto', padding: '20px 26px' }}
        >
          {sozlesme
            ? <SozlesmeMetni sozlesme={sozlesme} />
            : <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>Metin yükleniyor…</div>}
        </div>

        {/* Onay */}
        <div style={{ padding: '16px 26px 20px', borderTop: '1px solid var(--border-default)' }}>
          {!sonaGeldi && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              font: '400 12px/17px var(--font-sans)', color: 'var(--text-tertiary)',
            }}>
              <AlertTriangle size={14} strokeWidth={1.75} />
              Onay kutusu, metnin sonuna geldiğinizde etkinleşir.
            </div>
          )}

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: sonaGeldi ? 'pointer' : 'not-allowed',
            opacity: sonaGeldi ? 1 : 0.5, marginBottom: 14,
          }}>
            <input
              type="checkbox"
              checked={kabulIsaretli}
              disabled={!sonaGeldi}
              onChange={(e) => setKabulIsaretli(e.target.checked)}
              style={{ width: 17, height: 17, marginTop: 1, flexShrink: 0, cursor: 'inherit' }}
            />
            <span style={{ font: '400 13px/19px var(--font-sans)', color: 'var(--text-primary)' }}>
              Sözleşmeyi okudum ve kabul ediyorum. Özellikle <b>veri gizliliği</b>,
              <b> toplu veri çıkarma yasağı</b>, <b>sistem kullanımının kaydedilmesi</b> ve
              <b> araç/mesai konum kayıtları</b> maddelerini bilerek onaylıyorum.
            </span>
          </label>

          {hata && (
            <div style={{
              marginBottom: 12, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
              font: '400 12px/17px var(--font-sans)', color: '#dc2626',
            }}>
              {hata}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button
              variant="primary"
              disabled={!kabulIsaretli || kaydediliyor}
              onClick={onayla}
              style={{ flex: 1 }}
            >
              {kaydediliyor ? 'Kaydediliyor…' : 'Onaylıyorum ve Devam Ediyorum'}
            </Button>
            {/* Onaylamak istemeyen çıkabilsin — kilitli ekranda mahsur kalmasın */}
            <Button variant="secondary" iconLeft={<LogOut size={14} strokeWidth={1.5} />} onClick={cikisYap}>
              Çıkış
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
