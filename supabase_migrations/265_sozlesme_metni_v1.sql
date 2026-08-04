-- 265 — Kullanıcı Sözleşmesi metni v1.0 (04.08)
--
-- ⚠️ HUKUKÇU İNCELEMESİ GEREKİR. Bu metin sistemin GERÇEKTE ne yaptığını
-- doğru anlatır (veri erişim izleme, konum takibi, loglama), ancak iş
-- hukuku ve KVKK yükümlülükleri açısından avukat teyidi alınmalıdır.
--
-- Metnin sistemle bire bir uyumlu olması özellikle önemlidir: beyan
-- edilmeyen bir izleme hukuka aykırı, yapılmayan bir izlemenin beyanı ise
-- gereksiz endişe yaratır. Aşağıdaki maddeler canlı sistemdeki mig 259/260
-- (veri erişim izleme), 261/262 (araç rota), mesai GPS ve araç kamera
-- özellikleriyle eşleştirilerek yazılmıştır.

begin;

insert into public.sozlesme_metinleri (versiyon, baslik, icerik, yururluk_tarihi, aktif)
values (
  '1.0',
  'ZNA Teknoloji CRM — Kullanıcı Sözleşmesi ve Veri Gizliliği Taahhütnamesi',
  $METIN$
# ZNA Teknoloji CRM — Kullanıcı Sözleşmesi ve Veri Gizliliği Taahhütnamesi

**Sürüm:** 1.0   **Yürürlük tarihi:** 04.08.2026

---

## 1. Taraflar ve Konu

Bu sözleşme, **ZNA Teknoloji** (bundan sonra "Şirket") tarafından işletilen CRM ve saha yönetim sistemine (bundan sonra "Sistem") erişim yetkisi verilen çalışanlar (bundan sonra "Kullanıcı") ile Şirket arasında düzenlenmiştir.

Sözleşmenin konusu; Sistem'in kullanım kuralları, Kullanıcı'nın erişim sağladığı verilerin gizliliği, korunması ve Sistem kullanımının denetlenmesine ilişkin karşılıklı hak ve yükümlülüklerdir.

Kullanıcı, Sistem'e giriş yaparak bu sözleşmeyi okuduğunu, anladığını ve kabul ettiğini beyan eder.

---

## 2. Tanımlar

- **Sistem:** ZNA Teknoloji CRM web uygulaması (talep.znateknoloji.com), mobil uygulaması ve bunlara bağlı tüm modüller.
- **Şirket Verisi:** Sistem üzerinde bulunan; müşteri bilgileri, cari hesaplar, teklifler, fiyat listeleri, maliyet ve kâr bilgileri, sözleşmeler, stok ve envanter kayıtları, servis ve keşif kayıtları, personel bilgileri, tedarikçi bilgileri ve bunlardan üretilen her türlü rapor ve çıktı.
- **Kişisel Veri:** 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında, kimliği belirli veya belirlenebilir gerçek kişiye ilişkin her türlü bilgi.
- **Ticari Sır:** Şirket'in müşteri portföyü, fiyatlandırma politikası, maliyet yapısı, tedarikçi koşulları ve iş yöntemleri dâhil, üçüncü kişilerce bilinmemesi Şirket lehine olan her türlü bilgi.

---

## 3. Hesap ve Erişim Güvenliği

**3.1.** Kullanıcı'ya tanımlanan hesap **kişiye özeldir ve devredilemez.**

**3.2.** Kullanıcı, şifresini hiç kimseyle — çalışma arkadaşı, yönetici veya üçüncü kişi ayrımı olmaksızın — **paylaşamaz.** Şifrenin başkası tarafından bilinmesi hâlinde Kullanıcı derhâl şifresini değiştirmek ve durumu yöneticisine bildirmekle yükümlüdür.

**3.3.** Kullanıcı hesabı ile gerçekleştirilen tüm işlemler, aksi ispat edilmedikçe **Kullanıcı tarafından yapılmış sayılır.** Hesabın başkasına kullandırılması hâlinde doğacak zarardan Kullanıcı sorumludur.

**3.4.** Kullanıcı, Sistem'e eriştiği cihazın (bilgisayar, telefon, tablet) güvenliğinden sorumludur. Ortak kullanılan veya güvenliği sağlanmamış cihazlarda oturum açık bırakılamaz.

**3.5.** Kullanıcı, Sistem'e yalnızca **görevinin gerektirdiği ölçüde** erişir. Yetkisi dâhilinde olsa dahi, işiyle ilgisi olmayan kayıtları merak saikiyle görüntülemek bu sözleşmenin ihlalidir.

---

## 4. Veri Gizliliği ve Sır Saklama Yükümlülüğü

**4.1.** Kullanıcı'nın Sistem üzerinden eriştiği **tüm Şirket Verisi gizlidir.**

**4.2.** Kullanıcı, Şirket Verisi'ni;
- üçüncü kişilere **aktaramaz**, göstermez, anlatmaz,
- kişisel e-posta, bulut depolama, mesajlaşma uygulaması veya taşınabilir bellek gibi **Şirket dışı ortamlara taşıyamaz**,
- kendi adına veya başkası hesabına **kullanamaz**,
- rakip firmalarla veya başka kurumlarla **paylaşamaz**.

**4.3.** Bu yükümlülük, **iş ilişkisi sona erdikten sonra da süresiz olarak devam eder.** İşten ayrılma hâlinde Kullanıcı, elindeki tüm Şirket Verisi'ni (dijital kopyalar, çıktılar, notlar dâhil) iade etmek veya imha etmekle yükümlüdür.

**4.4.** Müşteri bilgileri aynı zamanda **Kişisel Veri** niteliğindedir. Kullanıcı, bu verileri yalnızca hizmetin ifası amacıyla, KVKK'ya uygun şekilde işler; amacı dışında kullanamaz ve yetkisiz kişilere açıklayamaz.

---

## 5. Veri Kopyalama ve Toplu Çıkarma Yasağı

**5.1.** Kullanıcı, Sistem'deki verileri **toplu olarak çekemez, kopyalayamaz veya dışarı aktaramaz.** Bu yasak özellikle şunları kapsar:
- Müşteri listesi, cari liste, stok listesi veya teklif arşivinin **tamamının veya önemli bir bölümünün** kopyalanması,
- Toplu ekran görüntüsü alınması veya fotoğraflanması,
- Verilerin elle veya otomatik yöntemle başka bir dosyaya/sisteme aktarılması.

**5.2.** Kullanıcı, Sistem'e **uygulama arayüzü dışından erişim sağlayamaz.** Bu kapsamda; oturum bilgisinin (token) kopyalanarak harici bir programda kullanılması, veri çekmek amacıyla **komut dosyası (script), robot, otomasyon aracı veya benzeri yazılım** çalıştırılması kesinlikle yasaktır.

**5.3.** Sistem'in güvenlik önlemlerini aşmaya, atlatmaya veya devre dışı bırakmaya yönelik her türlü girişim yasaktır.

**5.4.** İşin gereği olan raporlama ve dışa aktarma işlemleri bu yasağın dışındadır; ancak bu çıktılar da Şirket Verisi'dir ve 4. maddedeki gizlilik yükümlülüğüne tabidir.

---

## 6. Sistem Kullanımının Kaydedilmesi ve İzlenmesi

**6.1.** Kullanıcı, Sistem üzerindeki işlemlerinin **kayıt altına alındığını bilir ve kabul eder.** Kaydedilen bilgiler şunlardır:
- giriş/çıkış zamanları ve oturum bilgileri,
- görüntülenen, oluşturulan, değiştirilen ve silinen kayıtlar,
- erişilen veri miktarı ve erişim sıklığı,
- erişimin hangi uygulama üzerinden yapıldığı.

**6.2.** Şirket, olağan dışı veri erişimini tespit etmek amacıyla **otomatik izleme** uygular. Bir hesabın olağan kullanım düzeyinin belirgin biçimde üzerinde veri çektiğinin tespiti hâlinde yönetime bildirim gider.

**6.3.** Olağan dışı erişim tespit edilen hesap, inceleme tamamlanıncaya kadar **askıya alınabilir.** Askıya alma, tek başına bir suçlama anlamına gelmez; Kullanıcı'ya durum bildirilir ve açıklama imkânı tanınır.

**6.4.** Bu kayıtlar; yalnızca bilgi güvenliğinin sağlanması, hukuki yükümlülüklerin yerine getirilmesi ve olası ihlallerin soruşturulması amacıyla işlenir. Yetkisiz kişilerin erişimine kapalıdır.

---

## 7. Konum ve Araç Takibi (Yalnızca Görevle İlgili Kullanıcılar)

Bu madde, şirket aracı kullanan ve/veya sahada görev yapan Kullanıcı'lar bakımından uygulanır.

**7.1. Mesai konum kaydı.** Mesai başlangıç ve bitiş işlemlerinde, işlemin şirket lokasyonunda yapıldığının doğrulanması amacıyla **anlık konum bilgisi** alınır. Bu kayıt yalnızca mesai işleminin yapıldığı ana ilişkindir; gün boyu konum takibi anlamına gelmez.

**7.2. Araç takibi.** Şirket araçlarında, araç güvenliği ve filo yönetimi amacıyla **konum takip cihazı** bulunur. Bu cihazlar üzerinden; aracın anlık konumu, hızı, kontak durumu, güzergâhı ve duraklama noktaları kaydedilir.

**7.3.** Araç takip verileri **araca ilişkindir**, kişiye değil. Ancak aracın belirli bir Kullanıcı'ya tahsis edildiği hâllerde bu veriler dolaylı olarak kişisel veri niteliği kazanabilir; bu nedenle aynı gizlilik ve amaçla sınırlılık ilkelerine tabidir.

**7.4.** Araç takip kayıtları; yalnızca **filo yönetimi, araç güvenliği, iş planlaması ve müşteriye verilen hizmetin doğrulanması** amaçlarıyla kullanılır. Bu veriler, yalnızca yönetim ve araç takip yetkisi tanımlanmış personel tarafından görüntülenebilir.

**7.5. Araç içi kamera.** Bazı araçlarda güvenlik amaçlı kamera bulunur. Kamera görüntüleri yalnızca olay incelemesi ve güvenlik amacıyla, yetkili personel tarafından izlenebilir.

**7.6.** Araç takibi, **aracın Şirket'e ait olduğu ve iş amacıyla kullanıldığı süreyle sınırlıdır.** Şirket, Kullanıcı'nın özel yaşamına ilişkin konum takibi yapmaz.

---

## 8. Kişisel Verilerin Korunması (KVKK Aydınlatması)

**8.1. Veri sorumlusu:** ZNA Teknoloji.

**8.2. İşlenen veriler:** Kimlik ve iletişim bilgileri, özlük bilgileri, Sistem işlem kayıtları (log), mesai ve konum kayıtları, araç kullanım kayıtları, kamera görüntüleri.

**8.3. İşleme amaçları:** İş sözleşmesinin ifası, iş sağlığı ve güvenliği, bilgi güvenliğinin sağlanması, iş planlaması ve verimlilik yönetimi, hukuki yükümlülüklerin yerine getirilmesi.

**8.4. Hukuki sebepler:** KVKK m.5/2-(c) sözleşmenin ifası, m.5/2-(ç) hukuki yükümlülük, m.5/2-(f) veri sorumlusunun meşru menfaati.

**8.5. Saklama süreleri:** Veriler, işleme amacının gerektirdiği süre ve ilgili mevzuattaki zamanaşımı süreleri boyunca saklanır; sürenin sonunda silinir veya anonim hâle getirilir.

**8.6. Haklarınız:** Kullanıcı, KVKK m.11 uyarınca kendisine ait verilere erişme, düzeltilmesini veya silinmesini isteme, işlemeye itiraz etme haklarına sahiptir. Başvurular Şirket'in insan kaynakları birimine yapılır.

---

## 9. Fikri Mülkiyet

**9.1.** Sistem'in yazılımı, tasarımı, veri tabanı yapısı ve içeriği Şirket'e aittir.

**9.2.** Kullanıcı; Sistem'i kopyalayamaz, kaynak koduna erişmeye çalışamaz, tersine mühendislik yapamaz, benzerini üretmek amacıyla kullanamaz.

**9.3.** Kullanıcı'nın görevi kapsamında Sistem'e girdiği veriler Şirket'e aittir.

---

## 10. İhlal ve Yaptırımlar

**10.1.** Bu sözleşmenin ihlali hâlinde Şirket, ihlalin niteliğine göre şu yollara başvurabilir:
- hesabın askıya alınması veya kapatılması,
- disiplin işlemi uygulanması,
- 4857 sayılı İş Kanunu m.25/II hükümleri çerçevesinde **iş sözleşmesinin haklı nedenle feshi**,
- doğan zararın tazmini talebi,
- suç teşkil eden fiiller bakımından **cezai şikâyet.**

**10.2.** Kullanıcı, aşağıdaki fiillerin ceza hukuku bakımından suç oluşturabileceğini bilir:
- Ticari sır niteliğindeki bilgilerin yetkisiz açıklanması — **TCK m.239**,
- Kişisel verilerin hukuka aykırı olarak verilmesi veya ele geçirilmesi — **TCK m.136**,
- Bilişim sistemine hukuka aykırı erişim ve sistemi engelleme — **TCK m.243 ve m.244**.

**10.3.** Şirket'in bu sözleşmeden doğan haklarını kullanmaması, o haktan feragat ettiği anlamına gelmez.

---

## 11. Sözleşmenin Süresi ve Değişiklikler

**11.1.** Bu sözleşme, Kullanıcı'nın onay verdiği tarihte yürürlüğe girer ve Sistem erişimi devam ettiği sürece geçerlidir.

**11.2.** 4. maddedeki gizlilik yükümlülüğü ile 9. maddedeki fikri mülkiyet hükümleri, **iş ilişkisi sona erdikten sonra da yürürlükte kalır.**

**11.3.** Şirket, sözleşmede değişiklik yapabilir. Yeni sürüm yayımlandığında Kullanıcı'dan **yeniden onay** istenir; onay verilmediği sürece Sistem'e erişim sağlanamaz.

---

## 12. Uyuşmazlıkların Çözümü

Bu sözleşmeden doğan uyuşmazlıklarda **Türk hukuku** uygulanır ve **İstanbul mahkemeleri ile icra daireleri** yetkilidir.

---

## 13. Beyan ve Kabul

Kullanıcı; bu sözleşmeyi okuduğunu, maddelerini anladığını, özellikle

- **veri gizliliği ve sır saklama** (madde 4),
- **toplu veri çıkarma yasağı** (madde 5),
- **sistem kullanımının kaydedilmesi ve olağan dışı erişimde hesabın askıya alınabilmesi** (madde 6),
- **araç ve mesai konum kayıtları** (madde 7)

hükümlerini bilerek kabul ettiğini; aksi davranışın iş sözleşmesinin feshi ve hukuki/cezai sorumluluk doğurabileceğini bildiğini **kabul, beyan ve taahhüt eder.**
$METIN$,
  date '2026-08-04',
  true
)
on conflict (versiyon) do update
  set baslik = excluded.baslik,
      icerik = excluded.icerik,
      yururluk_tarihi = excluded.yururluk_tarihi,
      aktif = excluded.aktif;

commit;

select versiyon, baslik, yururluk_tarihi, aktif, length(icerik) as metin_uzunluk
from public.sozlesme_metinleri;
