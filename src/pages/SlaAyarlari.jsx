import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import {
  slaKurallariGetir, slaKuralEkle, slaKuralGuncelle, slaKuralSil,
  SLA_MODULLER, SLA_DURUMLAR,
} from '../services/slaService'
import CustomSelect from '../components/CustomSelect'

const bosForm = {
  modul: 'kargo',
  olayIsim: '',
  baslangicDurum: '',
  bitisDurum: '',
  sureSaat: 24,
  aciklama: '',
  aktif: true,
}

function SlaAyarlari() {
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [kurallar, setKurallar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [form, setForm] = useState(null)   // null = kapalı, obje = açık
  const [duzenleId, setDuzenleId] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    slaKurallariGetir().then(data => {
      setKurallar(data)
      setYukleniyor(false)
    })
  }, [])

  const formAc = () => {
    setForm({ ...bosForm })
    setDuzenleId(null)
  }

  const duzenleAc = (k) => {
    setForm({
      modul: k.modul,
      olayIsim: k.olayIsim,
      baslangicDurum: k.baslangicDurum || '',
      bitisDurum: k.bitisDurum,
      sureSaat: k.sureSaat,
      aciklama: k.aciklama || '',
      aktif: k.aktif,
    })
    setDuzenleId(k.id)
  }

  const kaydet = async () => {
    if (!form.olayIsim?.trim()) { toast.error('Olay adı zorunludur.'); return }
    if (!form.bitisDurum) { toast.error('Bitiş durumu zorunludur.'); return }
    if (!form.sureSaat || form.sureSaat <= 0) { toast.error('Süre 0\'dan büyük olmalı.'); return }

    setKaydediliyor(true)
    try {
      // Olay kodunu otomatik oluştur
      const olay = `olusturma_to_${form.bitisDurum}`
      const veri = {
        ...form,
        olay,
        baslangicDurum: form.baslangicDurum || null,
        olayIsim: form.olayIsim.trim(),
        aciklama: form.aciklama?.trim() || null,
        sureSaat: Number(form.sureSaat),
      }

      if (duzenleId) {
        const guncel = await slaKuralGuncelle(duzenleId, veri)
        setKurallar(prev => prev.map(k => k.id === duzenleId ? guncel : k))
        toast.success('SLA kuralı güncellendi.')
      } else {
        const yeni = await slaKuralEkle(veri)
        setKurallar(prev => [...prev, yeni])
        toast.success('SLA kuralı eklendi.')
      }
      setForm(null)
      setDuzenleId(null)
    } catch (e) {
      toast.error(e?.message || 'Kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  const sil = async (id) => {
    const onay = await confirm({
      baslik: 'SLA Kuralını Sil',
      mesaj: 'Bu kural silinecek. Performans raporlarında bu iş tipi artık takip edilmeyecek.',
      onayMetin: 'Evet, Sil',
      iptalMetin: 'Vazgeç',
      tip: 'tehlikeli',
    })
    if (!onay) return
    await slaKuralSil(id)
    setKurallar(prev => prev.filter(k => k.id !== id))
    toast.success('Kural silindi.')
  }

  const aktifGuncelle = async (k) => {
    const yeni = await slaKuralGuncelle(k.id, { ...k, aktif: !k.aktif })
    setKurallar(prev => prev.map(x => x.id === k.id ? yeni : x))
  }

  const iptal = () => {
    setForm(null)
    setDuzenleId(null)
  }

  if (yukleniyor) return <div className="p-6 text-center text-gray-400">Yükleniyor...</div>

  // Modüle göre grupla
  const gruplanmis = SLA_MODULLER.map(m => ({
    ...m,
    kurallar: kurallar.filter(k => k.modul === m.id),
  }))

  const modulBulunan = gruplanmis.filter(g => g.kurallar.length > 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">⏱️ SLA Ayarları</h2>
          <p className="text-sm text-gray-400 mt-1">
            Her iş tipi için süre limitleri — personel performans takibinde kullanılır
          </p>
        </div>
        {!form && (
          <button
            onClick={formAc}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            + Yeni SLA Kuralı
          </button>
        )}
      </div>

      {/* Form */}
      {form && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-blue-100">
          <h3 className="font-medium text-gray-800 mb-4">
            {duzenleId ? 'Kuralı Düzenle' : 'Yeni SLA Kuralı'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Modül *</label>
              <CustomSelect
                value={form.modul}
                onChange={e => setForm({ ...form, modul: e.target.value, bitisDurum: '' })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SLA_MODULLER.map(m => (
                  <option key={m.id} value={m.id}>{m.ikon} {m.isim}</option>
                ))}
              </CustomSelect>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Olay Adı (UI'da görünen) *</label>
              <input
                type="text"
                value={form.olayIsim}
                onChange={e => setForm({ ...form, olayIsim: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Örn: Kargoya Verme Süresi"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Hedef Durum *</label>
              <CustomSelect
                value={form.bitisDurum}
                onChange={e => setForm({ ...form, bitisDurum: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Durum seç...</option>
                {(SLA_DURUMLAR[form.modul] || []).map(d => (
                  <option key={d.id} value={d.id}>{d.isim}</option>
                ))}
              </CustomSelect>
              <p className="text-xs text-gray-400 mt-1">İşin hangi duruma gelmesi gerekir?</p>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Süre (saat) *</label>
              <input
                type="number"
                min="1"
                value={form.sureSaat}
                onChange={e => setForm({ ...form, sureSaat: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                {form.sureSaat ? `= ${(form.sureSaat / 24).toFixed(1)} gün` : ''}
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-gray-600 mb-1 block">Açıklama</label>
              <input
                type="text"
                value={form.aciklama}
                onChange={e => setForm({ ...form, aciklama: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Neden ve nasıl ölçülür..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.aktif}
                  onChange={e => setForm({ ...form, aktif: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span className="text-sm text-gray-700">Aktif — pasif yaparsan performans hesaplamasında dahil edilmez</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={kaydet}
              disabled={kaydediliyor}
              className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {kaydediliyor ? 'Kaydediliyor...' : (duzenleId ? 'Güncelle' : 'Ekle')}
            </button>
            <button
              onClick={iptal}
              className="text-sm px-5 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      {modulBulunan.length === 0 && !form && (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400 border border-gray-100">
          <p className="text-4xl mb-3">⏱️</p>
          <p className="text-sm mb-4">Henüz SLA kuralı tanımlanmamış.</p>
          <button
            onClick={formAc}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            + İlk Kuralı Ekle
          </button>
        </div>
      )}

      {modulBulunan.map(grup => (
        <div key={grup.id} className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <span className="text-lg">{grup.ikon}</span>
              {grup.isim}
              <span className="text-xs font-normal text-gray-400 ml-2">({grup.kurallar.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {grup.kurallar.map(k => (
              <div key={k.id} className={`flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition ${!k.aktif ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {k.olayIsim}
                    {!k.aktif && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Pasif</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                      {k.sureSaat} saat ({(k.sureSaat / 24).toFixed(1)} gün)
                    </span>
                    <span className="text-xs text-gray-400">→ Hedef durum: <strong>{k.bitisDurum}</strong></span>
                  </div>
                  {k.aciklama && <p className="text-xs text-gray-400 italic mt-1">{k.aciklama}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => aktifGuncelle(k)}
                    className={`text-xs px-2 py-1 rounded-lg transition ${k.aktif ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
                    title={k.aktif ? 'Aktif' : 'Pasif'}
                  >
                    {k.aktif ? '🟢' : '⚪'}
                  </button>
                  <button
                    onClick={() => duzenleAc(k)}
                    className="text-xs px-3 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => sil(k.id)}
                    className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SlaAyarlari
