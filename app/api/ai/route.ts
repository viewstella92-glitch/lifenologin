import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Free tier: key from Google AI Studio. Set GEMINI_MODEL to switch if Google retires this model.
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite'
const DAILY_LIMIT = 30 // AI calls per day, shared (there is no login)

async function ai(system: string, user: string, max: number) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY!, // server-only, never NEXT_PUBLIC_
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: max, temperature: 0.4 },
    }),
  })
  if (!r.ok) throw new Error(`AI ${r.status}`)
  const j = await r.json()
  return ((j.candidates?.[0]?.content?.parts ?? []) as { text?: string }[]).map((p) => p.text ?? '').join('')
}

export async function POST(req: NextRequest) {
  // โหมดไม่มี login: ใช้ anon key ตรงๆ (นโยบายฐานข้อมูลเปิดให้ใช้ร่วมกัน)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const { count } = await sb
    .from('ai_usage')
    .select('*', { count: 'exact', head: true })
    .gte('used_at', new Date().toISOString().slice(0, 10))
  if ((count ?? 0) >= DAILY_LIMIT) return NextResponse.json({ error: 'วันนี้ใช้ AI ครบโควตาแล้ว พรุ่งนี้ลองใหม่นะ' }, { status: 429 })
  await sb.from('ai_usage').insert({})

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
      const p = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
      const amount = Number(p.amount)
      if (p.error || !(amount > 0)) return NextResponse.json({ error: p.error ?? 'อ่านจำนวนเงินไม่ออก ลองพิมพ์ใหม่นะ' }, { status: 422 })
      return NextResponse.json({
        type: p.type === 'income' ? 'income' : 'expense',
        amount,
        category_id: cats.some((c) => c.id === p.category_id) ? p.category_id : null,
        note: p.note ? String(p.note).slice(0, 100) : null,
        date: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : body.today,
      })
    }

    // mode "ask": answer a question using the last N days of the user's own data
    const days = Math.min(Math.max(Number(body.days) || 7, 1), 60)
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
    const [h, l, t, m] = await Promise.all([
      sb.from('habits').select('id,name').eq('archived', false),
      sb.from('habit_logs').select('habit_id,log_date').gte('log_date', since),
      sb.from('transactions').select('type,amount_satang,tx_date,note,categories(name)').gte('tx_date', since),
      sb.from('moods').select('mood_date,score').gte('mood_date', since),
    ])
    const data = JSON.stringify({ habits: h.data, habit_logs: l.data, transactions: t.data, moods: m.data })
    const answer = await ai(
      'คุณเป็นผู้ช่วยในแอปติดตามชีวิตประจำวัน ตอบเป็นภาษาไทย สั้น กระชับ อบอุ่นและให้กำลังใจ ใช้เฉพาะข้อมูลที่ให้มา ' +
        'amount_satang หาร 100 เป็นบาท mood 1-5 (5 ดีที่สุด) habit_logs คือวันที่ทำ habit สำเร็จ ถ้าข้อมูลไม่พอให้บอกตรงๆ',
      `ข้อมูล ${days} วันล่าสุด: ${data}\n\nคำถาม: ${String(body.question).slice(0, 300)}`,
      600
    )
    return NextResponse.json({ answer })
  } catch {
    return NextResponse.json({ error: 'AI ตอบไม่ได้ในตอนนี้ ลองใหม่อีกครั้งนะ' }, { status: 502 })
  }
}

export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.GEMINI_API_KEY) })
}
