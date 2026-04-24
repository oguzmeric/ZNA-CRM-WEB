import { useState, useMemo, useTransition } from 'react'
import {
  Plus, Pencil, Trash2, Shield, User, Check, AlertTriangle, Settings,
  LogIn, LogOut, FileText, Clock, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ANA_TURLER } from '../context/ServisTalebiContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import CustomSelect from '../components/CustomSelect'
import {
  Button, Input, Label, Card, Badge, Avatar, EmptyState,
} from '../components/ui'

const tumModuller = [
  { id: 'musteriler',        isim: 'Müşteri & Satış' },
  { id: 'gorevler',          isim: 'Görev Atama' },
  { id: 'gorusmeler',        isim: 'Görüşmeler' },
  { id: 'stok',              isim: 'Stok' },
  { id: 'lisanslar',         isim: 'NVR Lisanslar' },
  { id: 'raporlar',          isim: 'Raporlar' },
  { id: 'servis_talepleri',  isim: 'Servis Talepleri' },
]

const bos = { ad: '', kullaniciAdi: '', sifre: '', moduller: [], tip: 'zna', firmaAdi: '', izinliTurler: [] }

const LOG_TIP = {
  kullanici_giris: { isim: 'Giriş',           tone: 'aktif',     C: LogIn },
  kullanici_cikis: { isim: 'Çıkış',           tone: 'kayip',     C: LogOut },
  sayfa_giris:     { isim: 'Sayfa Açtı',      tone: 'lead',      C: FileText },
  sayfa_cikis:     { isim: 'Sayfada Kaldı',   tone: 'pasif',     C: Clock },
}

const saniyeFormat = (s) => {
  if (!s || s === 0) return '0 s'
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} dk ${s % 60} s`
  return `${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk`
}

export default function KullaniciYonetimi() {
  const { kullanicilar, kullaniciEkle, kullaniciSil, kullaniciGuncelle } = useAuth()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [form, setForm] = useState(bos)
  const [duzenle, setDuzenle] = useState(null)
  const [goster, setGoster] = useState(false)
  const [aktifSekme, setAktifSekme] = useState('kullanicilar')
  const [seciliKullaniciId, setSeciliKullaniciId] = useState('hepsi')
  const [seciliGun, setSeciliGun] = useState('hepsi')
  const [isPending, startTransition] = useTransition()
  const [ayarlar, setAyarlar] = useState(() => JSON.parse(localStorage.getItem('sistem_ayarlari') || '{}'))
  const [ayarKaydedildi, setAyarKaydedildi] = useState(false)

  const ayarGuncelle = (alan, deger) => setAyarlar(p => ({ ...p, [alan]: deger }))

  const ayarlariKaydet = () => {
    localStorage.setItem('sistem_ayarlari', JSON.stringify(ayarlar))
    setAyarKaydedildi(true)
    setTimeout(() => setAyarKaydedildi(false), 2000)
  }

  const tumLoglar = useMemo(() =>
    JSON.parse(localStorage.getItem('aktiviteLog') || '[]')
      .sort((a, b) => new Date(b.tarih) - new Date(a.tarih)),
    [aktifSekme]
  )

  const filtreliLoglar = useMemo(() =>
    tumLoglar
      .filter(l => seciliKullaniciId === 'hepsi' || String(l.kullaniciId) === String(seciliKullaniciId))
      .filter(l => {
        if (seciliGun === 'hepsi') return true
        const logT = new Date(l.tarih).toLocaleDateString('tr-TR')
        const bugun = new Date()
        if (seciliGun === 'bugun') return logT === bugun.toLocaleDateString('tr-TR')
        if (seciliGun === 'dun') {
          const d = new Date(bugun); d.setDate(d.getDate() - 1)
          return logT === d.toLocaleDateString('tr-TR')
        }
        if (seciliGun === 'bu_hafta') {
          const hb = new Date(bugun); hb.setDate(bugun.getDate() - bugun.getDay())
          return new Date(l.tarih) >= hb
        }
        return true
      }),
    [tumLoglar, seciliKullaniciId, seciliGun]
  )

  const kullaniciOzet = kullanicilar.map(k => {
    const kLoglari = tumLoglar.filter(l => String(l.kullaniciId) === String(k.id))
    const girisler = kLoglari.filter(l => l.tip === 'kullanici_giris')
    const sayfaSureleri = kLoglari.filter(l => l.tip === 'sayfa_cikis')
    const toplamSure = sayfaSureleri.reduce((s, l) => s + (l.sureSaniye || 0), 0)
    const sayfaSayilari = {}
    kLoglari.filter(l => l.tip === 'sayfa_giris').forEach(l => {
      sayfaSayilari[l.sayfa] = (sayfaSayilari[l.sayfa] || 0) + 1
    })
    const enCok = Object.entries(sayfaSayilari).sort((a, b) => b[1] - a[1])[0]
    return {
      ...k,
      toplamGiris: girisler.length,
      toplamSure,
      enCokSayfa: enCok?.[0] || '—',
      sonGiris: girisler[0]?.tarih,
    }
  })

  const modulToggle = (id) =>
    setForm(p => ({ ...p, moduller: p.moduller.includes(id) ? p.moduller.filter(m => m !== id) : [...p.moduller, id] }))

  const turToggle = (id) =>
    setForm(p => ({ ...p, izinliTurler: p.izinliTurler.includes(id) ? p.izinliTurler.filter(t => t !== id) : [...p.izinliTurler, id] }))

  const kaydet = async () => {
    if (duzenle) {
      if (!form.ad || !form.kullaniciAdi) {
        toast.warning('Ad ve kullanıcı adı zorunludur.'); return
      }
      const { sifre, ...guncel } = form
      await kullaniciGuncelle(duzenle, guncel)
      toast.success(`${form.ad} güncellendi.`)
      setDuzenle(null)
    } else {
      if (!form.ad || !form.kullaniciAdi || !form.sifre) {
        toast.warning('Lütfen tüm alanları doldurun.'); return
      }
      if (form.sifre.length < 8) {
        toast.warning('Şifre en az 8 karakter olmalı.'); return
      }
      // Admin'in session'ını sakla — signUp session'ı yeni kullanıcıya döndürür
      const { data: { session: adminSession } } = await supabase.auth.getSession()

      // 1. Supabase Auth kullanıcısı oluştur
      const email = `${form.kullaniciAdi.toLowerCase().replace(/[^a-z0-9]/g, '')}@zna.local`
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: form.sifre,
        options: { data: { ad: form.ad, kullanici_adi: form.kullaniciAdi, tip: form.tip } },
      })

      // Admin session'ını hemen geri yükle (hata durumunda bile)
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        })
      }

      if (authError || !authData?.user) {
        toast.error('Auth hatası: ' + (authError?.message || 'bilinmeyen'))
        return
      }
      // 2. kullanicilar tablosuna profil satırı
      const { sifre, ...profil } = form
      await kullaniciEkle({ ...profil, authId: authData.user.id, email })
      toast.success(`${form.ad} eklendi.`)
    }
    setForm(bos); setGoster(false)
  }

  const duzenleBasla = (k) => {
    setForm({
      ad: k.ad, kullaniciAdi: k.kullaniciAdi, sifre: '',
      moduller: k.moduller || [], tip: k.tip || 'zna',
      firmaAdi: k.firmaAdi || '', izinliTurler: k.izinliTurler || [],
    })
    setDuzenle(k.id); setGoster(true)
  }

  const iptal = () => { setForm(bos); setDuzenle(null); setGoster(false) }

  const logTemizle = async () => {
    const onay = await confirm({
      baslik: 'Logları Temizle',
      mesaj: 'Tüm aktivite logları kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      onayMetin: 'Evet, temizle', iptalMetin: 'Vazgeç', tip: 'tehlikeli',
    })
    if (!onay) return
    localStorage.removeItem('aktiviteLog')
    toast.success('Aktivite logları temizlendi.')
    setTimeout(() => window.location.reload(), 800)
  }

  const SEKMELER = [
    { id: 'kullanicilar', isim: 'Kullanıcılar' },
    { id: 'aktivite',     isim: 'Aktivite Logları' },
    { id: 'ozet',         isim: 'Özet Rapor' },
    { id: 'ayarlar',      isim: 'Sistem Ayarları', C: Settings },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="t-h1">Kullanıcı Yönetimi</h1>
          <p className="t-caption" style={{ marginTop: 4 }}>
            <span className="tabular-nums">{kullanicilar.length}</span> kullanıcı
          </p>
        </div>
        {aktifSekme === 'kullanicilar' && !goster && (
          <Button variant="primary" iconLeft={<Plus size={14} strokeWidth={1.5} />} onClick={() => setGoster(true)}>
            Yeni kullanıcı
          </Button>
        )}
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
        {SEKMELER.map(s => {
          const aktif = aktifSekme === s.id
          return (
            <button
              key={s.id}
              onClick={() => setAktifSekme(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${aktif ? 'var(--brand-primary)' : 'transparent'}`,
                marginBottom: -1,
                color: aktif ? 'var(--brand-primary)' : 'var(--text-secondary)',
                font: aktif ? '600 13px/18px var(--font-sans)' : '500 13px/18px var(--font-sans)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {s.C && <s.C size={14} strokeWidth={1.5} />}
              {s.isim}
            </button>
          )
        })}
      </div>

      {/* KULLANICILAR */}
      {aktifSekme === 'kullanicilar' && (
        <>
          {goster && (
            <Card style={{ marginBottom: 16 }}>
              <h2 className="t-h2" style={{ marginBottom: 16 }}>{duzenle ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı Ekle'}</h2>

              <div style={{ marginBottom: 16 }}>
                <Label>Kullanıcı tipi</Label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { id: 'zna',     isim: 'ZNA Personeli',     aciklama: 'Dahili yönetim sistemi erişimi', C: Shield },
                    { id: 'musteri', isim: 'Müşteri Portalı',   aciklama: 'Talep oluşturma ve takip',       C: User },
                  ].map(t => {
                    const active = form.tip === t.id
                    const IconC = t.C
                    return (
                      <button
                        key={t.id}
                        onClick={() => setForm({ ...form, tip: t.id, moduller: t.id === 'musteri' ? [] : form.moduller })}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 16px',
                          borderRadius: 'var(--radius-md)',
                          background: active ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                          border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          textAlign: 'left', cursor: 'pointer',
                        }}
                      >
                        <IconC size={18} strokeWidth={1.5} style={{ color: active ? 'var(--brand-primary)' : 'var(--text-secondary)', flexShrink: 0 }} />
                        <div>
                          <div style={{ font: '500 14px/20px var(--font-sans)', color: active ? 'var(--brand-primary)' : 'var(--text-primary)' }}>
                            {t.isim}
                          </div>
                          <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)' }}>
                            {t.aciklama}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
                <div>
                  <Label required>Ad Soyad</Label>
                  <Input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} placeholder="Ahmet Yılmaz" />
                </div>
                <div>
                  <Label required>Kullanıcı adı</Label>
                  <Input value={form.kullaniciAdi} onChange={e => setForm({ ...form, kullaniciAdi: e.target.value })} placeholder="ahmet_y" />
                </div>
                <div>
                  <Label required={!duzenle}>Şifre</Label>
                  {duzenle ? (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--border-default)',
                      font: '400 13px/20px var(--font-sans)',
                      color: 'var(--text-tertiary)',
                    }}>
                      Kullanıcı kendi profilinden değiştirir
                    </div>
                  ) : (
                    <Input
                      type="password"
                      value={form.sifre}
                      onChange={e => setForm({ ...form, sifre: e.target.value })}
                      placeholder="En az 8 karakter"
                    />
                  )}
                </div>
              </div>

              {form.tip === 'musteri' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Label>Firma adı</Label>
                    <Input value={form.firmaAdi} onChange={e => setForm({ ...form, firmaAdi: e.target.value })} placeholder="ABC Teknoloji A.Ş." />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <Label>İzin verilen talep türleri <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(boş bırakılırsa tüm türler açık)</span></Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                      {ANA_TURLER.map(tur => {
                        const secili = form.izinliTurler.includes(tur.id)
                        return (
                          <label
                            key={tur.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                              padding: '8px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-card)',
                              border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={secili}
                              onChange={() => turToggle(tur.id)}
                              style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                            />
                            <span style={{
                              font: secili ? '600 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                              color: secili ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            }}>
                              {tur.isim}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {form.izinliTurler.length === 0 && (
                      <p style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '400 12px/16px var(--font-sans)', color: 'var(--warning)', marginTop: 6 }}>
                        <AlertTriangle size={12} strokeWidth={1.5} /> Hiçbir tür seçilmedi — müşteri tüm türleri görecek
                      </p>
                    )}
                  </div>
                </>
              )}

              {form.tip !== 'musteri' && (
                <div style={{ marginBottom: 16 }}>
                  <Label>Modül erişimleri</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {tumModuller.map(m => {
                      const secili = form.moduller.includes(m.id)
                      return (
                        <label
                          key={m.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: secili ? 'var(--brand-primary-soft)' : 'var(--surface-sunken)',
                            border: `1px solid ${secili ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={secili}
                            onChange={() => modulToggle(m.id)}
                            style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)' }}
                          />
                          <span style={{
                            font: secili ? '500 13px/18px var(--font-sans)' : '400 13px/18px var(--font-sans)',
                            color: secili ? 'var(--brand-primary)' : 'var(--text-primary)',
                          }}>
                            {m.isim}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" onClick={kaydet}>{duzenle ? 'Güncelle' : 'Kaydet'}</Button>
                <Button variant="secondary" onClick={iptal}>İptal</Button>
              </div>
            </Card>
          )}

          <Card padding={0}>
            {kullanicilar.map(k => (
              <div
                key={k.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border-default)',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Avatar name={k.ad} size="md" />
                <div style={{ minWidth: 0, flex: '0 0 220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{k.ad}</span>
                    {k.tip === 'musteri' && <Badge tone="brand">Müşteri Portalı</Badge>}
                  </div>
                  <div style={{ font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    @{k.kullaniciAdi}
                    {k.firmaAdi && <span> · {k.firmaAdi}</span>}
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {k.tip === 'musteri' ? (
                    k.izinliTurler && k.izinliTurler.length > 0
                      ? k.izinliTurler.map(tid => {
                          const tur = ANA_TURLER.find(t => t.id === tid)
                          return tur ? <Badge key={tid} tone="brand">{tur.isim}</Badge> : null
                        })
                      : <Badge tone="neutral">Tüm türler açık</Badge>
                  ) : (
                    k.moduller?.map(mid => {
                      const m = tumModuller.find(t => t.id === mid)
                      return <Badge key={mid} tone="lead">{m?.isim}</Badge>
                    })
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    aria-label="Düzenle"
                    onClick={() => duzenleBasla(k)}
                    style={{
                      width: 32, height: 32,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary-soft)'; e.currentTarget.style.color = 'var(--brand-primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  >
                    <Pencil size={14} strokeWidth={1.5} />
                  </button>
                  {k.silinebilir && (
                    <button
                      aria-label="Sil"
                      onClick={async () => await kullaniciSil(k.id)}
                      style={{
                        width: 32, height: 32,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-soft)'; e.currentTarget.style.color = 'var(--danger)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* AKTİVİTE */}
      {aktifSekme === 'aktivite' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ minWidth: 200 }}>
                <CustomSelect value={seciliKullaniciId} onChange={e => startTransition(() => setSeciliKullaniciId(e.target.value))}>
                  <option value="hepsi">Tüm kullanıcılar</option>
                  {kullanicilar.map(k => <option key={k.id} value={String(k.id)}>{k.ad}</option>)}
                </CustomSelect>
              </div>
              <div style={{ minWidth: 160 }}>
                <CustomSelect value={seciliGun} onChange={e => startTransition(() => setSeciliGun(e.target.value))}>
                  <option value="hepsi">Tüm zamanlar</option>
                  <option value="bugun">Bugün</option>
                  <option value="dun">Dün</option>
                  <option value="bu_hafta">Bu hafta</option>
                </CustomSelect>
              </div>
              <span className="t-caption"><span className="tabular-nums">{filtreliLoglar.length}</span> kayıt</span>
            </div>
            <Button variant="tertiary" size="sm" iconLeft={<Trash2 size={12} strokeWidth={1.5} />} onClick={logTemizle}>
              Logları temizle
            </Button>
          </div>

          <Card padding={0} style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms' }}>
            {filtreliLoglar.length === 0 ? (
              <div style={{ padding: 40 }}><EmptyState title="Henüz aktivite logu yok" /></div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr>
                      {['Kullanıcı', 'İşlem', 'Sayfa / Detay', 'Süre', 'Tarih & Saat'].map((h, i) => (
                        <th key={i} style={{
                          background: 'var(--surface-sunken)',
                          padding: '10px 14px',
                          textAlign: 'left',
                          font: '600 11px/16px var(--font-sans)',
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          borderBottom: '1px solid var(--border-default)',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtreliLoglar.slice(0, 200).map(l => {
                      const tip = LOG_TIP[l.tip] || LOG_TIP.sayfa_giris
                      const IconC = tip.C
                      return (
                        <tr key={l.id}
                          style={{ transition: 'background 120ms' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-sunken)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <Avatar name={l.kullaniciAd} size="xs" />
                              <span style={{ font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)' }}>{l.kullaniciAd}</span>
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', whiteSpace: 'nowrap' }}>
                            <Badge tone={tip.tone} icon={<IconC size={11} strokeWidth={1.5} />}>{tip.isim}</Badge>
                          </td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', font: '400 13px/18px var(--font-sans)', color: 'var(--text-secondary)', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {l.sayfa || l.aciklama || '—'}
                          </td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', font: '400 12px/16px var(--font-sans)', color: l.sureSaniye ? 'var(--text-secondary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {l.sureSaniye ? saniyeFormat(l.sureSaniye) : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', font: '400 12px/16px var(--font-sans)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {new Date(l.tarih).toLocaleDateString('tr-TR')} {new Date(l.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ÖZET */}
      {aktifSekme === 'ozet' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {kullaniciOzet.map(k => (
            <Card key={k.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Avatar name={k.ad} size="md" />
                <div>
                  <div style={{ font: '500 14px/20px var(--font-sans)', color: 'var(--text-primary)' }}>{k.ad}</div>
                  <div className="t-caption">@{k.kullaniciAdi}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                {[
                  { l: 'TOPLAM GİRİŞ', v: k.toplamGiris, c: 'var(--text-primary)' },
                  { l: 'TOPLAM SÜRE',  v: saniyeFormat(k.toplamSure), c: 'var(--success)' },
                  { l: 'EN ÇOK ZİYARET', v: k.enCokSayfa, c: 'var(--text-primary)', truncate: true },
                  { l: 'SON GİRİŞ',    v: k.sonGiris
                      ? `${new Date(k.sonGiris).toLocaleDateString('tr-TR')} ${new Date(k.sonGiris).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
                      : '—',
                    c: 'var(--text-primary)' },
                ].map(i => (
                  <div key={i.l} style={{
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 14px',
                  }}>
                    <div className="t-label" style={{ marginBottom: 4 }}>{i.l}</div>
                    <div style={{
                      font: '600 16px/22px var(--font-sans)',
                      color: i.c,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: i.truncate ? 'nowrap' : 'normal',
                      overflow: i.truncate ? 'hidden' : 'visible',
                      textOverflow: i.truncate ? 'ellipsis' : 'clip',
                    }}>
                      {i.v}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <p className="t-label" style={{ marginBottom: 8 }}>SAYFA ZİYARET DAĞILIMI</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(
                    tumLoglar
                      .filter(l => String(l.kullaniciId) === String(k.id) && l.tip === 'sayfa_giris')
                      .reduce((acc, l) => { acc[l.sayfa] = (acc[l.sayfa] || 0) + 1; return acc }, {})
                  )
                    .sort((a, b) => b[1] - a[1])
                    .map(([sayfa, adet]) => (
                      <Badge key={sayfa} tone="lead">
                        {sayfa}: <strong style={{ marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{adet}</strong>
                      </Badge>
                    ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* AYARLAR */}
      {aktifSekme === 'ayarlar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <Card>
            <h3 className="t-h2" style={{ marginBottom: 4 }}>Müşteri Portalı</h3>
            <p className="t-caption" style={{ marginBottom: 16 }}>Müşteri portalında görüntülenecek bağlantılar ve içerikler</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <Label>Ürün kataloğu / datasheet URL</Label>
                <p className="t-caption" style={{ marginBottom: 6 }}>
                  Müşteriler "Teklif İste" sayfasında bu linki görecek — tıklayarak ürün kataloğunu inceleyebilecekler.
                </p>
                <Input type="url" value={ayarlar.datasheetUrl || ''} onChange={e => ayarGuncelle('datasheetUrl', e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Destek telefon numarası</Label>
                <Input value={ayarlar.destekTelefon || ''} onChange={e => ayarGuncelle('destekTelefon', e.target.value)} placeholder="0212 xxx xx xx" />
              </div>
              <div>
                <Label>Destek e-posta</Label>
                <Input type="email" value={ayarlar.destekEposta || ''} onChange={e => ayarGuncelle('destekEposta', e.target.value)} placeholder="destek@firma.com" />
              </div>
            </div>
          </Card>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Button variant="primary" onClick={ayarlariKaydet}>Kaydet</Button>
            {ayarKaydedildi && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '500 13px/18px var(--font-sans)', color: 'var(--success)' }}>
                <CheckCircle2 size={14} strokeWidth={1.5} /> Ayarlar kaydedildi
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
