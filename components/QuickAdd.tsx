'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { field, btn, ymd, baht } from '@/lib/ui'
import { useAiEnabled } from '@/lib/useAi'

type Cat = { id: string; name: string; type: 'income' | 'expense'; emoji: string }
type Draft = { type: 'income' | 'expense'; amount: number; category_id: string | null; note: string | null; date: string }

export default function QuickAdd({ cats, onSaved }: { cats: Cat[]; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const aiOn = useAiEnabled()

  const parse = async () => {
    if (!text.trim()) return
    setBusy(true)
    setMsg('')
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'parse', text, today: ymd(new Date()), cats: cats.map(({ id, name, type }) => ({ id, name, type })) }),
    })
    const j = await r.json()
    setBusy(false)
    r.ok ? setDraft(j) : setMsg(j.error ?? 'ลองใหม่อีกครั้งนะ')
  }

  const save = async () => {
    if (!draft) return
    const { error } = await supabase.from('transactions').insert({
      type: draft.type,
      amount_satang: Math.round(draft.amount * 100),
      category_id: draft.category_id,
      tx_date: draft.date,
      note: draft.note,
    })
    if (error) return setMsg(error.message)
    setDraft(null)
    setText('')
    onSaved()
  }

  const cat = cats.find((c) => c.id === draft?.category_id)

  if (!aiOn) return null

  return (
    <div className="space-y-2 rounded-2xl bg-pink-50/70 p-3 ring-1 ring-pink-100">
      <p className="text-sm font-medium">พิมพ์แล้วให้ AI จดให้ ✨</p>
      <div className="flex gap-2">
        <input className={`${field} min-w-0 flex-1`} placeholder="เช่น กาแฟ 65 บาท เมื่อเช้า" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && parse()} />
        <button className={btn} onClick={parse} disabled={busy}>{busy ? 'กำลังอ่าน…' : 'ช่วยจด'}</button>
      </div>
      {draft && (
        <div className="space-y-2 rounded-2xl bg-white p-3 text-sm">
          <p>
            {cat ? `${cat.emoji} ${cat.name}` : 'ไม่ระบุหมวด'} · {draft.type === 'income' ? 'รายรับ' : 'รายจ่าย'} {baht(draft.amount * 100)} บาท · {draft.date}
            {draft.note && <span className="text-slate-500"> ({draft.note})</span>}
          </p>
          <div className="flex gap-2">
            <button className={btn} onClick={save}>บันทึก</button>
            <button className="rounded-full px-4 py-2 text-sm text-slate-500 hover:bg-slate-100" onClick={() => setDraft(null)}>ยกเลิก</button>
          </div>
        </div>
      )}
      {msg && <p role="alert" className="text-sm text-rose-700">{msg}</p>}
    </div>
  )
}
