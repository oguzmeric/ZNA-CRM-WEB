// Akıllı "Geri" — detay sayfalarındaki geri butonu GELDİĞİN yere dönmeli.
//
// Eskiden butonlar sabit listeye gidiyordu (ör. SiparisDetay → /siparisler):
// Müşteri Detayı'ndaki Sipariş Özeti'nden gelen kullanıcı "Geri" ile müşteriye
// dönemiyordu (06.08). Tarayıcı geçmişinde önceki sayfa varsa oraya, yoksa
// (doğrudan URL / yeni sekme) modülün listesine düşer.
//
// React Router v6 geçmiş konumunu history.state.idx'te tutar: 0 = oturumun
// ilk sayfası (geri gidecek yer yok). window.history.length güvenilir değil.
export const geriDon = (navigate, fallback) => {
  const idx = window.history.state?.idx
  if (typeof idx === 'number' && idx > 0) navigate(-1)
  else navigate(fallback)
}
