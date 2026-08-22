// Yazdır sayfalarının "Kapat" düğmesi (22.08 denetimi).
// Bu sayfalar window.open ile YENİ SEKMEDE açılır; sekmeyi açan pencere
// duruyorsa sekme kapatılır. Yer imi / elle yazılan / paylaşılan linkle
// gelindiğinde tarayıcı script'le açılmamış sekmeyi kapatmayı REDDEDER —
// düğme ölü kalıyor, sayfa MainLayout dışında olduğu için menü de yoktu.
// O durumda ilgili kayda/listeye dönülür (DemirbasTutanakYazdir deseni).
export const yazdirKapat = (fallbackYol) => {
  if (typeof window === 'undefined') return
  if (window.opener && !window.opener.closed) { window.close(); return }
  window.location.assign(fallbackYol)
}
