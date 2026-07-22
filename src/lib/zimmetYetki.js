// Demirbaş / envanter (zimmet) yetkisi — TEK KAYNAK.
//
// Eskiden aynı isim regex'i İKİ yerde ayrı ayrı duruyordu (App.jsx /skor guard +
// ZimmetPanel). İki sorun vardı: (1) TR'de `\b` güvenilmez — "OĞUZ"daki Ğ
// non-word sayılır (bkz. reference_turkce_i_tuzagi dersi), (2) yeni kişiye yetki
// vermek iki dosya değiştirmeyi gerektiriyordu. Artık ID listesi — isimden bağımsız.

// Yönetim: Ali Uğur Aktepe (1), Oğuz Meriç (2), Ferdi Kalkan (33)
export const YONETIM_IDLER = [1, 2, 33]

// Depo sorumluları: Salih Çakmaklı (34), Mahmut Sari (45).
// Demirbaş/envanter işlerler ama KENDİLERİ DE zimmet alabilir (yönetim değiller).
export const DEPO_SORUMLU_IDLER = [34, 45]

const idIcinde = (kullanici, liste) => liste.includes(Number(kullanici?.id))

/** /skor sayfası erişimi + demirbaş ekle/iade yetkisi */
export const demirbasIsleyebilirMi = (kullanici) =>
  idIcinde(kullanici, YONETIM_IDLER) || idIcinde(kullanici, DEPO_SORUMLU_IDLER)

/** Saf yönetim kontrolü — zimmet ALICI listesinden yalnız bunlar çıkarılır */
export const yonetimMi = (kullanici) => idIcinde(kullanici, YONETIM_IDLER)
