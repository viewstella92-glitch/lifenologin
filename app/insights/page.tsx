'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { shell, card, field, btn, ymd, baht } from '@/lib/ui'
import { useAiEnabled } from '@/lib/useAi'

type Habit = { id: string; name: string; emoji: string }
type Log = { habit_id: string; log_date: string }
type Tx = { type: 'income' | 'expense'; amount_satang: number; tx_date: string; category_id: string | null; categories: { name: string; emoji: string } | null }
type Cat = { id: string; name: string; emoji: string }
type Budget = { category_id: string; monthly_satang: number }

const MOODS = ['😢', '😕', '😐', '🙂', '😄']
const DAY = 864e5
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * DAY))
const shade = ['bg-sky-100', 'bg-pink-200', 'bg-pink-300', 'bg-pink-400']

export default function Insights() {
  const [ok, setOk] = useState<boolean | null>(null)
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [txs, setTxs] = useState<Tx[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [moods, setMoods] = useState<Record<string, number>>({})
  const [pick, setPick] = useState('all')
  const [bCat, setBCat] = useState('')
  const [bAmt, setBAmt] = useState('')
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const aiOn = useAiEnabled()

  const today = ymd(new Date())
  const monthStart = today.slice(0, 8) + '01'

  const load = useCallback(async () => {
    setOk(true)
    const [h, l, t, c, b, m] = await Promise.all([
      supabase.from('habits').select('id,name,emoji').eq('archived', false).order('created_at'),
      supabase.from('habit_logs').select('habit_id,log_date').gte('log_date', daysAgo(120)),
      supabase.from('transactions').select('type,amount_satang,tx_date,category_id,categories(name,emoji)').gte('tx_date', daysAgo(56)),
      supabase.from('categories').select('id,name,emoji').eq('type', 'expense'),
      supabase.from('budgets').select('category_id,monthly_satang'),
      supabase.from('moods').select('mood_date,score').gte('mood_date', daysAgo(14)),
    ])
    const e = h.error || l.error || t.error || c.error || b.error || m.error
    if (e) return setErr(e.message)
    setErr('')
    setHabits(h.data as Habit[])
    setLogs(l.data as Log[])
    setTxs(t.data as unknown as Tx[])
    setCats(c.data as Cat[])
    setBudgets(b.data as Budget[])
    setMoods(Object.fromEntries((m.data ?? []).map((x) => [x.mood_date, x.score])))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const ask = async (question: string, days: number) => {
    setBusy(true)
    setAnswer('')
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'ask', question, days }),
    })
    const j = await r.json()
    setBusy(false)
    r.ok ? setAnswer(j.answer) : setErr(j.error ?? 'ลองใหม่อีกครั้งนะ')
  }

  const setMood = async (score: number) => {
    const { error } = await supabase.from('moods').upsert({ mood_date: today, score }, { onConflict: 'user_id,mood_date' })
    error ? setErr(error.message) : load()
  }

  const saveBudget = async () => {
    const s = Math.round(parseFloat(bAmt) * 100)
    if (!bCat || !(s > 0)) return setErr('เลือกหมวดและใส่งบที่มากกว่า 0 นะ')
    const { error } = await supabase.from('budgets').upsert({ category_id: bCat, monthly_satang: s }, { onConflict: 'user_id,category_id' })
    if (error) return setErr(error.message)
    setBAmt('')
    load()
  }

  if (ok === null) return null

  // Heatmap: 17 weeks, columns = weeks, rows = Sun..Sat
  const start = new Date()
  start.setDate(start.getDate() - (16 * 7 + start.getDay()))
  const cells = Array.from({ length: 17 * 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return ymd(d)
  })
  const level = (date: string) => {
    if (date > today) return -1
    const n = logs.filter((l) => l.log_date === date && (pick === 'all' || l.habit_id === pick)).length
    const ratio = pick === 'all' ? (habits.length ? n / habits.length : 0) : n
    return ratio === 0 ? 0 : ratio < 0.5 ? 1 : ratio < 1 ? 2 : 3
  }

  // Weekly expenses (8 weeks) and this month's per-category spend
  const weeks = Array.from({ length: 8 }, () => 0)
  const spentBy: Record<string, { label: string; total: number }> = {}
  txs.filter((t) => t.type === 'expense').forEach((t) => {
    const w = Math.floor((new Date(today).getTime() - new Date(t.tx_date).getTime()) / (7 * DAY))
    if (w >= 0 && w < 8) weeks[7 - w] += t.amount_satang
    if (t.tx_date >= monthStart) {
      const k = t.category_id ?? 'none'
      spentBy[k] = { label: t.categories ? `${t.categories.emoji} ${t.categories.name}` : 'ไม่ระบุหมวด', total: (spentBy[k]?.total ?? 0) + t.amount_satang }
    }
  })
  const maxW = Math.max(...weeks, 1)
  const monthTotal = Object.values(spentBy).reduce((s, x) => s + x.total, 0) || 1
  const rate = (id: string) => Math.round((logs.filter((l) => l.habit_id === id && l.log_date >= daysAgo(29)).length / 30) * 100)

  return (
    <div className={shell}>
      <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
        <header className={`${card} flex items-center justify-between`}>
          <h1 className="text-xl font-semibold">ภาพรวมของฉัน 📊</h1>
          <Link href="/" className="rounded-full bg-sky-50 px-4 py-1.5 text-sm hover:bg-sky-100">กลับหน้าวันนี้</Link>
        </header>
        {err && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">{err}</p>}

        {aiOn && (
        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">ถาม AI ✨</h2>
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={busy} onClick={() => ask('สรุปสัปดาห์นี้ให้หน่อย ทั้งกิจวัตร การใช้จ่าย และอารมณ์ พร้อมให้กำลังใจ', 7)}>สรุปสัปดาห์นี้</button>
            <button className={btn} disabled={busy} onClick={() => ask('เดือนนี้ใช้จ่ายหมวดไหนมากสุด และมีอะไรน่าสังเกตไหม', 30)}>เช็กรายจ่ายเดือนนี้</button>
          </div>
          <div className="flex gap-2">
            <input className={`${field} min-w-0 flex-1`} placeholder="ถามอะไรก็ได้ เช่น กิจวัตรไหนหลุดบ่อย" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && ask(q, 30)} />
            <button className={btn} disabled={busy || !q.trim()} onClick={() => ask(q, 30)}>ถาม</button>
          </div>
          {busy && <p className="text-sm text-slate-500">กำลังคิดอยู่…</p>}
          {answer && <p className="whitespace-pre-wrap rounded-2xl bg-pink-50 p-4 text-sm leading-relaxed">{answer}</p>}
        </section>
        )}

        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">วันนี้รู้สึกยังไง</h2>
          <div className="flex gap-2" role="group" aria-label="อารมณ์วันนี้">
            {MOODS.map((m, i) => (
              <button key={m} onClick={() => setMood(i + 1)} aria-pressed={moods[today] === i + 1} className={`h-11 w-11 rounded-full text-xl ring-2 transition active:scale-90 ${moods[today] === i + 1 ? 'bg-pink-100 ring-pink-300' : 'bg-white ring-sky-100 hover:bg-sky-50'}`}>{m}</button>
            ))}
          </div>
          <p className="text-sm text-slate-500">14 วันล่าสุด: {Array.from({ length: 14 }, (_, i) => MOODS[(moods[daysAgo(13 - i)] ?? 0) - 1] ?? '·').join(' ')}</p>
        </section>

        <section className={`${card} space-y-3`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">ปฏิทินความสม่ำเสมอ 🌸</h2>
            <select className={field} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="เลือกกิจวัตร">
              <option value="all">ทุกกิจวัตร</option>
              {habits.map((h) => <option key={h.id} value={h.id}>{h.emoji} {h.name}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ width: 'max-content' }}>
              {cells.map((d) => {
                const lv = level(d)
                return <div key={d} title={d} className={`h-4 w-4 rounded-md ${lv < 0 ? 'bg-transparent' : shade[lv]}`} />
              })}
            </div>
          </div>
          <ul className="space-y-1 text-sm">
            {habits.map((h) => (
              <li key={h.id} className="flex items-center gap-3">
                <span className="w-32 truncate">{h.emoji} {h.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sky-100"><span className="block h-full rounded-full bg-pink-300" style={{ width: `${rate(h.id)}%` }} /></span>
                <span className="w-10 text-right text-slate-500">{rate(h.id)}%</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">อัตราสำเร็จคิดจาก 30 วันล่าสุด</p>
        </section>

        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">รายจ่ายรายสัปดาห์ 🪙</h2>
          <div className="flex h-28 items-end gap-2">
            {weeks.map((w, i) => (
              <div key={i} title={`${baht(w)} บาท`} className={`flex-1 rounded-t-xl ${i === 7 ? 'bg-pink-300' : 'bg-sky-200'}`} style={{ height: `${Math.max((w / maxW) * 100, 3)}%` }} />
            ))}
          </div>
          <p className="text-xs text-slate-500">ซ้ายสุดคือ 8 สัปดาห์ก่อน ขวาสุดคือสัปดาห์นี้</p>
        </section>

        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">รายจ่ายเดือนนี้แยกหมวด</h2>
          {Object.keys(spentBy).length === 0 && <p className="text-sm text-slate-500">เดือนนี้ยังไม่มีรายจ่าย</p>}
          <ul className="space-y-2 text-sm">
            {Object.values(spentBy).sort((a, b) => b.total - a.total).map((x) => (
              <li key={x.label}>
                <div className="flex justify-between"><span>{x.label}</span><span>{baht(x.total)} ({Math.round((x.total / monthTotal) * 100)}%)</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-300" style={{ width: `${(x.total / monthTotal) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">งบประมาณรายเดือน 🎀</h2>
          <ul className="space-y-2 text-sm">
            {budgets.map((b) => {
              const c = cats.find((x) => x.id === b.category_id)
              const spent = spentBy[b.category_id]?.total ?? 0
              const p = spent / b.monthly_satang
              return (
                <li key={b.category_id}>
                  <div className="flex justify-between"><span>{c ? `${c.emoji} ${c.name}` : 'หมวดที่ลบแล้ว'}</span><span>{baht(spent)} / {baht(b.monthly_satang)}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-sky-100"><div className={`h-full rounded-full ${p >= 1 ? 'bg-rose-400' : p >= 0.8 ? 'bg-amber-300' : 'bg-emerald-300'}`} style={{ width: `${Math.min(p * 100, 100)}%` }} /></div>
                  {p >= 1 && <p className="mt-1 text-xs text-rose-700">เกินงบแล้วนะ</p>}
                  {p >= 0.8 && p < 1 && <p className="mt-1 text-xs text-amber-700">ใกล้เต็มงบแล้ว</p>}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <select className={field} value={bCat} onChange={(e) => setBCat(e.target.value)} aria-label="หมวดหมู่">
              <option value="">เลือกหมวด</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
            <input className={`${field} w-32`} inputMode="decimal" placeholder="งบ (บาท)" value={bAmt} onChange={(e) => setBAmt(e.target.value)} />
            <button className={btn} onClick={saveBudget}>ตั้งงบ</button>
          </div>
        </section>
      </main>
    </div>
  )
}
