// Gizlilik Politikası — HERKESE AÇIK sayfa (/gizlilik).
//
// ⚠️ Bu sayfa App Store Connect'in "Privacy Policy URL" alanına girilir ve
// Apple incelemecisi ANONİM olarak açar: auth gate'in ÖNÜNDE kalmalı
// (App.jsx'te /kullanici-sozlesmesi ile aynı blokta). Login arkasına düşerse
// inceleme "politikaya erişilemiyor" diye reddeder.
//
// ⚠️ Metin, mobildeki GizlilikPolitikasiScreen.js ile AYNI olmalı. Biri
// değişirse diğeri de değişir — iki farklı politika beyanı hukuki risktir.
//
// Beyanların doğruluğu 18.08'de ölçülerek yazıldı:
//   • Supabase projesi bölgesi: West EU (Ireland) → "AB sunucuları" doğru
//   • `kullanicilar` tablosunda şifre kolonu YOK → parola yalnız Supabase
//     Auth'ta (bcrypt hash). Eski metindeki "hash gelecek sürümde" ifadesi
//     yanlıştı, kaldırıldı.

import { Link } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, Printer, Mail } from 'lucide-react'
import { Card, Button } from '../components/ui'
import { DESTEK_EPOSTA } from '../lib/kurumsalBilgi'

const GIZLILIK_GUNCELLEME = '18 Ağustos 2026'

/** Politika gövdesi — bölüm listesi VERİ olarak; web ve mobil aynı sırayı izler. */
const BOLUMLER = [
  {
    baslik: '1. Veri Sorumlusu',
    paragraflar: [
      'ZNA Teknoloji, ZNA CRM uygulaması aracılığıyla işlenen kişisel verilerin ' +
      '6698 sayılı KVKK anlamında veri sorumlusudur.',
      `İletişim: ${DESTEK_EPOSTA}`,
    ],
  },
  {
    baslik: '2. Uygulamanın Amacı ve Kullanıcıları',
    paragraflar: [
      'ZNA CRM; güvenlik ve bilişim sistemleri kurulum, bakım ve servis süreçlerini ' +
      'yöneten bir saha hizmet uygulamasıdır. İki kullanıcı grubu vardır:',
    ],
    maddeler: [
      'Saha ve ofis personeli: servis talepleri, görevler, keşifler, stok ve mesai takibi',
      'Müşteriler: kendi arıza/servis taleplerini açma, sürecini izleme ve cihaz envanterini görme',
    ],
    sonrasi:
      'Hesaplar kurum yöneticisi tarafından tanımlanır veya davet bağlantısı ile oluşturulur. ' +
      'Uygulama içi satın alma veya reklam yoktur.',
  },
  {
    baslik: '3. Toplanan Veriler',
    maddeler: [
      'Kimlik bilgileri: ad, soyad, kullanıcı adı, unvan',
      'İletişim bilgileri: e-posta, telefon',
      'Profil fotoğrafı (isteğe bağlı — yalnız kullanıcı yüklerse)',
      'İş verileri: servis talepleri, görev ve keşif kayıtları, fotoğraflar, imzalar, ' +
        'müşteri ve lokasyon bilgileri, stok hareketleri',
      'Konum verisi (yalnız aşağıda 4. bölümde sayılan işlemlerde)',
      'Teknik veriler: cihaz modeli, işletim sistemi sürümü, uygulama sürümü ve hata kayıtları',
    ],
  },
  {
    baslik: '4. Konum Verisi',
    paragraflar: [
      'Konum yalnızca kullanıcı bir işlemi başlattığı anda, o işlem için alınır. ' +
      'Uygulama arka planda konum takibi YAPMAZ.',
    ],
    maddeler: [
      'Mesai başlatma/bitirme: işlemin tanımlı çalışma noktasında yapıldığının doğrulanması',
      'Servis ve keşif kaydı: işin yapıldığı adresin kayda geçirilmesi',
      'Araç fotoğraf kaydı: kaydın nerede alındığının belgelenmesi',
    ],
    sonrasi:
      'Konum izni reddedilirse uygulamanın diğer bölümleri çalışmaya devam eder; ' +
      'yalnız yukarıdaki işlemler konum bilgisi olmadan tamamlanamaz.',
  },
  {
    baslik: '5. Kamera ve Fotoğraflar',
    paragraflar: [
      'Kamera; barkod/seri numarası okuma ve servis, keşif, bakım kayıtlarına fotoğraf ' +
      'ekleme için kullanılır. Galeri erişimi yalnız kullanıcının seçtiği fotoğrafı ' +
      'yüklemek içindir. Uygulama, kullanıcı seçmediği hiçbir görsele erişmez ve ' +
      'galeriyi taramaz.',
    ],
  },
  {
    baslik: '6. Bildirimler',
    paragraflar: [
      'Kendisine atanan iş, gelen mesaj ve onay talepleri için anlık bildirim gönderilir. ' +
      'Bildirimler yalnız iş süreçleriyle ilgilidir; pazarlama bildirimi gönderilmez. ' +
      'Cihaz bildirim izni istendiğinde reddedilebilir veya sonradan sistem ayarlarından kapatılabilir.',
    ],
  },
  {
    baslik: '7. Verilerin İşlenme Amacı ve Hukuki Sebebi',
    maddeler: [
      'Sözleşmenin kurulması ve ifası: hizmetin sağlanması, iş takibi ve raporlama',
      'Meşru menfaat: saha operasyonunun denetimi, iş güvenliği ve kalite takibi',
      'Hukuki yükümlülük: yasal saklama ve bildirim yükümlülükleri',
    ],
  },
  {
    baslik: '8. Saklama ve Güvenlik',
    paragraflar: [
      'Veriler, Supabase altyapısı üzerinde Avrupa Birliği (İrlanda) bölgesindeki ' +
      'sunucularda barındırılır. Aktarım TLS ile şifrelenir.',
      'Parolalar geri döndürülemez biçimde şifrelenerek (hash) saklanır. ZNA Teknoloji ' +
      'personeli dâhil hiç kimse bir kullanıcının parolasını görüntüleyemez.',
      'Veriye erişim, satır düzeyinde yetkilendirme (RLS) ile sınırlandırılır: her ' +
      'kullanıcı yalnız yetkili olduğu kayıtları görür. Veriler, yasal saklama süreleri ' +
      'boyunca veya silme talebine kadar tutulur.',
    ],
  },
  {
    baslik: '9. Üçüncü Taraflarla Paylaşım',
    paragraflar: [
      'Verileriniz pazarlama amacıyla hiçbir üçüncü tarafla paylaşılmaz ve satılmaz. ' +
      'Hizmetin çalışması için yalnız aşağıdaki altyapı sağlayıcıları kullanılır:',
    ],
    maddeler: [
      'Supabase — veri barındırma ve kimlik doğrulama (AB/İrlanda)',
      'Apple Push Notification service ve Google Firebase Cloud Messaging — bildirim iletimi',
      'Expo — uygulama sürüm dağıtımı ve güncellemeler',
      'Sentry — uygulama hata kayıtları (teşhis amaçlı teknik veriler)',
    ],
    sonrasi:
      'Ayrıca yasal zorunluluk hâlinde yetkili resmî makamlarla paylaşım yapılabilir.',
  },
  {
    baslik: '10. Haklarınız (KVKK m.11 ve GDPR)',
    maddeler: [
      'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
      'İşlenen veriler hakkında bilgi talep etme',
      'Verilerin düzeltilmesini veya silinmesini isteme',
      'Verilerin aktarıldığı üçüncü kişileri bilme',
      'Otomatik sistemlerle yapılan analiz sonucuna itiraz etme',
      'Kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme',
    ],
    sonrasi:
      `Taleplerinizi ${DESTEK_EPOSTA} adresine iletebilirsiniz; başvurular en geç 30 gün ` +
      'içinde sonuçlandırılır.',
  },
  {
    baslik: '11. Hesabın Silinmesi',
    paragraflar: [
      'Hesabınızı uygulama içinden silebilirsiniz: Profil → Hesabı Sil. Silme sonrasında ' +
      'kimlik ve iletişim bilgileriniz anonimleştirilir ve hesabınızla giriş yapılamaz.',
      'İş sürekliliği ve yasal saklama yükümlülüğü nedeniyle, tamamlanmış servis, görev ve ' +
      'stok kayıtlarının kendisi silinmez; bu kayıtlardaki kişi bağlantısı anonim hâle getirilir.',
    ],
  },
  {
    baslik: '12. Çocukların Gizliliği',
    paragraflar: [
      'Uygulama kurumsal kullanım içindir ve 18 yaş altındaki kullanıcılara yönelik değildir. ' +
      'Bilerek 18 yaş altından veri toplanmaz.',
    ],
  },
  {
    baslik: '13. Değişiklikler',
    paragraflar: [
      'Bu politika gerektiğinde güncellenir. Önemli değişikliklerde uygulama içi bildirim yapılır ' +
      've bu sayfadaki güncelleme tarihi değiştirilir.',
    ],
  },
]

export default function Gizlilik() {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <ShieldCheck size={22} strokeWidth={1.75} style={{ color: 'var(--accent-primary)' }} />
          <h1 style={{ font: '700 21px/1.35 var(--font-sans)', color: 'var(--text-primary)', margin: 0 }}>
            ZNA CRM — Gizlilik Politikası
          </h1>
        </div>
        <p style={{ font: 'italic 400 12px/18px var(--font-sans)', color: 'var(--text-tertiary)', margin: '0 0 22px' }}>
          Son güncelleme: {GIZLILIK_GUNCELLEME}
        </p>

        {BOLUMLER.map((b) => (
          <section key={b.baslik} style={{ marginBottom: 22 }}>
            <h2 style={{
              font: '700 15px/1.4 var(--font-sans)', color: 'var(--text-primary)',
              margin: '0 0 8px', paddingTop: 14, borderTop: '1px solid var(--border-default)',
            }}>
              {b.baslik}
            </h2>
            {(b.paragraflar || []).map((p) => (
              <p key={p} style={{ font: '400 13.5px/1.75 var(--font-sans)', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                {p}
              </p>
            ))}
            {b.maddeler && (
              <ul style={{ margin: '0 0 10px', paddingLeft: 20 }}>
                {b.maddeler.map((m) => (
                  <li key={m} style={{ font: '400 13.5px/1.75 var(--font-sans)', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {m}
                  </li>
                ))}
              </ul>
            )}
            {b.sonrasi && (
              <p style={{ font: '400 13.5px/1.75 var(--font-sans)', color: 'var(--text-secondary)', margin: 0 }}>
                {b.sonrasi}
              </p>
            )}
          </section>
        ))}

        <div style={{
          marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', gap: 8,
          font: '500 13px/18px var(--font-sans)', color: 'var(--text-secondary)',
        }}>
          <Mail size={15} strokeWidth={1.75} />
          <span>14. İletişim —&nbsp;</span>
          <a href={`mailto:${DESTEK_EPOSTA}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
            {DESTEK_EPOSTA}
          </a>
        </div>
      </Card>
    </div>
  )
}
