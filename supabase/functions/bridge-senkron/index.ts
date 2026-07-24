// bridge-senkron — Başakşehir Belediyesi Bridge Task Operation API çekimi.
//
// Kapsam (Seçenek A, read-only): 10 dk'da bir getTaskList ile ZNA taleplerini
// çeker, bridge_talepler'e upsert eder. Bridge'e YAZMA yok (updateTaskProgress /
// insertTaskComment ileride).
//
// Oturum: bridge_senkron_durum tek satırında sessionId+memberId saklanır (kayan
// pencere; her başarılı istek yeniler). Kod 3/4/6 gelirse BİR KEZ yeniden giriş
// + isteği tekrarla. proxyMemberId=null (kılavuz teyitli), platform=3rdParty.
//
// BLOKAJ: getTaskList için ZNA görev tipi filtresi (taskTypeIdList) gerekir —
// sistemde 4,3M talep var. Değerler gelene kadar 'liste' modu KAPALI; sadece
// 'test' modu (tek kayıt getTask/getTaskCommentList) çalışır.
//
// Env: BRIDGE_URL, BRIDGE_USERNAME, BRIDGE_PASSWORD, BRIDGE_COMPANY_ID,
//      BRIDGE_PLATFORM (default 3rdParty), BRIDGE_TASK_TYPE_IDS (virgüllü, ZNA
//      süzgeci — boşsa toplu çekim kapalı), BRIDGE_CRON_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BRIDGE_URL = Deno.env.get('BRIDGE_URL') ?? 'https://ortakapi.basaksehir.bel.tr/http'
const COMPANY_ID = parseInt(Deno.env.get('BRIDGE_COMPANY_ID') ?? '3433', 10)
const PLATFORM = Deno.env.get('BRIDGE_PLATFORM') ?? '3rdParty'
// Bilinen test kayıtları (kılavuz/belediye): yazma testi 4392945, yorum 3471674.
const TEST_TASK_ID = 4392945
const TEST_COMMENT_TASK_ID = 3471674

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Bridge cevabı UTC ("…Z") ISO string döner; boş/geçersizse null.
const dt = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim()) ? v : null
const num = (v: unknown): number | null =>
  typeof v === 'number' ? v : (v != null && v !== '' && !isNaN(parseFloat(String(v))) ? parseFloat(String(v)) : null)

// İstanbul yerel saati (filtre tarihleri TR yerel, "…Z" YOK). Edge fn UTC koşar → +3.
function istanbulIso(d: Date): string {
  const t = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  return t.toISOString().replace(/\.\d{3}Z$/, '').replace('Z', '')
}

type Session = { sessionId: string; memberId: number }

async function bridgeAuth(): Promise<Session> {
  const username = Deno.env.get('BRIDGE_USERNAME')
  const password = Deno.env.get('BRIDGE_PASSWORD')
  if (!username || !password) throw new Error('kredensiyel_yok (BRIDGE_USERNAME/PASSWORD secret gerekli)')
  const r = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'authenticateMemberForExternalApi',
      params: { username, password, language: 'tr' },
      SP: { currentCompanyId: COMPANY_ID, platform: PLATFORM, language: 'tr' },
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (j?.code !== 0 || !j?.data?.sessionId) {
    throw new Error(`auth_kod_${j?.code ?? '?'}: ${j?.description ?? 'oturum acilamadi'}`)
  }
  return { sessionId: j.data.sessionId, memberId: j.data.id }
}

// Tek Bridge çağrısı; kod 3/4/6'da bir kez yeniden giriş + tekrar.
async function bridgeCall(
  action: string,
  params: Record<string, unknown>,
  ctx: { session: Session; svc: any },
): Promise<any> {
  const doFetch = async (s: Session) => {
    const r = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        params,
        SP: {
          currentCompanyId: COMPANY_ID,
          originatorMemberId: s.memberId,
          proxyMemberId: null,
          sessionId: s.sessionId,
          platform: PLATFORM,
          language: 'tr',
        },
      }),
    })
    return await r.json().catch(() => ({ code: -1, description: 'json_parse_hata' }))
  }

  let j = await doFetch(ctx.session)
  if (j?.code === 3 || j?.code === 4 || j?.code === 6) {
    // Oturum düştü/taşındı → bir kez yeniden giriş + tekrar.
    const s = await bridgeAuth()
    ctx.session = s
    await persistSession(ctx.svc, s)
    j = await doFetch(s)
  }
  return j
}

async function persistSession(svc: any, s: Session) {
  await svc.from('bridge_senkron_durum').update({
    session_id: s.sessionId,
    member_id: s.memberId,
    oturum_tarih: new Date().toISOString(),
    guncelleme_tarih: new Date().toISOString(),
  }).eq('id', 1)
}

async function getSession(svc: any): Promise<Session> {
  const { data } = await svc.from('bridge_senkron_durum')
    .select('session_id, member_id').eq('id', 1).maybeSingle()
  if (data?.session_id && data?.member_id) {
    return { sessionId: data.session_id, memberId: data.member_id }
  }
  const s = await bridgeAuth()
  await persistSession(svc, s)
  return s
}

// Bridge task kaydı → bridge_talepler satırı (KVKK: collocutor* kişisel alanlar ALINMAZ).
function mapTask(t: any) {
  return {
    bridge_task_id: t.id,
    task_serial_number: t.taskSerialNumber ?? null,
    subject: t.subject ?? null,
    content: t.content ?? null,
    content_is_html: !!t.contentIsHtml,
    task_type_id: t.taskType?.id ?? t.taskTypeId ?? null,
    task_type_description: t.taskType?.description ?? t.taskTypeDescription ?? null,
    task_status_id: t.taskStatusId ?? t.taskStatus?.id ?? null,
    task_status_description: t.taskStatusDescription ?? t.taskStatus?.description ?? null,
    closed_task_status_id: t.closedTaskStatusId ?? null,
    closed_task_status_description: t.closedTaskStatusDescription ?? null,
    department_description: t.departmentDescription ?? t.department?.description ?? null,
    task_source_channel_description: t.taskSourceChannelDescription ?? null,
    priority_description: t.priorityDescription ?? t.priority?.description ?? null,
    insert_datetime: dt(t.insertDatetime),
    deadline: dt(t.deadline),
    completed_datetime: dt(t.completedDatetime),
    completed_percent: t.completedPercent ?? null,
    comment_count: t.commentCount ?? null,
    last_comment: typeof t.lastComment === 'string' ? t.lastComment : (t.lastComment?.content ?? null),
    city: t.city ?? null,
    town: t.town ?? null,
    district: t.district ?? null,
    task_address: t.taskAddress ?? null,
    latitude: num(t.latitude),
    longitude: num(t.longitude),
    son_senkron_tarih: new Date().toISOString(),
  }
}

// crm_* alanları payload'da YOK → upsert insert'te default 'yeni', update'te korunur.
async function upsertTasks(svc: any, tasks: any[]): Promise<number> {
  if (!tasks.length) return 0
  const payload = tasks.filter((t) => t?.id != null).map(mapTask)
  if (!payload.length) return 0
  const { error } = await svc.from('bridge_talepler')
    .upsert(payload, { onConflict: 'bridge_task_id' })
  if (error) throw new Error('db_upsert: ' + error.message)
  return payload.length
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))
    const mod = body.mod ?? 'test'   // 'test' | 'liste'

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Yetki: cron X-Cron-Secret ile; kullanıcılar staff JWT ile.
    const cronSecret = req.headers.get('X-Cron-Secret')
    const cronMu = !!cronSecret && cronSecret === Deno.env.get('BRIDGE_CRON_SECRET')
    if (!cronMu) {
      const authHeader = req.headers.get('Authorization') ?? ''
      if (!authHeader) return json({ ok: false, hata: 'yetkisiz' }, 401)
      const usr = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: authRes } = await usr.auth.getUser()
      if (!authRes?.user) return json({ ok: false, hata: 'yetkisiz' }, 401)
      const { data: kul } = await svc
        .from('kullanicilar').select('rol').eq('auth_id', authRes.user.id).maybeSingle()
      const staff = !!kul && (kul.rol === 'admin' || kul.rol === 'personel')
      if (!staff) return json({ ok: false, hata: 'yetkisiz' }, 403)
    }

    const session = await getSession(svc)
    const ctx = { session, svc }

    // ---- TEST MODU: tek kayıt okuma (filtre gerektirmez) ---------------------
    if (mod === 'test') {
      const taskId = body.taskId ?? TEST_TASK_ID
      const commentTaskId = body.commentTaskId ?? TEST_COMMENT_TASK_ID

      const detay = await bridgeCall('getTask', { id: taskId }, ctx)
      const yorumlar = await bridgeCall('getTaskCommentList', { taskId: commentTaskId }, ctx)

      let kaydedildi = 0
      const task = detay?.data?.task ?? detay?.data ?? null
      if (detay?.code === 0 && task?.id) {
        kaydedildi = await upsertTasks(svc, [task])
      }

      await svc.from('bridge_senkron_durum').update({
        son_calisma_tarih: new Date().toISOString(),
        son_sonuc: `test: getTask kod ${detay?.code}, yorum kod ${yorumlar?.code}, kaydedilen ${kaydedildi}`,
        guncelleme_tarih: new Date().toISOString(),
      }).eq('id', 1)

      return json({
        ok: detay?.code === 0,
        mod: 'test',
        getTask: {
          code: detay?.code, description: detay?.description,
          alanlar: task ? Object.keys(task) : null,
          eslenen: task ? mapTask(task) : null,
        },
        getTaskCommentList: {
          code: yorumlar?.code, description: yorumlar?.description,
          adet: Array.isArray(yorumlar?.data) ? yorumlar.data.length : null,
          ornekAlanlar: Array.isArray(yorumlar?.data) && yorumlar.data[0]
            ? Object.keys(yorumlar.data[0]) : null,
        },
        kaydedildi,
      })
    }

    // ---- LİSTE MODU: toplu çekim (GATED — taskTypeIdList şart) ---------------
    const filtreRaw = body.taskTypeIdList ?? Deno.env.get('BRIDGE_TASK_TYPE_IDS') ?? ''
    const taskTypeIdList = String(filtreRaw)
      .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    if (!taskTypeIdList.length) {
      return json({
        ok: false,
        hata: 'filtre_yok',
        aciklama: 'ZNA taskTypeIdList degerleri gelmeden toplu cekim kapali (4,3M talep). ' +
                  'BRIDGE_TASK_TYPE_IDS secret set edilince acilir.',
      }, 409)
    }

    const now = new Date()
    const { data: durum } = await svc.from('bridge_senkron_durum')
      .select('son_watermark').eq('id', 1).maybeSingle()
    // Sınır kaçırmamak için watermark'ı 10 dk geri al (belediye önerisi).
    const beginSrc = durum?.son_watermark
      ? new Date(new Date(durum.son_watermark).getTime() - 10 * 60 * 1000)
      : new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const pageSize = 25
    let pageNumber = 1
    let toplamCekilen = 0
    let toplamKaydedilen = 0
    let count = 0
    // Sayfalama: pageSize dolu geldiği sürece devam (max 40 sayfa güvenlik tavanı).
    while (pageNumber <= 40) {
      const res = await bridgeCall('getTaskList', {
        insertDate: { beginDate: istanbulIso(beginSrc), endDate: istanbulIso(now) },
        taskStatusIdList: null,
        taskTypeIdList,
        departmentIdList: null,
        pageNumber,
        pageSize,
        sortColumn: 'insertDate',
        sortWay: 'DESC',
        searchKeyword: null,
      }, ctx)
      if (res?.code !== 0) {
        return json({ ok: false, hata: `getTaskList kod ${res?.code}`, aciklama: res?.description }, 502)
      }
      const list = res?.data?.list ?? []
      count = res?.data?.count ?? count
      if (!Array.isArray(list) || !list.length) break
      toplamCekilen += list.length
      toplamKaydedilen += await upsertTasks(svc, list)
      if (list.length < pageSize) break
      pageNumber++
    }

    await svc.from('bridge_senkron_durum').update({
      son_watermark: now.toISOString(),
      son_calisma_tarih: now.toISOString(),
      son_sonuc: `liste: ${toplamKaydedilen}/${toplamCekilen} kaydedildi (toplam ${count})`,
      guncelleme_tarih: now.toISOString(),
    }).eq('id', 1)

    return json({
      ok: true, mod: 'liste',
      cekilen: toplamCekilen, kaydedilen: toplamKaydedilen, uzakToplam: count,
    })
  } catch (e) {
    return json({ ok: false, hata: String((e as any)?.message ?? e) }, 500)
  }
})
