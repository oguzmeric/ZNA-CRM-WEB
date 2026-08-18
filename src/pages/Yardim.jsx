// Yardım & Destek — HERKESE AÇIK sayfa (/yardim).
//
// ⚠️ Bu sayfa App Store Connect'in "Support URL" alanına girilir; Apple her
// uygulamadan çalışan bir destek sayfası ister ve incelemeci burayı ANONİM
// açar. Auth gate'in ÖNÜNDE kalmalı.
//
// ⚠️ /destek yolu ZATEN KULLANIMDA (giriş yapmış personelin iç destek talebi
// modülü). Karışmasın diye herkese açık sayfa /yardim yolundadır.

import { Link } from 'react-router-dom'
import { LifeBuoy, ArrowLeft, Mail, Globe, ShieldCheck } from 'lucide-react'
import { Card, Button } from '../components/ui'
import { DESTEK_EPOSTA, KURUM_ADI, KURUM_SITE, UYGULAMA_ADI } from '../lib/kurumsalBilgi'

const SSS = [
  {
    soru: 'Uygulamayı kimler kullanabilir?',
    cevap:
      `${UYGULAMA_ADI}, ${KURUM_ADI} saha ve ofis personeli ile ${KURUM_ADI} müşterileri için ` +
      'geliştirilmiştir. Personel hesapları kurum yöneticisi tarafından tanımlanır; müşteriler ' +
      'kendilerine gönderilen davet bağlantısıyla hesaplarını oluşturur.',
  },
  {
    soru: 'Hesabım yok, nasıl alabilirim?',
    cevap:
      `${KURUM_ADI} ile çalışan bir kurumun yetkilisiyseniz ${DESTEK_EPOSTA} adresine kurum adınızla ` +
      'yazın; portal davetiniz e-posta ile iletilir. Personel hesapları için İK/yönetim ile görüşün.',
  },
  {
    soru: 'Giriş yapamıyorum, ne yapmalıyım?',
    cevap:
      'Giriş ekranındaki "Şifremi unuttum" bağlantısıyla e-posta adresinize doğrulama kodu ' +
      'gönderilir ve yeni parola belirlersiniz. Sorun sürerse destek adresine yazın.',
  },
  {
    soru: 'Bildirim gelmiyor.',
    cevap:
      'Cihaz ayarlarından uygulamaya bildirim izni verildiğinden emin olun. İzin verildiği hâlde ' +
      'bildirim gelmiyorsa uygulamadan çıkıp yeniden giriş yapın — bildirim kaydı girişte yenilenir.',
  },
  {
    soru: 'Hesabımı nasıl silerim?',
    cevap:
      'Uygulamada Profil → Hesabı Sil adımlarını izleyin. Silme sonrasında kimlik ve iletişim ' +
      'bilgileriniz anonimleştirilir. Yasal saklama yükümlülüğü nedeniyle tamamlanmış iş kayıtları ' +
      'silinmez, yalnız kişi bağlantısı kaldırılır.',
  },
  {
    soru: 'Verilerim nasıl korunuyor?',
    cevap:
      'Veriler Avrupa Birliği (İrlanda) bölgesindeki sunucularda barındırılır, aktarım TLS ile ' +
      'şifrelenir ve her kullanıcı yalnız yetkili olduğu kayıtlara erişir. Ayrıntı için gizlilik ' +
      'politikasına bakabilirsiniz.',
  },
]

export default function Yardim() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 60px' }}>
      <div style={{ marginBottom: 18 }}>
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
      </div>

      <Card style={{ padding: '28px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <LifeBuoy size={22} strokeWidth={1.75} style={{ color: 'var(--accent-primary)' }} />
          <h1 style={{ font: '700 21px/1.35 var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
            {UYGULAMA_ADI} — Yardım &amp; Destek
          </h1>
        </div>
        <p style={{ font: '400 13.5px/1.75 var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          {UYGULAMA_ADI}; güvenlik ve bilişim sistemleri kurulum, bakım ve servis süreçlerini yöneten
          bir saha hizmet uygulamasıdır. Saha ekibi servis, görev, keşif ve stok işlerini yürütür;
          müşteriler kendi arıza taleplerini açıp sürecini izler.
        </p>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 26,
          paddingBottom: 22, borderBottom: '1px solid var(--border-default)',
        }}>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Mail size={14} strokeWidth={1.75} />}
            onClick={() => { window.location.href = `mailto:${DESTEK_EPOSTA}` }}
          >
            {DESTEK_EPOSTA}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Globe size={14} strokeWidth={1.75} />}
            onClick={() => window.open(KURUM_SITE, '_blank', 'noopener,noreferrer')}
          >
            {KURUM_SITE.replace('https://', '')}
          </Button>
          <Link to="/gizlilik" style={{ textDecoration: 'none' }}>
            <Button variant="tertiary" size="sm" iconLeft={<ShieldCheck size={14} strokeWidth={1.75} />}>
              Gizlilik Politikası
            </Button>
          </Link>
        </div>

        <h2 style={{ font: '700 16px/1.4 var(--font-sans)', color: 'var(--text-primary)', margin: '0 0 14px' }}>
          Sık sorulan sorular
        </h2>

        {SSS.map((s) => (
          <section key={s.soru} style={{ marginBottom: 18 }}>
            <h3 style={{ font: '600 14px/1.45 var(--font-sans)', color: 'var(--text-primary)', margin: '0 0 5px' }}>
              {s.soru}
            </h3>
            <p style={{ font: '400 13.5px/1.75 var(--font-sans)', color: 'var(--text-secondary)', margin: 0 }}>
              {s.cevap}
            </p>
          </section>
        ))}

        <div style={{
          marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--border-default)',
          font: '400 12.5px/1.7 var(--font-sans)', color: 'var(--text-tertiary)',
        }}>
          Yanıt bulamadığınız konular için <a href={`mailto:${DESTEK_EPOSTA}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>{DESTEK_EPOSTA}</a>{' '}
          adresine yazabilirsiniz. Destek talepleri hafta içi mesai saatlerinde yanıtlanır.
        </div>
      </Card>
    </div>
  )
}
