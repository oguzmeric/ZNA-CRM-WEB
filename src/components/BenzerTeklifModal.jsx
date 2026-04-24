import { useNavigate } from 'react-router-dom'

/**
 * Benzer teklif uyarı modalı
 *
 * Props:
 *   acik           - boolean
 *   benzerler      - Array<{ teklif, skor, detay }>
 *   onIptal        - () => void (kaydetmeyi iptal et)
 *   onDevam        - () => void (yine de kaydet)
 *   mevcutTeklifId - (opsiyonel) düzenlenen teklifin ID'si
 *   taslakTeklif   - (opsiyonel) yeni teklifin form verisi (henüz kaydedilmedi)
 */
export default function BenzerTeklifModal({ acik, benzerler, onIptal, onDevam, mevcutTeklifId, taslakTeklif }) {
  const navigate = useNavigate()
  if (!acik) return null

  const enYuksek = benzerler[0]
  const skor = enYuksek?.skor || 0
  const seviye = skor >= 85 ? 'kritik' : skor >= 70 ? 'yuksek' : 'orta'

  const seviyeMap = {
    kritik: { bg: 'bg-red-50', border: 'border-red-200', ikon: '🚨', baslik: 'ÇOK BENZER TEKLİF BULUNDU!', renk: '#ef4444' },
    yuksek: { bg: 'bg-amber-50', border: 'border-amber-200', ikon: '⚠️', baslik: 'BENZER TEKLİF BULUNDU', renk: '#f59e0b' },
    orta:   { bg: 'bg-blue-50', border: 'border-blue-200', ikon: 'ℹ️', baslik: 'Benzer bir teklif var', renk: '#3b82f6' },
  }
  const s = seviyeMap[seviye]

  const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
  const tarihFmt = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return isNaN(d) ? '—' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onIptal}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className={`${s.bg} ${s.border} border-b px-6 py-4 flex items-center gap-3`}>
          <span className="text-3xl">{s.ikon}</span>
          <div className="flex-1">
            <h3 className="font-bold text-lg" style={{ color: s.renk }}>{s.baslik}</h3>
            <p className="text-xs text-gray-600 mt-0.5">
              Bu teklif, daha önce oluşturulmuş <strong>{benzerler.length}</strong> teklife benziyor. Devam etmeden önce kontrol edin.
            </p>
          </div>
        </div>

        {/* Benzer Teklifler Listesi */}
        <div className="overflow-y-auto max-h-[55vh] p-6 pt-4">
          <div className="space-y-3">
            {benzerler.map((b, idx) => {
              const renk = b.skor >= 85 ? '#ef4444' : b.skor >= 70 ? '#f59e0b' : '#3b82f6'
              return (
                <div
                  key={b.teklif.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {b.teklif.teklifNo || `#${b.teklif.id}`}
                        </span>
                        <span className="text-xs text-gray-400">{tarihFmt(b.teklif.tarih)}</span>
                        {idx === 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            EN BENZER
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-800 truncate">
                        🏢 {b.teklif.firmaAdi || 'Bilinmiyor'}
                      </p>
                      {b.teklif.konu && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          📋 {b.teklif.konu}
                        </p>
                      )}
                    </div>

                    {/* Skor rozeti */}
                    <div className="flex-shrink-0 text-center">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-md"
                        style={{ background: renk }}
                      >
                        %{b.skor}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">BENZERLİK</p>
                    </div>
                  </div>

                  {/* Detay kırılımı */}
                  <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-100">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Ürün</p>
                      <p className="text-sm font-bold" style={{ color: b.detay.urun >= 70 ? '#ef4444' : '#6b7280' }}>
                        %{b.detay.urun}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {b.detay.ortakUrunSayisi}/{b.detay.yeniUrunSayisi}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Konu</p>
                      <p className="text-sm font-bold text-gray-700">%{b.detay.konu}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Tutar</p>
                      <p className="text-sm font-bold text-gray-700">%{b.detay.tutar}</p>
                      <p className="text-[10px] text-gray-400">{fmt(b.teklif.genelToplam)} ₺</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Tarih</p>
                      <p className="text-sm font-bold text-gray-700">%{b.detay.tarih}</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-3">
                    {(mevcutTeklifId || taslakTeklif) && (
                      <button
                        onClick={() => {
                          if (mevcutTeklifId) {
                            navigate(`/teklifler/kiyasla/${mevcutTeklifId}/${b.teklif.id}`)
                          } else {
                            // Taslak teklif → sessionStorage'a kaydet ve taslak modunda aç
                            sessionStorage.setItem('kiyasla_taslak', JSON.stringify(taslakTeklif))
                            navigate(`/teklifler/kiyasla/taslak/${b.teklif.id}`)
                          }
                          onIptal()
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition font-medium"
                      >
                        📊 Yan Yana Kıyasla
                      </button>
                    )}
                    <button
                      onClick={() => {
                        navigate(`/teklifler/${b.teklif.id}`)
                        onIptal()
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition font-medium"
                    >
                      📋 Eski Teklife Git →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Alt butonlar */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 italic">
            💡 Aynı proje farklı firmalar üzerinden gelebilir — dikkatle kontrol edin.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onIptal}
              className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition font-medium"
            >
              İptal Et
            </button>
            <button
              onClick={onDevam}
              className="text-sm px-5 py-2 rounded-lg text-white font-medium transition"
              style={{ background: s.renk }}
            >
              ⚠️ Yine de Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
