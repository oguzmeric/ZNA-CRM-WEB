// Mesai kaydı ekleme / düzeltme / silme modalı (mig 291).
//
// Neden var: mesai_kayitlari'na yazan tek yol edge fonksiyonlarıydı; QR
// okutamayan personelin kaydını düzeltmek için geliştiriciye SQL yazdırılıyordu
// (Alp Aslan 13-15.08). Artık İK yetkilisi kendi düzeltiyor — SEBEP zorunlu,
// her işlem denetim defterine yazılıyor.
//
// ⚠️ Süre alanı YOK ve olmayacak: `sure_dakika`yı DB trigger'ı hesaplar
// (mig 281/290). Formda süre girilseydi iki kaynak olurdu.

import { useState, useMemo } from 'react'
import { AlertTriangle, Clock, Save, Trash2, X } from 'lucide-react'
import {
  Modal, Button, Input, Textarea, Label, Badge, TarihSaatSecici,
} from './ui'
import CustomSelect from './CustomSelect'
import { useToast } from '../context/ToastContext'
import {
  mesaiKaydiEkle, mesaiKaydiDuzelt, mesaiKaydiSil, isodanForm,
} from '../services/mesaiDuzeltmeService'

// Model kuralı (15.08): HAFTA SONU her saat fazla; hafta içi 19:00+ fazla.
// Sunucudaki mesai-giris ile aynı kural — formda ÖNERİ olarak uygulanır,
// yönetici elle değiştirebilir.
const FAZLA_ESIK_SAAT = 19
const haftaSonuMu = (girisForm) => {
  const g = /^(\d{4}-\d{2}-\d{2})/.exec(girisForm || '')
  if (!g) return false
  // Tarih string'i yerel gün olarak okunur; gün numarası 0=Paz, 6=Cmt.
  const d = new Date(`${g[1]}T12:00:00`)
  return !isNaN(d) && (d.getDay() === 0 || d.getDay() === 6)
}
const tipOner = (girisForm) => {
  if (haftaSonuMu(girisForm)) return 'fazla'
  const m = /T(\d{2}):/.exec(girisForm || '')
  return m && Number(m[1]) >= FAZLA_ESIK_SAAT ? 'fazla' : 'normal'
}

const sureMetni = (girisForm, cikisForm) => {
  if (!girisForm || !cikisForm) return null
  const g = new Date(girisForm), c = new Date(cikisForm)
  if (isNaN(g) || isNaN(c)) return null
  const dk = Math.floor((c - g) / 60000)
  if (dk < 0) return { hata: true, metin: 'Çıkış girişten önce olamaz' }
  return { hata: false, metin: `${Math.floor(dk / 60)} sa ${String(dk % 60).padStart(2, '0')} dk`, dk }
}

const BOS = { kullaniciId: '', giris: '', cikis: '', tip: 'normal', not: '', sebep: '' }

const ilkForm = (kayit) => (kayit?.id ? {
  kullaniciId: String(kayit.kullanici_id || ''),
  giris: isodanForm(kayit.giris_zamani),
  cikis: isodanForm(kayit.cikis_zamani),
  tip: kayit.tip || 'normal',
  not: kayit.not_ || '',
  sebep: '',   // sebep her açılışta boş — önceki gerekçe yeni düzeltmeye taşınmasın
} : { ...BOS })

// ⚠️ Bu bileşen MesaiRaporu'nda `key` ile mount edilir (kayıt id'si / 'yeni').
// Bu yüzden "prop değişti → state sıfırla" effect'i YOK: React bileşeni baştan
// kurar. Effect'le sıfırlamak zincirleme render üretiyordu.
export default function MesaiDuzeltModal({ open, onClose, kayit, personeller = [], onKaydedildi }) {
  const { toast } = useToast()
  const duzenleme = !!kayit?.id
  const [form, setForm] = useState(() => ilkForm(kayit))
  const [tipElle, setTipElle] = useState(false)   // yönetici tipe dokunduysa öneri ezmesin
  const [kaydediyor, setKaydediyor] = useState(false)
  const [silOnay, setSilOnay] = useState(false)

  // Tür TÜRETİLMİŞ değer: yönetici elle seçmediyse giriş saatinden okunur.
  // State'te tutup effect'le güncellemek iki kaynak yaratırdı.
  const tip = tipElle ? form.tip : tipOner(form.giris)

  const sure = useMemo(() => sureMetni(form.giris, form.cikis), [form.giris, form.cikis])
  const kisiAd = duzenleme
    ? (kayit.kullanicilar?.ad || personeller.find(p => String(p.id) === String(kayit.kullanici_id))?.ad || `#${kayit.kullanici_id}`)
    : ''

  const gecerli =
    !!form.sebep.trim() &&
    !!form.giris &&
    !sure?.hata &&
    (duzenleme || !!form.kullaniciId)

  const kaydet = async () => {
    if (!gecerli || kaydediyor) return
    setKaydediyor(true)
    try {
      if (duzenleme) {
        // Dokunulmamış saat alanı ham DB damgasıyla gider — saniye korunur,
        // yalnız not düzeltilince süre 1 dk kaymaz. (bkz. formdanIso)
        const korunmus = (formDeger, dbIso) =>
          dbIso && formDeger === isodanForm(dbIso) ? dbIso : formDeger
        await mesaiKaydiDuzelt({
          ...form,
          id: kayit.id,
          tip,
          giris: korunmus(form.giris, kayit.giris_zamani),
          cikis: korunmus(form.cikis, kayit.cikis_zamani),
        })
        toast.success('Mesai kaydı güncellendi.')
      } else {
        await mesaiKaydiEkle({ ...form, tip })
        toast.success('Mesai kaydı eklendi.')
      }
      onKaydedildi?.()
      onClose?.()
    } catch (e) {
      toast.error(e.message || 'İşlem tamamlanamadı.')
    } finally {
      setKaydediyor(false)
    }
  }

  const sil = async () => {
    if (!form.sebep.trim() || kaydediyor) return
    setKaydediyor(true)
    try {
      await mesaiKaydiSil({ id: kayit.id, sebep: form.sebep })
      toast.success('Mesai kaydı silindi.')
      onKaydedildi?.()
      onClose?.()
    } catch (e) {
      toast.error(e.message || 'Kayıt silinemedi.')
    } finally {
      setKaydediyor(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title={duzenleme ? `Mesai Kaydını Düzelt — ${kisiAd}` : 'Mesai Kaydı Ekle'}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
          <div>
            {duzenleme && !silOnay && (
              <Button
                variant="tertiary"
                onClick={() => setSilOnay(true)}
                iconLeft={<Trash2 size={14} strokeWidth={1.5} />}
                style={{ color: 'var(--danger)' }}
              >
                Kaydı Sil
              </Button>
            )}
            {duzenleme && silOnay && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Button variant="tertiary" onClick={() => setSilOnay(false)} iconLeft={<X size={14} strokeWidth={1.5} />}>
                  Vazgeç
                </Button>
                <Button
                  variant="danger"
                  onClick={sil}
                  disabled={!form.sebep.trim() || kaydediyor}
                  iconLeft={<Trash2 size={14} strokeWidth={1.5} />}
                >
                  {kaydediyor ? 'Siliniyor…' : 'Silmeyi Onayla'}
                </Button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={onClose} disabled={kaydediyor}>Vazgeç</Button>
            <Button
              variant="primary"
              onClick={kaydet}
              disabled={!gecerli || kaydediyor || silOnay}
              iconLeft={<Save size={14} strokeWidth={1.5} />}
            >
              {kaydediyor ? 'Kaydediliyor…' : duzenleme ? 'Değişikliği Kaydet' : 'Kaydı Ekle'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {silOnay && (
          <div style={{
            display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-md)',
            background: 'var(--danger-soft)', border: '1px solid var(--danger)',
          }}>
            <AlertTriangle size={16} strokeWidth={1.8} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
              Kayıt <strong>kalıcı olarak</strong> silinecek ve puantajdan düşecek. Silinen satırın
              tamamı denetim defterinde saklanır — gerekirse geri yazılabilir.
              <strong> Aşağıdaki sebep alanı zorunludur.</strong>
            </div>
          </div>
        )}

        {!duzenleme && (
          <div>
            <Label>Personel *</Label>
            <CustomSelect
              value={form.kullaniciId}
              onChange={e => setForm(p => ({ ...p, kullaniciId: e.target.value }))}
            >
              <option value="">Personel seçin…</option>
              {personeller.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
            </CustomSelect>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <div>
            <Label>Giriş (mesai başlangıcı) *</Label>
            {/* dakikaAdim=1: gerçek QR saatleri 08:28 gibi tek dakikalı — 5'lik
                adım düzeltmeyi yanlış saate yuvarlardı. */}
            <TarihSaatSecici
              value={form.giris}
              dakikaAdim={1}
              varsayilanSaat="08"
              varsayilanDakika="30"
              onChange={v => setForm(p => ({ ...p, giris: v }))}
            />
          </div>
          <div>
            <Label>Çıkış (boş = mesai hâlâ açık)</Label>
            <TarihSaatSecici
              value={form.cikis}
              dakikaAdim={1}
              varsayilanSaat="18"
              varsayilanDakika="00"
              onChange={v => setForm(p => ({ ...p, cikis: v }))}
            />
          </div>
        </div>

        {/* Süre önizlemesi — yönetici kaydetmeden ÖNCE puantaja ne gireceğini görsün */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
          borderRadius: 'var(--radius-md)',
          background: sure?.hata ? 'var(--danger-soft)' : 'var(--surface-sunken)',
          border: `1px solid ${sure?.hata ? 'var(--danger)' : 'var(--border-default)'}`,
        }}>
          <Clock size={15} strokeWidth={1.6} style={{ color: sure?.hata ? 'var(--danger)' : 'var(--text-tertiary)' }} />
          <span style={{ font: '400 12.5px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>
            {!form.giris ? 'Giriş saatini seçin.'
              : sure?.hata ? <strong style={{ color: 'var(--danger)' }}>{sure.metin}</strong>
              : sure ? <>Bu kayıt <strong className="tabular-nums">{sure.metin}</strong> olarak sayılacak.</>
              : <>Çıkış girilmedi — kayıt <strong>açık</strong> kalır, süresi işlemeye devam eder ve 18:30 kapanışına takılır.</>}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'start' }}>
          <div>
            <Label>Tür</Label>
            <CustomSelect
              value={tip}
              onChange={e => { setTipElle(true); setForm(p => ({ ...p, tip: e.target.value })) }}
            >
              <option value="normal">Normal</option>
              <option value="fazla">Fazla mesai</option>
            </CustomSelect>
            {!tipElle && form.giris && (
              <div style={{ marginTop: 4, font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                {haftaSonuMu(form.giris)
                  ? 'Hafta sonu — fazla mesai önerildi.'
                  : `Giriş saatinden önerildi (${FAZLA_ESIK_SAAT}:00 sonrası fazla).`}
              </div>
            )}
          </div>
          <div>
            <Label>Kayıt notu (personelin kaydında görünür)</Label>
            <Input
              value={form.not}
              onChange={e => setForm(p => ({ ...p, not: e.target.value }))}
              placeholder="örn. QR okutulamadı, saha girişi"
            />
          </div>
        </div>

        {/* SEBEP — RPC tarafında da zorunlu; burada boş bırakılırsa sunucu reddeder */}
        <div>
          <Label>
            Düzeltme sebebi *
            <Badge tone="beklemede" style={{ marginLeft: 6, verticalAlign: 'middle' }}>denetim kaydına yazılır</Badge>
          </Label>
          <Textarea
            rows={2}
            value={form.sebep}
            onChange={e => setForm(p => ({ ...p, sebep: e.target.value }))}
            placeholder="örn. Personel sahada QR okutamadı, saatler saha sorumlusu teyidiyle girildi."
          />
          <div style={{ marginTop: 4, font: '400 11px/15px var(--font-sans)', color: 'var(--text-tertiary)' }}>
            Bordroya bakan kişi bu satırın neden elle değiştiğini buradan görecek.
          </div>
        </div>
      </div>
    </Modal>
  )
}
