// Zeyna — ZNA Teknoloji'nin AI iş asistanı.
//
// Akış (agentic loop):
//   1. Kullanıcı mesajı geldi
//   2. Claude'a system prompt + history + tools listesi gönder
//   3. Claude tool_use isterse: tool'u çalıştır, sonucu Claude'a geri ver, 2'ye dön
//   4. Claude text döndüğünde: yanıtı DB'ye kaydet ve kullanıcıya gönder
//
// Required secrets:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   - ANTHROPIC_API_KEY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const MODEL = 'claude-sonnet-4-6'
const MAX_HISTORY = 20
const MAX_TOOL_LOOPS = 6   // agentic loop güvenlik (kötü tool çağrısı sonsuz dönmesin)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // supabase-js yeni surumler x-supabase-api-version, x-supabase-auth-token gibi
  // header'lar da yolluyor — '*' veya genis liste kullanmak lazim
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-auth-token, accept, accept-language',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE)

// ─── Zeyna karakter sistemi ────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen Zeyna'sın — ZNA Teknoloji'nin AI iş asistanısın.

KİMLİK:
- İsim: Zeyna
- Şirket: ZNA Teknoloji (güvenlik kameraları, Trassir, Karel, ses/PA sistemleri B2B servis sağlayıcısı)
- Rolün: Personel için ofis asistanı — sorgular, özetler, hatırlatmalar, hızlı bilgi

KİŞİLİK:
- Profesyonel ama sıcak — samimi ol
- Net ve kısa — gereksiz uzatma
- Türkçe yanıt ver, İngilizce teknik terimler (Trassir, RAID) olduğu gibi kalabilir
- Emin değilsen "Bilmiyorum, kontrol edeyim" de — uydurma
- Personelle "sen" diliyle konuş, ama saygılı

YAPABILECEKLERIN:
- Genel sohbet, yazım yardımı, brainstorm, kontrol listesi
- CRM sorgularını TOOL'larla yap: müşteri ara, talep listele, teklif ara, açık işlerini gör
- Tool'ları gerçekten çağır — kullanıcı "Talay'ın açık talepleri" derse musteri_ara('Talay') sonra musteri_talepleri(id, durum='acik') yap
- Sonuçları Türkçe özetle, **tabloya gerek yoksa liste** olarak ver
- Para birimi varsa "₺ 25.000,00" formatı kullan

KURALLAR:
- Müşterinin telefonu/maili gibi PII'yi gereksiz yere açıkça yazma
- Şüpheli sorularda (admin şifresi, başkasının verisi vs) reddet
- Hata olursa kullanıcıya açıkla, sessizce yutma`

// ─── Tools — Claude'a verilecek fonksiyon tanımları ───────────────────────
const TOOLS = [
  {
    name: 'musteri_ara',
    description:
      'Müşteri (firma veya kişi) ara. Kullanıcı bir müşteri ismi söylediğinde önce bunu çağır, döndürülen müşteri_id\'leri sonraki sorguda kullan. Fuzzy arama yapar (büyük/küçük harf, kısmi eşleşme).',
    input_schema: {
      type: 'object',
      properties: {
        arama: { type: 'string', description: 'Aranacak metin — firma, ad, soyad veya bunların parçaları' },
        limit: { type: 'number', description: 'Maks sonuç sayısı (varsayılan 10)' },
      },
      required: ['arama'],
    },
  },
  {
    name: 'kullanici_ara',
    description: 'Personel (kullanıcı) ara — ad veya soyada göre. "Ferdi\'nin görevleri" gibi sorularda önce bunu çağır.',
    input_schema: {
      type: 'object',
      properties: {
        arama: { type: 'string', description: 'Personel adı/soyadı' },
        limit: { type: 'number', description: 'Maks sonuç (varsayılan 10)' },
      },
      required: ['arama'],
    },
  },
  {
    name: 'musteri_talepleri',
    description: 'Bir müşterinin servis taleplerini getir. musteri_id\'yi musteri_ara\'dan al.',
    input_schema: {
      type: 'object',
      properties: {
        musteri_id: { type: 'number', description: 'Müşteri ID (musteri_ara\'dan)' },
        durum: {
          type: 'string',
          description: "Durum filtresi — 'acik' (tamamlanmamış olanlar), 'tamamlandi', veya boş bırak (tümü)",
        },
        limit: { type: 'number', description: 'Maks sonuç (varsayılan 20)' },
      },
      required: ['musteri_id'],
    },
  },
  {
    name: 'teklifler_ara',
    description:
      'Teklifleri ara. Firma adı, durum, tarih aralığı ile filtrelenebilir. Hiç filtre verilmezse en son 10 teklif döner.',
    input_schema: {
      type: 'object',
      properties: {
        firma: { type: 'string', description: 'Firma adı (kısmi eşleşme)' },
        durum: { type: 'string', description: 'kabul / takipte / revizyon / vazgecildi' },
        tarih_baslangic: { type: 'string', description: 'YYYY-MM-DD' },
        tarih_bitis:     { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Maks sonuç (varsayılan 10)' },
      },
    },
  },
  {
    name: 'bekleyen_servislerim',
    description:
      'Çağıran personele atanmış açık servis talepleri (tamamlanmamış). "Bana atanmış işler" / "yapmam gerekenler" gibi sorularda kullan.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maks sonuç (varsayılan 20)' },
      },
    },
  },
]

// ─── Tool execution — DB sorguları ───────────────────────────────────────

interface ToolContext { kullaniciId: number; kullaniciAd: string }

async function toolCalistir(
  ad: string,
  girdi: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (ad) {
    case 'musteri_ara': {
      const q = String(girdi.arama ?? '').trim()
      const limit = Number(girdi.limit ?? 10)
      if (!q) return { hata: 'Arama metni boş' }
      const { data, error } = await supa
        .from('musteriler')
        .select('id, firma, ad, soyad, telefon, email, sehir')
        .or(`firma.ilike.%${q}%,ad.ilike.%${q}%,soyad.ilike.%${q}%`)
        .limit(limit)
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, musteriler: data ?? [] }
    }

    case 'kullanici_ara': {
      const q = String(girdi.arama ?? '').trim()
      const limit = Number(girdi.limit ?? 10)
      if (!q) return { hata: 'Arama metni boş' }
      const { data, error } = await supa
        .from('kullanicilar')
        .select('id, ad, soyad, kullanici_adi, tip, durum')
        .neq('tip', 'musteri')
        .or(`ad.ilike.%${q}%,soyad.ilike.%${q}%,kullanici_adi.ilike.%${q}%`)
        .limit(limit)
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, kullanicilar: data ?? [] }
    }

    case 'musteri_talepleri': {
      const musteriId = Number(girdi.musteri_id)
      const durum = String(girdi.durum ?? '').toLowerCase()
      const limit = Number(girdi.limit ?? 20)
      if (!musteriId) return { hata: 'musteri_id gerekli' }
      let q = supa
        .from('servis_talepleri')
        .select('id, talep_no, konu, durum, aciliyet, ana_tur, atanan_kullanici_ad, olusturma_tarihi, planli_tarih')
        .eq('musteri_id', musteriId)
        .order('olusturma_tarihi', { ascending: false })
        .limit(limit)
      if (durum === 'acik') {
        q = q.not('durum', 'in', '("tamamlandi","iptal")')
      } else if (durum) {
        q = q.eq('durum', durum)
      }
      const { data, error } = await q
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, talepler: data ?? [] }
    }

    case 'teklifler_ara': {
      const firma = String(girdi.firma ?? '').trim()
      const durum = String(girdi.durum ?? '').trim()
      const limit = Number(girdi.limit ?? 10)
      const tarihBas = girdi.tarih_baslangic
      const tarihBit = girdi.tarih_bitis
      let q = supa
        .from('teklifler')
        .select('id, teklif_no, firma_adi, musteri_yetkilisi, konu, durum, para_birimi, genel_toplam, tarih, olusturma_tarih')
        .order('olusturma_tarih', { ascending: false })
        .limit(limit)
      if (firma) q = q.ilike('firma_adi', `%${firma}%`)
      if (durum) q = q.eq('durum', durum)
      if (tarihBas) q = q.gte('tarih', String(tarihBas))
      if (tarihBit) q = q.lte('tarih', String(tarihBit))
      const { data, error } = await q
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, teklifler: data ?? [] }
    }

    case 'bekleyen_servislerim': {
      const limit = Number(girdi.limit ?? 20)
      const { data, error } = await supa
        .from('servis_talepleri')
        .select('id, talep_no, firma_adi, musteri_ad, konu, durum, aciliyet, olusturma_tarihi, planli_tarih')
        .eq('atanan_kullanici_id', ctx.kullaniciId)
        .not('durum', 'in', '("tamamlandi","iptal")')
        .order('olusturma_tarihi', { ascending: false })
        .limit(limit)
      if (error) return { hata: error.message }
      return { sonuc_sayisi: data?.length ?? 0, talepler: data ?? [] }
    }

    default:
      return { hata: `Bilinmeyen tool: ${ad}` }
  }
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────

function err(status: number, hata: string) {
  return new Response(
    JSON.stringify({ ok: false, hata }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function kullaniciCek(authHeader: string): Promise<ToolContext | null> {
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
    if (!krow || krow.tip === 'musteri') return null
    return { kullaniciId: krow.id, kullaniciAd: krow.ad }
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

async function mesajKaydet(args: {
  konusmaId: number
  rol: 'user' | 'assistant' | 'tool'
  icerik: string
  toolKullanildi?: string | null
  toolInput?: unknown
  toolOutput?: unknown
  tokenInput?: number
  tokenOutput?: number
}) {
  await supa.from('ai_mesajlar').insert({
    konusma_id: args.konusmaId,
    rol: args.rol,
    icerik: args.icerik,
    tool_kullanildi: args.toolKullanildi ?? null,
    tool_input: args.toolInput ?? null,
    tool_output: args.toolOutput ?? null,
    token_input: args.tokenInput ?? 0,
    token_output: args.tokenOutput ?? 0,
  })
}

async function gecmisYukle(konusmaId: number): Promise<{ rol: string; icerik: string }[]> {
  const { data } = await supa
    .from('ai_mesajlar')
    .select('rol, icerik')
    .eq('konusma_id', konusmaId)
    .in('rol', ['user', 'assistant'])
    .order('id', { ascending: false })
    .limit(MAX_HISTORY)
  if (!data) return []
  return data.reverse().map(m => ({ rol: m.rol, icerik: m.icerik }))
}

// ─── Claude agentic loop ───────────────────────────────────────────────────

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string }
  >
}

async function claudeIste(
  messages: AnthropicMessage[],
  kullaniciAd: string,
): Promise<{
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}> {
  if (!ANTHROPIC_KEY) {
    throw new Error('ANTHROPIC_API_KEY secret eksik. Supabase secrets\'a ekle.')
  }
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
      tools: TOOLS,
      messages,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Claude API (${res.status}): ${JSON.stringify(data).slice(0, 250)}`)
  }
  return data
}

async function agenticLoop(
  ilkMesajlar: AnthropicMessage[],
  ctx: ToolContext,
  konusmaId: number,
): Promise<{ yanit: string; tokenInput: number; tokenOutput: number }> {
  const messages = [...ilkMesajlar]
  let toplamIn = 0
  let toplamOut = 0

  for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
    const sonuc = await claudeIste(messages, ctx.kullaniciAd)
    toplamIn += sonuc.usage?.input_tokens ?? 0
    toplamOut += sonuc.usage?.output_tokens ?? 0

    // stop_reason 'tool_use' ise tool çağrılarını işle ve devam et
    if (sonuc.stop_reason === 'tool_use') {
      // Assistant mesajını history'ye ekle
      messages.push({ role: 'assistant', content: sonuc.content as any })

      // Her tool_use için çalıştır
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
      for (const blok of sonuc.content) {
        if (blok.type !== 'tool_use') continue
        const toolAd = blok.name ?? ''
        const toolGirdi = blok.input ?? {}
        console.log(`[zeyna] tool: ${toolAd}`, toolGirdi)
        const ciktirsd = await toolCalistir(toolAd, toolGirdi as Record<string, unknown>, ctx)
        const ciktiStr = JSON.stringify(ciktirsd)

        // DB'ye tool çağrısını kaydet (görünürlük için)
        await mesajKaydet({
          konusmaId,
          rol: 'tool',
          icerik: `Tool çağrıldı: ${toolAd}`,
          toolKullanildi: toolAd,
          toolInput: toolGirdi,
          toolOutput: ciktirsd,
        })

        toolResults.push({
          type: 'tool_result',
          tool_use_id: blok.id ?? '',
          content: ciktiStr,
        })
      }

      // Tool sonuçlarını user mesajı olarak ekle
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    // stop_reason 'end_turn' veya 'max_tokens' — text yanıtı al ve dön
    const textBlock = sonuc.content.find(b => b.type === 'text')
    const yanit = textBlock?.text ?? '(boş yanıt)'
    return { yanit, tokenInput: toplamIn, tokenOutput: toplamOut }
  }

  // Loop sınırına ulaşıldı
  return {
    yanit: 'Üzgünüm, sorunu çözmek için çok fazla adım gerekti. Daha spesifik sorabilir misin?',
    tokenInput: toplamIn,
    tokenOutput: toplamOut,
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const ctx = await kullaniciCek(authHeader)
    if (!ctx) return err(401, 'Oturum gerekli (sadece personel).')

    const body = await req.json()
    const mesaj = (body?.mesaj ?? '').toString().trim()
    const konusmaIdRaw = body?.konusma_id
    const konusmaId = konusmaIdRaw ? Number(konusmaIdRaw) : undefined

    if (!mesaj) return err(400, 'Mesaj boş olamaz.')
    if (mesaj.length > 4000) return err(400, 'Mesaj çok uzun (max 4000 karakter).')

    // Konuşma bul/oluştur
    const cid = await konusmaBulVeyaOlustur(ctx.kullaniciId, konusmaId)

    // Kullanıcı mesajını kaydet
    await mesajKaydet({ konusmaId: cid, rol: 'user', icerik: mesaj })

    // Geçmişi yükle (kullanıcı + asistan mesajları — tool mesajları skip)
    const gecmis = await gecmisYukle(cid)

    // Claude'a gönderilecek messages — gecmis zaten yeni mesajı içeriyor
    const messages: AnthropicMessage[] = gecmis.map(m => ({
      role: m.rol as 'user' | 'assistant',
      content: m.icerik,
    }))

    // Agentic loop
    const { yanit, tokenInput, tokenOutput } = await agenticLoop(messages, ctx, cid)

    // Asistan yanıtını kaydet
    await mesajKaydet({
      konusmaId: cid,
      rol: 'assistant',
      icerik: yanit,
      tokenInput,
      tokenOutput,
    })

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
