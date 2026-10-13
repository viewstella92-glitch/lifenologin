import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Free tier: key from Google AI Studio. Models are tried in order; the first that answers wins.
// Set GEMINI_MODEL to put your own choice first. (Gemini 2.5 models are scheduled to shut down on 2026-10-16.)
const MODELS = [process.env.GEMINI_MODEL, 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'].filter(Boolean) as string[]
const DAILY_LIMIT = 30 // AI calls per day, shared (there is no login)

type ModelResult = { ok: boolean; status: number; text?: string; error?: string }

async function callModel(model: string, system: string, user: string, max: number, timeoutMs = 25000): Promise<ModelResult> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY!, // server-only, never NEXT_PUBLIC_
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        // extra room because some models spend output tokens on internal thinking
        generationConfig: { maxOutputTokens: max + 2000, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!r.ok) return { ok: false, status: r.status, error: (await r.text()).slice(0, 200) }
    const j = await r.json()
    const text = ((j.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map((p) => p.text ?? '').join('')
    return text.trim() ? { ok: true, status: 200, text } : { ok: false, status: 200, error: 'empty reply' }
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' }
  }
}

async function ai(system: string, user: string, max: number) {
  let last = 'no model tried'
  for (const model of MODELS) {
    const res = await callModel(model, system, user, max)
    if (res.ok) return res.text as string
    last = `${model}: ${res.status} ${res.error}`
    console.error('Gemini failed ->', last)
  }
  throw new Error(last)
}

export async function POST(req: NextRequest) {
  // โหมดไม่มี login: ใช้ anon key ตรงๆ (นโยบายฐานข้อมูลเปิดให้ใช้ร่วมกัน)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const { count } = await sb
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .gte('used_at', new Date().toISOString().slice(0, 10))
  if ((count ?? 0) >= DAILY_LIMIT) return NextResponse.json({ error: 'วันนี้ใช้ AI ครบโควตาแล้ว พรุ่งนี้ลองใหม่นะ' }, { status: 429 })
  const body = await req.json()
  try {
    if (body.mode === 'parse') {
      const cats = (body.cats ?? []) as { id: string; name: string; type: string }[]
      const out = await ai(
        'แปลงข้อความภาษาไทยเป็นรายการรายรับรายจ่าย ตอบเป็น JSON เท่านั้น ห้ามมีคำอธิบายหรือ markdown รูปแบบ ' +
          '{"type":"income|expense","amount":จำนวนบาทเป็นตัวเลข,"category_id":"id จากรายการหมวดที่ให้ หรือ null","note":"โน้ตสั้นๆ หรือ null","date":"YYYY-MM-DD"} ' +
          'ถ้าไม่ระบุวันให้ใช้วันนี้ ถ้าข้อความไม่ใช่รายการเงินให้ตอบ {"error":"เหตุผลสั้นๆ"}',
        `วันนี้: ${body.today}\nหมวด: ${JSON.stringify(cats)}\nข้อความ: ${String(body.text).slice(0, 300)}`,
        300
      )
      await sb.from('ai_usage').insert({})
      const p = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
      const amount = Number(p.amount)
      if (p.error || !(amount > 0) || !Number.isFinite(amount) || amount > 100000000) {
        return NextResponse.json({ error: p.error ?? 'อ่านจำนวนเงินไม่ชัดเจน กรุณาตรวจสอบยอดเงินแล้วลองใหม่' }, { status: 422 })
      }
      if (p.type !== 'income' && p.type !== 'expense') {
        return NextResponse.json({ error: 'AI ยังแยกไม่ชัดว่าเป็นรายรับหรือรายจ่าย กรุณาระบุให้ชัดก่อนบันทึก' }, { status: 422 })
      }
      const date = typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : body.today
      if (date > body.today) return NextResponse.json({ error: 'วันที่รายการอยู่ในอนาคต กรุณาตรวจสอบวันที่อีกครั้ง' }, { status: 422 })
      return NextResponse.json({
        type: p.type,
        amount,
        category_id: cats.some((c) => c.id === p.category_id && c.type === p.type) ? p.category_id : null,
        note: p.note ? String(p.note).slice(0, 100) : null,
        date,
      })
    }

    // mode "ask": answer a question using the last N days of the user's own data
    const days = Math.min(Math.max(Number(body.days) || 7, 1), 60)
    const today = typeof body.today === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10)
    const since = body.period === 'month'
      ? today.slice(0, 7) + '-01'
      : new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
    const [h, l, t, m] = await Promise.all([
      sb.from('habits').select('id,name').eq('archived', false),
      sb.from('habit_logs').select('habit_id,log_date').gte('log_date', since).lte('log_date', today),
      sb.from('transactions').select('type,amount_satang,tx_date,note,categories(name)').gte('tx_date', since).lte('tx_date', today),
      sb.from('moods').select('mood_date,score').gte('mood_date', since).lte('mood_date', today),
    ])
    if (h.error || l.error || t.error || m.error) {
      throw new Error('อ่านข้อมูลจากฐานข้อมูลไม่สำเร็จ จึงยังสรุปยอดให้ไม่ได้')
    }
    const transactions = (t.data ?? []) as unknown as { type: string; amount_satang: number; tx_date: string; note: string | null; categories?: { name: string } | { name: string }[] | null }[]
    const incomeSatang = transactions.filter(x => x.type === 'income').reduce((sum, x) => sum + Number(x.amount_satang || 0), 0)
    const expenseSatang = transactions.filter(x => x.type === 'expense').reduce((sum, x) => sum + Number(x.amount_satang || 0), 0)
    const categoryTotals: Record<string, number> = {}
    for (const tx of transactions.filter(x => x.type === 'expense')) {
      const categoryValue = Array.isArray(tx.categories) ? tx.categories[0]?.name : tx.categories?.name
      const category = categoryValue || 'ไม่ระบุหมวด'
      categoryTotals[category] = (categoryTotals[category] || 0) + Number(tx.amount_satang || 0)
    }
    const exactFinance = {
      transaction_count: transactions.length,
      income_baht: Number((incomeSatang / 100).toFixed(2)),
      expense_baht: Number((expenseSatang / 100).toFixed(2)),
      remaining_baht: Number(((incomeSatang - expenseSatang) / 100).toFixed(2)),
      expense_by_category_baht: Object.fromEntries(Object.entries(categoryTotals).sort((a,b) => b[1]-a[1]).map(([k,v]) => [k, Number((v/100).toFixed(2))])),
      transactions: transactions.map(x => ({ type: x.type, amount_baht: Number((Number(x.amount_satang || 0)/100).toFixed(2)), date: x.tx_date, note: x.note, category: (Array.isArray(x.categories) ? x.categories[0]?.name : x.categories?.name) || 'ไม่ระบุหมวด' }))
    }
    const data = JSON.stringify({ habits: h.data, habit_logs: l.data, finance_calculated_by_code: exactFinance, moods: m.data })
    const answer = await ai(
      'คุณเป็นผู้ช่วยในแอปติดตามชีวิตประจำวัน ตอบเป็นภาษาไทย สั้น ชัดเจน ใช้เฉพาะข้อมูลที่ให้มา ' +
        'สำคัญมาก: ยอดรายรับ รายจ่าย คงเหลือ และยอดแยกหมวดใน finance_calculated_by_code คำนวณด้วยโค้ดจากฐานข้อมูลแล้ว ให้ใช้ตัวเลขเหล่านี้ตรงตามที่ให้มา ห้ามคำนวณใหม่ ห้ามประมาณ ห้ามสร้างยอดหรือรายการที่ไม่มีอยู่จริง หากไม่มีข้อมูลให้บอกว่าไม่มีข้อมูล ' +
        'amount_satang หาร 100 เป็นบาท mood 1-5 (5 ดีที่สุด) habit_logs คือวันที่ทำ habit สำเร็จ ถ้าข้อมูลไม่พอให้บอกตรงๆ',
      `ข้อมูล ${days} วันล่าสุด: ${data}\n\nคำถาม: ${String(body.question).slice(0, 300)}`,
      600
    )
    await sb.from('ai_usage').insert({})
    return NextResponse.json({ answer })
  } catch (e) {
    console.error(e)
    const why = e instanceof Error ? e.message.slice(0, 300) : ''
    return NextResponse.json({ error: `AI ตอบไม่ได้ในตอนนี้ (${why})` }, { status: 502 })
  }
}

// Models to try in "test" mode, in order of preference
const CANDIDATES = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
]

// GET /api/ai            -> { enabled }   (used by the UI to show/hide AI features)
// GET /api/ai?test=1     -> tries every model above with your key and reports which ones work
export async function GET(req: NextRequest) {
  const enabled = Boolean(process.env.GEMINI_API_KEY)
  if (!enabled || req.nextUrl.searchParams.get('test') !== '1') return NextResponse.json({ enabled })

  const models = Array.from(new Set([process.env.GEMINI_MODEL, ...CANDIDATES].filter(Boolean) as string[]))
  const results = await Promise.all(
    models.map(async (model) => {
      const t0 = Date.now()
      const res = await callModel(model, 'ตอบสั้นๆ', 'ตอบคำว่า OK คำเดียว', 20, 8000)
      return { model, ok: res.ok, status: res.status, ms: Date.now() - t0, detail: res.ok ? res.text!.trim().slice(0, 40) : res.error }
    })
  )
  return NextResponse.json({ enabled, recommended: results.find((r) => r.ok)?.model ?? null, results })
}
