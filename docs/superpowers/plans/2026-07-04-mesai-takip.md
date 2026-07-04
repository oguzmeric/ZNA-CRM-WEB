# Mesai Takip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Teknisyen/depo mesai giriş-çıkış logu (ofis QR + GPS + tek buton çıkış).

**Architecture:** Supabase Postgres tabloları + RLS. 3 edge function (giriş/çıkış/QR-üret). Mobile (React Native + Expo) HomeScreen'de MesaiKarti komponenti. Web (React) Raporlar > Mesai sekmesi + Yönetim > Ofis Konumu.

**Tech Stack:** Postgres, Supabase Edge Functions (Deno), React Native + Expo, React + Vite, Leaflet, expo-camera, expo-location.

**Referans spec:** [docs/superpowers/specs/2026-07-04-mesai-takip-design.md](../specs/2026-07-04-mesai-takip-design.md)

**Not — TDD:** Bu kodbase test suite kullanmıyor (bkz. `crm-app/package.json`, `crm-mobile/package.json`). Bu sebeple TDD adımları yerine her task için manuel verification steps var. Ekiple test kültürü sonra tartışılır — YAGNI şimdilik.

---

## File map

**Yeni:**
- `crm-app/supabase_migrations/083_mesai_takip.sql`
- `crm-app/supabase/functions/mesai-giris/index.ts`
- `crm-app/supabase/functions/mesai-cikis/index.ts`
- `crm-app/supabase/functions/mesai-qr-uret/index.ts`
- `crm-app/supabase/functions/_shared/mesai_hmac.ts`
- `crm-app/src/pages/OfisKonumu.jsx`
- `crm-app/src/pages/MesaiRapor.jsx`  *(Raporlar içinde sekme; ayrı sayfa değil — bkz. Task 9)*
- `crm-mobile/src/services/mesaiService.js`
- `crm-mobile/src/components/MesaiKarti.js`

**Değişecek:**
- `crm-app/src/App.jsx` — /ofis-konumu route + OguzGuard
- `crm-app/src/layouts/MainLayout.jsx` — Yönetim grubuna "Ofis Konumu" menü item
- `crm-app/src/pages/Raporlar.jsx` — Mesai sekmesi
- `crm-mobile/src/screens/HomeScreen.js` — MesaiKarti render

---

## Task 1: Migration 083 — DB schema

**Files:**
- Create: `crm-app/supabase_migrations/083_mesai_takip.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 083_mesai_takip.sql
-- Teknisyen/depo mesai giriş-çıkış logu

create table if not exists ofis_konumu (
  id uuid primary key default gen_random_uuid(),
  ad text not null default 'Merkez Ofis',
  lat numeric(10,7),
  lng numeric(10,7),
  tolerans_metre integer not null default 150,
  guncelleme_zamani timestamptz not null default now()
);

insert into ofis_konumu (ad) values ('Merkez Ofis')
on conflict do nothing;

create table if not exists mesai_kayitlari (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references kullanicilar(id) on delete cascade,
  giris_zamani timestamptz not null default now(),
  giris_lat numeric(10,7),
  giris_lng numeric(10,7),
  giris_mesafe_m integer,
  cikis_zamani timestamptz,
  cikis_lat numeric(10,7),
  cikis_lng numeric(10,7),
  sure_dakika integer,
  not_ text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mesai_aktif_tek
  on mesai_kayitlari(kullanici_id) where cikis_zamani is null;

create index if not exists mesai_kullanici_tarih
  on mesai_kayitlari(kullanici_id, giris_zamani desc);

-- sure_dakika hesapla + updated_at
create or replace function mesai_sure_hesapla_fn() returns trigger as $$
begin
  new.updated_at = now();
  if new.cikis_zamani is not null and old.cikis_zamani is null then
    new.sure_dakika = extract(epoch from (new.cikis_zamani - new.giris_zamani))::int / 60;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists mesai_sure_hesapla on mesai_kayitlari;
create trigger mesai_sure_hesapla before update on mesai_kayitlari
  for each row execute function mesai_sure_hesapla_fn();

-- RLS
alter table mesai_kayitlari enable row level security;
drop policy if exists mesai_kendi_okur on mesai_kayitlari;
create policy mesai_kendi_okur on mesai_kayitlari for select using (
  exists (
    select 1 from kullanicilar k
    where k.auth_id = auth.uid()
      and (k.id = mesai_kayitlari.kullanici_id
           or k.rol = 'admin'
           or k.ad ~* '\b(oğuz|oguz|ali)\b')
  )
);
-- INSERT/UPDATE policy YOK — sadece service_role (edge function) yazar

alter table ofis_konumu enable row level security;
drop policy if exists ofis_okur on ofis_konumu;
create policy ofis_okur on ofis_konumu for select to authenticated using (true);
drop policy if exists ofis_oguz_yazar on ofis_konumu;
create policy ofis_oguz_yazar on ofis_konumu for all using (
  exists (select 1 from kullanicilar where auth_id = auth.uid()
          and ad ~* '\b(oğuz|oguz)\b')
);

-- Modül dağıtımı
update kullanicilar
set moduller = array_append(coalesce(moduller, '{}'), 'mesai_takip')
where not ('mesai_takip' = any(coalesce(moduller, '{}')))
  and (rol = 'admin'
       or ad ~* '\b(ferdi|ali|oğuz|oguz)\b'
       or unvan ~* '(teknisyen|depo)');

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply migration**

```bash
node scripts/migration-runner.mjs supabase_migrations/083_mesai_takip.sql
```

Expected: "Migration 083_mesai_takip.sql applied successfully."

- [ ] **Step 3: Verify schema**

```bash
node -e "const {createClient}=require('@supabase/supabase-js');const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);s.from('ofis_konumu').select('*').then(r=>console.log('ofis:',r.data));s.from('mesai_kayitlari').select('id').limit(0).then(r=>console.log('mesai OK:',r.error?r.error.message:'exists'));"
```

Expected: 1 satır ofis_konumu + mesai_kayitlari boş tablo.

- [ ] **Step 4: Verify modül dağıtımı**

```sql
select ad, unvan, rol, moduller from kullanicilar where 'mesai_takip' = any(moduller) order by ad;
```

Expected: teknisyen + depo + Ferdi + Ali + Oğuz görünür.

- [ ] **Step 5: Commit**

```bash
git add crm-app/supabase_migrations/083_mesai_takip.sql
git commit -m "feat(mesai): 083 — mesai_kayitlari + ofis_konumu + RLS"
```

---

## Task 2: HMAC shared helper + QR secret

**Files:**
- Create: `crm-app/supabase/functions/_shared/mesai_hmac.ts`

- [ ] **Step 1: Set MESAI_QR_SECRET on Supabase**

Kullanıcı Supabase Dashboard → Project Settings → Edge Functions → Secrets:
```
MESAI_QR_SECRET = <openssl rand -base64 32>
```

Bu manuel adım. User'a talimat verilecek — deploy öncesi tamamlanmalı.

- [ ] **Step 2: Write shared HMAC helper**

```ts
// crm-app/supabase/functions/_shared/mesai_hmac.ts
export async function hmacKisa(mesaj: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mesaj))
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 16)
}

export function payloadUret(ofisId: string, hmac16: string): string {
  return `ZNA-MESAI:v1:${ofisId}:${hmac16}`
}

export function payloadParcala(payload: string): { ofisId: string; hmac16: string } | null {
  const m = payload.match(/^ZNA-MESAI:v1:([^:]+):([A-Za-z0-9_-]{16})$/)
  return m ? { ofisId: m[1], hmac16: m[2] } : null
}

export async function payloadDogrula(payload: string, secret: string): Promise<{ ok: boolean; ofisId?: string }> {
  const p = payloadParcala(payload)
  if (!p) return { ok: false }
  const beklenen = await hmacKisa(`v1|${p.ofisId}`, secret)
  return beklenen === p.hmac16 ? { ok: true, ofisId: p.ofisId } : { ok: false }
}

export function haversineMetre(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng/2)**2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
}
```

- [ ] **Step 3: Commit**

```bash
git add crm-app/supabase/functions/_shared/mesai_hmac.ts
git commit -m "feat(mesai): HMAC + Haversine shared helper"
```

---

## Task 3: Edge function — mesai-giris

**Files:**
- Create: `crm-app/supabase/functions/mesai-giris/index.ts`

- [ ] **Step 1: Write edge function**

```ts
// crm-app/supabase/functions/mesai-giris/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { payloadDogrula, haversineMetre } from '../_shared/mesai_hmac.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const { qr_payload, lat, lng, zorla } = await req.json()
    if (!qr_payload) return json({ ok: false, hata: 'qr_eksik' }, 400)
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return json({ ok: false, hata: 'konum_yok' }, 400)
    }

    const secret = Deno.env.get('MESAI_QR_SECRET') ?? ''
    const dogrulama = await payloadDogrula(qr_payload, secret)
    if (!dogrulama.ok) return json({ ok: false, hata: 'gecersiz_qr' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userRes } = await userClient.auth.getUser()
    if (!userRes?.user) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const { data: kullanici } = await supabase
      .from('kullanicilar').select('id, moduller')
      .eq('auth_id', userRes.user.id).maybeSingle()
    if (!kullanici) return json({ ok: false, hata: 'kullanici_yok' }, 403)
    if (!(kullanici.moduller ?? []).includes('mesai_takip')) {
      return json({ ok: false, hata: 'modul_yok' }, 403)
    }

    const { data: ofis } = await supabase
      .from('ofis_konumu').select('lat, lng, tolerans_metre').limit(1).single()
    const mesafe = (ofis?.lat && ofis?.lng)
      ? haversineMetre(Number(ofis.lat), Number(ofis.lng), lat, lng)
      : null
    const tolerans = ofis?.tolerans_metre ?? 150

    // Açık kayıt kontrolü
    const { data: acik } = await supabase
      .from('mesai_kayitlari')
      .select('id, giris_zamani')
      .eq('kullanici_id', kullanici.id)
      .is('cikis_zamani', null)
      .maybeSingle()
    if (acik && !zorla) {
      return json({ ok: false, hata: 'zaten_acik', acik_kayit_baslangic: acik.giris_zamani })
    }
    if (acik && zorla) {
      await supabase.from('mesai_kayitlari').update({
        cikis_zamani: new Date().toISOString(),
        not_: 'Yeni giriş için otomatik kapatıldı',
      }).eq('id', acik.id)
    }

    // Ofis dışı ön uyarı
    if (mesafe !== null && mesafe > tolerans && !zorla) {
      return json({ ok: false, uyari: 'ofis_disi', mesafe_m: mesafe })
    }

    const notMetni = (mesafe !== null && mesafe > tolerans) ? `Ofis dışı: ${mesafe}m` : null
    const { data: yeni, error } = await supabase.from('mesai_kayitlari').insert({
      kullanici_id: kullanici.id,
      giris_lat: lat, giris_lng: lng, giris_mesafe_m: mesafe,
      not_: notMetni,
    }).select('id').single()
    if (error) return json({ ok: false, hata: error.message }, 500)

    return json({ ok: true, mesai_id: yeni.id, mesafe_m: mesafe })
  } catch (e) {
    return json({ ok: false, hata: String(e?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy mesai-giris --project-ref <PROJECT_REF>
```

Expected: "Deployed Function mesai-giris."

- [ ] **Step 3: Manual test — geçersiz QR**

```bash
curl -X POST "$SUPABASE_URL/functions/v1/mesai-giris" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"qr_payload":"garbage","lat":41.0,"lng":29.0}'
```

Expected: `{"ok":false,"hata":"gecersiz_qr"}`

- [ ] **Step 4: Commit**

```bash
git add crm-app/supabase/functions/mesai-giris/
git commit -m "feat(mesai): mesai-giris edge fn — QR+GPS doğrulama, açık kayıt kontrolü"
```

---

## Task 4: Edge function — mesai-cikis

**Files:**
- Create: `crm-app/supabase/functions/mesai-cikis/index.ts`

- [ ] **Step 1: Write edge function**

```ts
// crm-app/supabase/functions/mesai-cikis/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const body = await req.json().catch(() => ({}))
    const lat = typeof body.lat === 'number' ? body.lat : null
    const lng = typeof body.lng === 'number' ? body.lng : null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userRes } = await userClient.auth.getUser()
    if (!userRes?.user) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const { data: kullanici } = await supabase
      .from('kullanicilar').select('id').eq('auth_id', userRes.user.id).maybeSingle()
    if (!kullanici) return json({ ok: false, hata: 'kullanici_yok' }, 403)

    const { data: acik } = await supabase
      .from('mesai_kayitlari').select('id')
      .eq('kullanici_id', kullanici.id).is('cikis_zamani', null)
      .order('giris_zamani', { ascending: false }).limit(1).maybeSingle()
    if (!acik) return json({ ok: false, hata: 'acik_kayit_yok' }, 400)

    const { data: guncel, error } = await supabase.from('mesai_kayitlari').update({
      cikis_zamani: new Date().toISOString(),
      cikis_lat: lat, cikis_lng: lng,
    }).eq('id', acik.id).select('sure_dakika').single()
    if (error) return json({ ok: false, hata: error.message }, 500)

    return json({ ok: true, sure_dakika: guncel.sure_dakika })
  } catch (e) {
    return json({ ok: false, hata: String(e?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy mesai-cikis --project-ref <PROJECT_REF>
```

- [ ] **Step 3: Commit**

```bash
git add crm-app/supabase/functions/mesai-cikis/
git commit -m "feat(mesai): mesai-cikis edge fn"
```

---

## Task 5: Edge function — mesai-qr-uret

**Files:**
- Create: `crm-app/supabase/functions/mesai-qr-uret/index.ts`

- [ ] **Step 1: Write edge function**

```ts
// crm-app/supabase/functions/mesai-qr-uret/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmacKisa, payloadUret } from '../_shared/mesai_hmac.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userRes } = await userClient.auth.getUser()
    if (!userRes?.user) return json({ ok: false, hata: 'yetkisiz' }, 401)

    const { data: kullanici } = await supabase
      .from('kullanicilar').select('ad').eq('auth_id', userRes.user.id).maybeSingle()
    if (!kullanici || !/\b(oğuz|oguz)\b/i.test(kullanici.ad ?? '')) {
      return json({ ok: false, hata: 'sadece_oguz' }, 403)
    }

    const { data: ofis } = await supabase
      .from('ofis_konumu').select('id').limit(1).single()
    const secret = Deno.env.get('MESAI_QR_SECRET') ?? ''
    const hmac16 = await hmacKisa(`v1|${ofis.id}`, secret)
    const payload = payloadUret(ofis.id, hmac16)

    return json({ ok: true, payload })
  } catch (e) {
    return json({ ok: false, hata: String(e?.message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
```

QR PNG üretimi frontend'de (qrcode.react/qrcode lib) — backend sadece payload verir. Böylece deno lib bağımlılığı yok.

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy mesai-qr-uret --project-ref <PROJECT_REF>
```

- [ ] **Step 3: Commit**

```bash
git add crm-app/supabase/functions/mesai-qr-uret/
git commit -m "feat(mesai): mesai-qr-uret edge fn — Oğuz-only payload üret"
```

---

## Task 6: Mobile service layer

**Files:**
- Create: `crm-mobile/src/services/mesaiService.js`

- [ ] **Step 1: Write service**

```js
// crm-mobile/src/services/mesaiService.js
import { supabase } from '../lib/supabase'

async function edgeCagir(yol, body) {
  const { data, error } = await supabase.functions.invoke(yol, { body })
  if (error) return { ok: false, hata: error.message }
  return data
}

export const mesaiyeBasla = ({ qr_payload, lat, lng, zorla = false }) =>
  edgeCagir('mesai-giris', { qr_payload, lat, lng, zorla })

export const mesaiyiBitir = ({ lat = null, lng = null } = {}) =>
  edgeCagir('mesai-cikis', { lat, lng })

export async function acikMesaiGetir() {
  const { data: sess } = await supabase.auth.getSession()
  const uid = sess?.session?.user?.id
  if (!uid) return null
  const { data: k } = await supabase.from('kullanicilar').select('id').eq('auth_id', uid).maybeSingle()
  if (!k) return null
  const { data } = await supabase.from('mesai_kayitlari')
    .select('id, giris_zamani')
    .eq('kullanici_id', k.id).is('cikis_zamani', null)
    .order('giris_zamani', { ascending: false }).limit(1).maybeSingle()
  return data
}

export function mesaiTakipVarMi(kullanici) {
  return (kullanici?.moduller ?? []).includes('mesai_takip')
}
```

- [ ] **Step 2: Commit**

```bash
git add crm-mobile/src/services/mesaiService.js
git commit -m "feat(mesai/mobile): mesaiService — edge fn wrappers"
```

---

## Task 7: MesaiKarti component

**Files:**
- Create: `crm-mobile/src/components/MesaiKarti.js`

- [ ] **Step 1: Write component**

```js
// crm-mobile/src/components/MesaiKarti.js
import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Alert, Linking } from 'react-native'
import * as Location from 'expo-location'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { mesaiyeBasla, mesaiyiBitir, acikMesaiGetir } from '../services/mesaiService'

const RENK = {
  giris: '#10b981', cikis: '#ef4444',
  yesilYumusak: '#d1fae5', metin: '#0f172a', ikincil: '#64748b',
}

function sureFormat(baslangicIso) {
  const ms = Date.now() - new Date(baslangicIso).getTime()
  const dk = Math.floor(ms / 60000)
  const s = String(Math.floor(dk / 60)).padStart(2, '0')
  const m = String(dk % 60).padStart(2, '0')
  return `${s}:${m}`
}

export default function MesaiKarti() {
  const [acik, setAcik] = useState(null)
  const [tick, setTick] = useState(0)
  const [qrAcik, setQrAcik] = useState(false)
  const [izin, izinIste] = useCameraPermissions()
  const yukSayaci = useRef(null)

  const yenile = async () => setAcik(await acikMesaiGetir())
  useEffect(() => { yenile() }, [])
  useEffect(() => {
    if (!acik) return
    const t = setInterval(() => setTick(x => x + 1), 30000)
    return () => clearInterval(t)
  }, [acik])

  const qrOku = async () => {
    if (!izin?.granted) {
      const r = await izinIste()
      if (!r.granted) { Alert.alert('İzin', 'Kamera izni verilmedi.'); return }
    }
    setQrAcik(true)
  }

  const konumAlVeGiris = async (qr_payload, zorla = false) => {
    const konumIzin = await Location.requestForegroundPermissionsAsync()
    if (konumIzin.status !== 'granted') {
      Alert.alert(
        'Konum İzni Gerekli',
        'Mesai başlatmak için konum izni zorunlu. Ayarlar > Uygulama izinleri > Konum\'dan aç.',
        [{ text: 'Ayarlara Git', onPress: () => Linking.openSettings() }, { text: 'İptal' }]
      )
      return
    }
    let konum
    try {
      konum = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: true })
    } catch {
      Alert.alert('Konum', 'Konum alınamadı. Açık havada tekrar deneyin.')
      return
    }
    const { latitude: lat, longitude: lng } = konum.coords
    const cvp = await mesaiyeBasla({ qr_payload, lat, lng, zorla })
    if (cvp.ok) {
      Alert.alert('✅ Mesaiye başladın', cvp.mesafe_m !== null ? `Ofise ~${cvp.mesafe_m}m` : '')
      yenile()
      return
    }
    if (cvp.uyari === 'ofis_disi') {
      Alert.alert(
        'Ofis dışı',
        `Ofis konumundan ~${cvp.mesafe_m}m uzaktasın. Yine de başlayayım mı?`,
        [{ text: 'İptal' }, { text: 'Evet', onPress: () => konumAlVeGiris(qr_payload, true) }]
      )
      return
    }
    if (cvp.hata === 'zaten_acik') {
      Alert.alert(
        'Zaten mesaidesin',
        `Kapatıp yenisini açayım mı?`,
        [{ text: 'İptal' }, { text: 'Evet', onPress: () => konumAlVeGiris(qr_payload, true) }]
      )
      return
    }
    if (cvp.hata === 'gecersiz_qr') { Alert.alert('QR', 'Bu QR mesai kodu değil.'); return }
    Alert.alert('Hata', cvp.hata ?? 'Bilinmeyen hata')
  }

  const qrIslendi = ({ data }) => {
    if (!qrAcik) return
    setQrAcik(false)
    if (!data?.startsWith('ZNA-MESAI:v1:')) {
      Alert.alert('QR', 'Bu QR mesai kodu değil.')
      return
    }
    konumAlVeGiris(data)
  }

  const bitir = () => {
    Alert.alert('Mesaiyi bitir?', `Süre: ${sureFormat(acik.giris_zamani)}`, [
      { text: 'İptal' },
      { text: 'Bitir', onPress: async () => {
        let lat = null, lng = null
        try {
          const iz = await Location.getForegroundPermissionsAsync()
          if (iz.granted) {
            const k = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
            lat = k.coords.latitude; lng = k.coords.longitude
          }
        } catch {}
        const r = await mesaiyiBitir({ lat, lng })
        if (r.ok) {
          const s = String(Math.floor(r.sure_dakika / 60)).padStart(2, '0')
          const d = String(r.sure_dakika % 60).padStart(2, '0')
          Alert.alert('Mesai bitti ✅', `Toplam ${s}:${d}`)
          yenile()
        } else {
          Alert.alert('Hata', r.hata ?? 'Bitirilemedi')
        }
      }},
    ])
  }

  if (qrAcik) {
    return (
      <View style={{ height: 380, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={qrIslendi}
        />
        <TouchableOpacity onPress={() => setQrAcik(false)}
          style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: 8 }}>
          <Text style={{ color: '#fff' }}>× Kapat</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
      {acik ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: RENK.giris }} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: RENK.metin }}>
              Mesaide · {sureFormat(acik.giris_zamani)} sürüyor
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: RENK.ikincil, marginBottom: 12 }}>
            Başlangıç: {new Date(acik.giris_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}
          </Text>
          <TouchableOpacity onPress={bitir}
            style={{ backgroundColor: RENK.cikis, borderRadius: 12, padding: 14, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>🔴 Mesaiyi Bitir</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 15, fontWeight: '700', color: RENK.metin, marginBottom: 4 }}>⏱ Mesai</Text>
          <Text style={{ fontSize: 12, color: RENK.ikincil, marginBottom: 12 }}>Bugün henüz başlamadın</Text>
          <TouchableOpacity onPress={qrOku}
            style={{ backgroundColor: RENK.giris, borderRadius: 12, padding: 14, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>🟢 Mesaiye Başla (QR Okut)</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add crm-mobile/src/components/MesaiKarti.js
git commit -m "feat(mesai/mobile): MesaiKarti — QR okut + GPS + canlı sayaç"
```

---

## Task 8: HomeScreen integration

**Files:**
- Modify: `crm-mobile/src/screens/HomeScreen.js`

- [ ] **Step 1: Add MesaiKarti to HomeScreen**

`HomeScreen.js`'nin en üstünde import ekle:

```js
import MesaiKarti from '../components/MesaiKarti'
import { mesaiTakipVarMi } from '../services/mesaiService'
```

Kullanıcı verisinin çekildiği yerde (mevcut `kullanici` state), render sırasında DuyuruBanner'ın hemen altına:

```jsx
{mesaiTakipVarMi(kullanici) && <MesaiKarti />}
```

- [ ] **Step 2: EAS Update yayınla**

```bash
cd crm-mobile
CI=1 npx eas-cli update --branch production --message "mesai: karti"
```

Expected: "Published update."

- [ ] **Step 3: Manual test — telefonda**

Mobil aç, teknisyen hesabıyla gir → HomeScreen'de "Mesai" kartı görünür → "QR Okut" → izin ver → geçersiz bir QR okut → "Bu QR mesai kodu değil" toast.

- [ ] **Step 4: Commit**

```bash
git add crm-mobile/src/screens/HomeScreen.js
git commit -m "feat(mesai/mobile): HomeScreen'e MesaiKarti"
```

---

## Task 9: Web — Ofis Konumu sayfası (Oğuz-only)

**Files:**
- Create: `crm-app/src/pages/OfisKonumu.jsx`
- Modify: `crm-app/src/App.jsx` — route
- Modify: `crm-app/src/layouts/MainLayout.jsx` — menu item
- Install: `qrcode.react` (Vite tarafında)

- [ ] **Step 1: qrcode.react install**

```bash
cd crm-app && pnpm add qrcode.react
```

- [ ] **Step 2: Write OfisKonumu.jsx**

```jsx
// crm-app/src/pages/OfisKonumu.jsx
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { Card, Button } from '../components/ui'

function PinSurukle({ konum, onDegistir }) {
  useMapEvents({ click(e) { onDegistir([e.latlng.lat, e.latlng.lng]) } })
  return konum ? <Marker position={konum} /> : null
}

export default function OfisKonumu() {
  const [ofis, setOfis] = useState(null)
  const [konum, setKonum] = useState(null)
  const [tolerans, setTolerans] = useState(150)
  const [qrPayload, setQrPayload] = useState(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    supabase.from('ofis_konumu').select('*').limit(1).single().then(({ data }) => {
      if (data) {
        setOfis(data)
        if (data.lat && data.lng) setKonum([Number(data.lat), Number(data.lng)])
        setTolerans(data.tolerans_metre ?? 150)
      }
    })
  }, [])

  const kaydet = async () => {
    if (!konum) { alert('Haritadan bir nokta seç'); return }
    setKaydediliyor(true)
    const { error } = await supabase.from('ofis_konumu').update({
      lat: konum[0], lng: konum[1], tolerans_metre: tolerans,
      guncelleme_zamani: new Date().toISOString(),
    }).eq('id', ofis.id)
    setKaydediliyor(false)
    if (error) alert('Hata: ' + error.message)
    else alert('Kaydedildi')
  }

  const qrUret = async () => {
    const { data } = await supabase.functions.invoke('mesai-qr-uret', { body: {} })
    if (data?.ok) setQrPayload(data.payload)
    else alert('QR üretilemedi: ' + (data?.hata ?? 'bilinmeyen'))
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 className="t-h1">Ofis Konumu</h1>
      <p className="t-caption">Mesai giriş QR'ının merkezi. Haritada tıkla ya da sürükle.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginTop: 16 }}>
        <Card padding={0} style={{ overflow: 'hidden', minHeight: 460 }}>
          <MapContainer center={konum ?? [39.0, 35.0]} zoom={konum ? 15 : 6}
            style={{ height: 460, width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
            <PinSurukle konum={konum} onDegistir={setKonum} />
          </MapContainer>
        </Card>

        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Seçili koordinat</label>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {konum ? `${konum[0].toFixed(6)}, ${konum[1].toFixed(6)}` : 'Haritadan bir nokta seç'}
              </p>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Tolerans (metre)</label>
              <input type="number" value={tolerans} onChange={e => setTolerans(Number(e.target.value))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border-default)' }} />
            </div>
            <Button onClick={kaydet} disabled={kaydediliyor}>Kaydet</Button>
            <hr />
            <Button variant="secondary" onClick={qrUret}>QR Kodu Üret</Button>
            {qrPayload && (
              <div style={{ textAlign: 'center', padding: 12, background: '#fff', borderRadius: 8 }}>
                <QRCodeSVG value={qrPayload} size={220} />
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, wordBreak: 'break-all' }}>{qrPayload}</p>
                <Button size="sm" variant="secondary" onClick={() => window.print()} style={{ marginTop: 8 }}>Yazdır</Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: App.jsx route ekle**

`crm-app/src/App.jsx` içinde diğer lazy import'ların yanına:

```jsx
const OfisKonumu = lazy(() => import('./pages/OfisKonumu'))
```

Routes içine (OguzGuard ile sarılı — MesaiRapor tarafında Ali de dahil olabilir, ama Ofis Konumu Oğuz-only):

```jsx
<Route path="/ofis-konumu" element={<OguzGuard><OfisKonumu /></OguzGuard>} />
```

- [ ] **Step 4: MainLayout.jsx menü item**

Yönetim grubuna (menuItems array'inde `grup: 'yonetim'` olanların yanına) — Oğuz-only olduğu için OguzGuard sidebar filtresine de bakılır. Mevcut `oguzMu` bayrağı ile:

```jsx
{ ad: 'Ofis Konumu', ikon: MapPin, yol: '/ofis-konumu', modul: null, grup: 'yonetim', sadeceOguz: true },
```

Sidebar filter'a `sadeceOguz` kontrolü ekle (aynı satırda mevcut `yonetimErisimi` yanına):

```jsx
if (m.sadeceOguz && !oguzMu) return false
```

- [ ] **Step 5: Manual test**

Oğuz olarak giriş → sidebar Yönetim > Ofis Konumu → harita açılır → tıkla pin → "Kaydet" → alert → "QR Kodu Üret" → QR görünür → Yazdır → tarayıcı print önizleme.

- [ ] **Step 6: Commit**

```bash
git add crm-app/src/pages/OfisKonumu.jsx crm-app/src/App.jsx crm-app/src/layouts/MainLayout.jsx crm-app/package.json crm-app/pnpm-lock.yaml
git commit -m "feat(mesai): Ofis Konumu sayfası — harita + QR üretim (Oğuz-only)"
```

---

## Task 10: Web — Raporlar > Mesai sekmesi

**Files:**
- Modify: `crm-app/src/pages/Raporlar.jsx`

- [ ] **Step 1: Yeni tab ekle**

Raporlar.jsx içinde tab dizisine ekle (Ali/Oğuz filtreli — regex kontrol ile):

```jsx
const yonetimGorur = /\b(oğuz|oguz|ali)\b/i.test(kullaniciAdi ?? '')
```

Tabs array'ine yönetimGorur true ise:
```jsx
{ id: 'mesai', ad: 'Mesai', icon: Clock }
```

- [ ] **Step 2: Mesai tab içeriği**

Aynı dosya içinde yeni component:

```jsx
function MesaiRaporTab() {
  const [baslangic, setBaslangic] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); d.setHours(0,0,0,0)
    return d.toISOString().slice(0,10)
  })
  const [bitis, setBitis] = useState(() => new Date().toISOString().slice(0,10))
  const [personelIds, setPersonelIds] = useState([])
  const [personelListe, setPersonelListe] = useState([])
  const [kayitlar, setKayitlar] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)

  useEffect(() => {
    supabase.from('kullanicilar').select('id, ad, unvan')
      .contains('moduller', ['mesai_takip']).order('ad')
      .then(({ data }) => setPersonelListe(data ?? []))
  }, [])

  useEffect(() => {
    setYukleniyor(true)
    let q = supabase.from('mesai_kayitlari')
      .select('id, kullanici_id, giris_zamani, cikis_zamani, sure_dakika, not_, kullanicilar(ad,unvan)')
      .gte('giris_zamani', baslangic + 'T00:00:00')
      .lte('giris_zamani', bitis + 'T23:59:59')
      .order('giris_zamani', { ascending: false })
    if (personelIds.length > 0) q = q.in('kullanici_id', personelIds)
    q.then(({ data }) => { setKayitlar(data ?? []); setYukleniyor(false) })
  }, [baslangic, bitis, personelIds])

  const csvIndir = () => {
    const satirlar = [
      ['Tarih', 'Personel', 'Giriş', 'Çıkış', 'Süre (dk)', 'Not'].join(','),
      ...kayitlar.map(k => [
        new Date(k.giris_zamani).toLocaleDateString('tr-TR'),
        `"${k.kullanicilar?.ad ?? ''}"`,
        new Date(k.giris_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}),
        k.cikis_zamani ? new Date(k.cikis_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : 'devam',
        k.sure_dakika ?? '',
        `"${k.not_ ?? ''}"`,
      ].join(',')),
    ].join('\n')
    const blob = new Blob(['﻿' + satirlar], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mesai-${baslangic}-${bitis}.csv`; a.click()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label>Başlangıç</label>
          <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} />
        </div>
        <div>
          <label>Bitiş</label>
          <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label>Personel (boş = hepsi)</label>
          <select multiple value={personelIds} onChange={e => setPersonelIds(Array.from(e.target.selectedOptions).map(o => o.value))}
            style={{ width: '100%', height: 60 }}>
            {personelListe.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
          </select>
        </div>
        <Button onClick={csvIndir}>CSV İndir</Button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-default)' }}>
            <th style={{ textAlign: 'left', padding: 8 }}>Tarih</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Personel</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Giriş</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Çıkış</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Süre</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Not</th>
          </tr>
        </thead>
        <tbody>
          {yukleniyor && <tr><td colSpan={6} style={{ padding: 12 }}>Yükleniyor…</td></tr>}
          {!yukleniyor && kayitlar.length === 0 && <tr><td colSpan={6} style={{ padding: 12 }}>Kayıt yok.</td></tr>}
          {kayitlar.map(k => {
            const suat = k.sure_dakika ? `${String(Math.floor(k.sure_dakika/60)).padStart(2,'0')}:${String(k.sure_dakika%60).padStart(2,'0')}` : 'devam'
            return (
              <tr key={k.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                <td style={{ padding: 8 }}>{new Date(k.giris_zamani).toLocaleDateString('tr-TR')}</td>
                <td style={{ padding: 8 }}>{k.kullanicilar?.ad}</td>
                <td style={{ padding: 8 }}>{new Date(k.giris_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</td>
                <td style={{ padding: 8 }}>{k.cikis_zamani ? new Date(k.cikis_zamani).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                <td style={{ padding: 8 }}>{suat}</td>
                <td style={{ padding: 8, color: 'var(--text-secondary)', fontSize: 12 }}>{k.not_ ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

Tab render'a bağla: `{aktifTab === 'mesai' && <MesaiRaporTab />}`.

- [ ] **Step 3: Manual test**

Ali olarak giriş → Raporlar → Mesai tab → tablo görünür (test verisi yoksa boş). Tarih değiştir, personel seç, CSV indir.

- [ ] **Step 4: Commit**

```bash
git add crm-app/src/pages/Raporlar.jsx
git commit -m "feat(mesai/web): Raporlar > Mesai sekmesi — tablo + filtre + CSV"
```

---

## Task 11: End-to-end doğrulama + push

- [ ] **Step 1: Ofis koordinatı setle**

Oğuz olarak web'e gir → Yönetim > Ofis Konumu → haritadan gerçek ZNA ofis konumunu seç → Kaydet → QR Üret → yazdır → ofis kapısına as.

- [ ] **Step 2: Teknisyen ile canlı test**

Teknisyen telefonundan: HomeScreen → Mesai kartı → Mesaiye Başla → QR okut → GPS izin ver → beklenen: "✅ Mesaiye başladın · Ofise ~5m".

- [ ] **Step 3: Ofis dışı test**

Farklı bir konumdan (evden) aynı QR'ı okut → beklenen: soft blok "Ofis konumundan ~X m uzaktasın".

- [ ] **Step 4: Bitir**

Mesaiyi Bitir → beklenen: "Mesai bitti ✅ Toplam HH:MM".

- [ ] **Step 5: Raporda gör**

Ali/Oğuz web'de → Raporlar > Mesai → yeni satır görünür.

- [ ] **Step 6: Main'e push**

```bash
git push origin claude/adoring-hermann-edb720
# Sonra:
cd C:\Users\MSI-LAPTOP\crm-app
git checkout main && git merge claude/adoring-hermann-edb720 && git push origin main
```

Vercel otomatik deploy. Mobil için ayrı EAS Update Task 8'de zaten yayınlandı.

---

## Spec coverage check

| Spec bölümü | Task |
|---|---|
| 3.1 mesai_kayitlari | 1 |
| 3.2 ofis_konumu | 1 |
| 3.3 RLS | 1 |
| 4 QR HMAC | 2, 5 |
| 5 Mobil akış | 6, 7, 8 |
| 5.4 Realtime | (opsiyonel — YAGNI şimdilik) |
| 6.1 Raporlar > Mesai | 10 |
| 6.2 Ofis Konumu sayfası | 9 |
| 7.1 mesai-giris | 3 |
| 7.2 mesai-cikis | 4 |
| 7.3 mesai-qr-uret | 5 |
| 8 Migration 083 | 1 |
| 9 Güvenlik | 1 (RLS) + 2 (secret) |

Realtime sync spec'te vardı ama karta canlı sayaç için setInterval yeterli — Realtime YAGNI, sonra ihtiyaç olursa eklenir.
