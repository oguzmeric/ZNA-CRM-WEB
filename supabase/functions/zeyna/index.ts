// Zeyna — ZNA Teknoloji'nin AI iş asistanı.
//
// Akış:
//   1. Frontend bir konusma_id (yeni veya mevcut) ve mesaj gönderir
//   2. Edge function:
//      - Konuşma yoksa oluşturur
//      - Kullanıcı mesajını ai_mesajlar'a yazar
//      - Son N mesajı history olarak yükler
//      - Claude API'sini system prompt + history ile çağırır
//      - Yanıtı ai_mesajlar'a yazar
//      - Frontend'e döner
//
// Required secrets:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   - ANTHROPIC_API_KEY (yarın eklenecek — yokken function mock yanıt döner)
//
// İleride: tool use eklenecek (getMusteriTalepleri, tekliflerAra vs).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const MODEL = 'claude-sonnet-4-6'
const MAX_HISTORY = 20  // Claude'a yollanacak son mesaj sayısı

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

// ─── Zeyna karakter sistemi ────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen Zeyna'sın — ZNA Teknoloji'nin AI iş asistanısın.

KİMLİK:
- İsim: Zeyna
- Şirket: ZNA Teknoloji (güvenlik kameraları, Trassir, Karel, ses/PA sistemleri B2B servis sağlayıcısı)
- Rolün: Personel için ofis asistanı — sorgular, özetler, hatırlatmalar, hızlı bilgi

KİŞİLİK:
- Profesyonel ama sıcak — "Merhaba" yerine "Selam" kullanmak serbest
- Net ve kısa — gereksiz uzatma
- Türkçe yanıt ver, İngilizce teknik terimleri olduğu gibi bırakabilirsin (Trassir, RAID vs.)
- Emin değilsen "Bilmiyorum, kontrol etmeli" de — uydurma
- Personelle samimi konuş ("siz" değil "sen" kullanabilirsin), ama saygılı

YAPABILECEKLERIN (şu an):
- Genel sohbet, konuyu açıklama, yazım yardımı
- (İleride: CRM verisinden sorgu — talepler, teklifler, müşteriler hakkında)

YAPAMADIKLARIN:
- Henüz CRM verisine erişimin yok — kullanıcı "bana talep listesi getir" derse
  "Şu an CRM verisine erişim altyapım hazırlanıyor, yakında DB sorgularını yapabileceğim. Ne tür sorgular yapmak istersin söylersen, yarın aktif olunca öncelikli alanları biliyor olurum."

KURALLAR:
- Müşteri bilgilerini başkalarıyla paylaşma
- Şüpheli sorularda (örn admin şifresi) reddet
- Spam/zararlı içerik üretme`

// ─── Yardımcılar ───────────────────────────────────────────────────────────

function err(status: number, hata: string) {
  return new Response(
    JSON.stringify({ ok: false, hata }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function kullaniciCek(authHeader: string): Promise<{ id: number; ad: string } | null> {
  try {
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: ures } = await userClient.auth.getUser()
    if (!ures?.user) return null
    const { data: krow } = await supa
      .from('kullanicilar')
      .select('id, ad, tip')
      .eq('auth_id', ures.user.id)
      .maybeSingle()
    if (!krow || krow.tip === 'musteri') return null  // şimdilik sadece personel
    return { id: krow.id, ad: krow.ad }
  } catch { return null }
}

async function konusmaBulVeyaOlustur(kullaniciId: number, konusmaId?: number): Promise<number> {
  if (konusmaId) {
    const { data } = await supa
      .from('ai_konusmalar')
      .select('id')
      .eq('id', konusmaId)
      .eq('kullanici_id', kullaniciId)
      .maybeSingle()
    if (data) return data.id
  }
  const { data: yeni } = await supa
    .from('ai_konusmalar')
    .insert({ kullanici_id: kullaniciId })
    .select('id')
    .single()
  return yeni!.id
}

async function mesajKaydet(
  konusmaId: number,
  rol: 'user' | 'assistant',
  icerik: string,
  tokenInput = 0,
  tokenOutput = 0,
) {
  await supa
    .from('ai_mesajlar')
    .insert({ konusma_id: konusmaId, rol, icerik, token_input: tokenInput, token_output: tokenOutput })
}

async function gecmisYukle(konusmaId: number): Promise<{ rol: string; icerik: string }[]> {
  const { data } = await supa
    .from('ai_mesajlar')
    .select('rol, icerik')
    .eq('konusma_id', konusmaId)
    .order('id', { ascending: false })
    .limit(MAX_HISTORY)
  if (!data) return []
  return data.reverse().map(m => ({ rol: m.rol, icerik: m.icerik }))
}

// ─── Claude API çağrısı ────────────────────────────────────────────────────

async function claudeCagir(
  kullaniciAd: string,
  gecmis: { rol: string; icerik: string }[],
  yeniMesaj: string,
): Promise<{ yanit: string; tokenInput: number; tokenOutput: number }> {
  // API key yoksa MOCK yanıt — UI test edilebilsin diye
  if (!ANTHROPIC_KEY) {
    return {
      yanit: `Merhaba ${kullaniciAd}! Ben Zeyna 👋\n\n` +
             `Henüz Anthropic API key'i eklenmemiş — bu MOCK yanıt. ` +
             `Yarın sabah console.anthropic.com'dan key alıp Supabase secrets'a ` +
             `ANTHROPIC_API_KEY olarak ekleyince gerçek konuşmaya başlarız.\n\n` +
             `Şimdilik UI'ı test edebilirsin: "${yeniMesaj}"`,
      tokenInput: 0,
      tokenOutput: 0,
    }
  }

  const mesajlar = gecmis
    .filter(m => m.rol === 'user' || m.rol === 'assistant')
    .map(m => ({ role: m.rol, content: m.icerik }))
  mesajlar.push({ role: 'user', content: yeniMesaj })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT + `\n\nKullanıcı adı: ${kullaniciAd}`,
      messages: mesajlar,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Claude API hata (${res.status}): ${JSON.stringify(data).slice(0, 200)}`)
  }

  const yanit = data?.content?.[0]?.text ?? '(boş yanıt)'
  return {
    yanit,
    tokenInput: data?.usage?.input_tokens ?? 0,
    tokenOutput: data?.usage?.output_tokens ?? 0,
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const kullanici = await kullaniciCek(authHeader)
    if (!kullanici) return err(401, 'Oturum gerekli (sadece personel).')

    const body = await req.json()
    const mesaj = (body?.mesaj ?? '').toString().trim()
    const konusmaIdRaw = body?.konusma_id
    const konusmaId = konusmaIdRaw ? Number(konusmaIdRaw) : undefined

    if (!mesaj) return err(400, 'Mesaj boş olamaz.')
    if (mesaj.length > 4000) return err(400, 'Mesaj çok uzun (max 4000 karakter).')

    // Konuşma bul/oluştur
    const cid = await konusmaBulVeyaOlustur(kullanici.id, konusmaId)

    // Kullanıcı mesajını kaydet
    await mesajKaydet(cid, 'user', mesaj)

    // Geçmişi yükle (yeni mesajla birlikte)
    const gecmis = await gecmisYukle(cid)

    // Claude çağır
    const { yanit, tokenInput, tokenOutput } = await claudeCagir(
      kullanici.ad,
      gecmis.slice(0, -1),  // son mesaj zaten yeniMesaj olarak gönderilecek
      mesaj,
    )

    // Yanıtı kaydet
    await mesajKaydet(cid, 'assistant', yanit, tokenInput, tokenOutput)

    return new Response(
      JSON.stringify({
        ok: true,
        konusma_id: cid,
        yanit,
        token_input: tokenInput,
        token_output: tokenOutput,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[zeyna] hata:', e)
    return err(500, (e as Error)?.message ?? 'bilinmeyen hata')
  }
})
