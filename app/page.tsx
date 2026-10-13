'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mali } from 'next/font/google'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import QuickAdd from '@/components/QuickAdd'

const mali = Mali({ subsets: ['thai', 'latin'], weight: ['400', '500', '600'] })

type Kind = 'income' | 'expense'
type Habit = { id: string; name: string; emoji: string }
type Log = { habit_id: string; log_date: string }
type Cat = { id: string; name: string; type: Kind; emoji: string }
type Tx = {
  id: string
  type: Kind
  amount_satang: number
  tx_date: string
  note: string | null
  categories: { name: string; emoji: string } | null
}

// Local calendar date as YYYY-MM-DD (avoids timezone drift near midnight)
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const baht = (s: number) =>
  (s / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Consecutive days up to today (or yesterday if today isn't done yet)
function streak(dates: Set<string>) {
  const d = new Date()
  if (!dates.has(ymd(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (dates.has(ymd(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'สวัสดีตอนเช้า ☀️' : h < 17 ? 'สวัสดีตอนบ่าย 🌤️' : 'สวัสดีตอนเย็น 🌙'
}

// Shared look: soft pastels, one radius family (3xl cards, full-round controls)
const shell = `${mali.className} min-h-screen bg-gradient-to-b from-sky-50 via-pink-50 to-white text-slate-700`
const card = 'rounded-3xl bg-white/90 p-5 shadow-[0_10px_28px_-14px_rgba(56,189,248,0.55)] ring-1 ring-sky-100'
const field = 'rounded-full border-2 border-sky-100 bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none'
const btn = 'rounded-full bg-sky-300 px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-sky-400 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500'

export default function Home() {
  return <Dashboard />
}

function Dashboard() {
  const today = ymd(new Date())
  const monthStart = today.slice(0, 8) + '01'
  const prevMonthStart = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return ymd(d) })()

  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [txs, setTxs] = useState<Tx[]>([])
  const [err, setErr] = useState('')

  const [name, setName] = useState('')
  const [type, setType] = useState<Kind>('expense')
  const [amount, setAmount] = useState('')
  const [catId, setCatId] = useState('')
  const [note, setNote] = useState('')
  const [txFilter, setTxFilter] = useState<'all' | Kind>('all')

  const load = useCallback(async () => {
    const since = new Date()
    since.setDate(since.getDate() - 400)
    const [h, l, c, t] = await Promise.all([
      supabase.from('habits').select('id,name,emoji').eq('archived', false).order('created_at'),
      supabase.from('habit_logs').select('habit_id,log_date').gte('log_date', ymd(since)),
      supabase.from('categories').select('id,name,type,emoji').order('name'),
      supabase
        .from('transactions')
        .select('id,type,amount_satang,tx_date,note,categories(name,emoji)')
        .gte('tx_date', prevMonthStart)
        .lte('tx_date', today)
        .order('tx_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])
    const e = h.error || l.error || c.error || t.error
    if (e) return setErr(e.message)
    setErr('')
    setHabits(h.data as Habit[])
    setLogs(l.data as Log[])
    setCats(c.data as Cat[])
    setTxs(t.data as unknown as Tx[])
  }, [prevMonthStart, today])

  useEffect(() => {
    load()
  }, [load])

  const isDone = (id: string) => logs.some((l) => l.habit_id === id && l.log_date === today)

  const toggle = async (id: string) => {
    const { error } = isDone(id)
      ? await supabase.from('habit_logs').delete().eq('habit_id', id).eq('log_date', today)
      : await supabase.from('habit_logs').insert({ habit_id: id, log_date: today })
    error ? setErr(error.message) : load()
  }

  const addHabit = async () => {
    if (!name.trim()) return
    const { error } = await supabase.from('habits').insert({ name: name.trim() })
    if (error) return setErr(error.message)
    setName('')
    load()
  }

  const addTx = async () => {
    const satang = Math.round(parseFloat(amount) * 100)
    if (!(satang > 0)) return setErr('ใส่จำนวนเงินที่มากกว่า 0 นะ')
    const { error } = await supabase.from('transactions').insert({
      type,
      amount_satang: satang,
      category_id: catId || null,
      tx_date: today,
      note: note.trim() || null,
    })
    if (error) return setErr(error.message)
    setAmount('')
    setNote('')
    load()
  }

  const currentTxs = txs.filter((t) => t.tx_date >= monthStart && t.tx_date <= today)
  const previousTxs = txs.filter((t) => t.tx_date >= prevMonthStart && t.tx_date < monthStart)
  const sum = (rows: Tx[], k: Kind) => rows.filter((t) => t.type === k).reduce((s, t) => s + Number(t.amount_satang || 0), 0)
  const income = sum(currentTxs, 'income')
  const expense = sum(currentTxs, 'expense')
  const previousExpense = sum(previousTxs, 'expense')
  const expenseChange = previousExpense > 0 ? Math.round(((expense - previousExpense) / previousExpense) * 100) : null
  const categorySpending = Object.values(currentTxs.filter((t) => t.type === 'expense').reduce<Record<string, { label: string; total: number }>>((acc, t) => {
    const key = t.categories?.name ?? 'ไม่ระบุหมวด'
    acc[key] = { label: key, total: (acc[key]?.total ?? 0) + Number(t.amount_satang || 0) }
    return acc
  }, {})).sort((a, b) => b.total - a.total).slice(0, 4)
  const maxCategorySpend = Math.max(...categorySpending.map((c) => c.total), 1)
  const visibleTxs = currentTxs.filter((t) => txFilter === 'all' || t.type === txFilter)
  const doneCount = habits.filter((h) => isDone(h.id)).length
  const pct = habits.length ? Math.round((doneCount / habits.length) * 100) : 0

  return (
    <div className={shell}>
      <main className="mx-auto max-w-xl space-y-5 px-4 py-8">
        <header className={`${card} space-y-3`}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold">{greeting()}</h1>
              <p className="text-sm text-slate-500">
                {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/insights" className="rounded-full bg-pink-100 px-3 py-1 text-xs hover:bg-pink-200">ภาพรวม 📊</Link>
              <Link href="/movies" className="rounded-full bg-sky-100 px-3 py-1 text-xs hover:bg-sky-200">หนัง 🎬</Link>
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>กิจวัตรวันนี้</span>
              <span className="font-medium">{doneCount}/{habits.length}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-sky-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-pink-300 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {pct === 100 && <p className="mt-2 text-sm text-pink-700">ทำครบแล้ว เก่งมากเลย 🎉</p>}
          </div>
        </header>

        {err && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">{err}</p>}

        <section aria-labelledby="habits-h" className={`${card} space-y-3`}>
          <h2 id="habits-h" className="text-lg font-semibold">กิจวัตร 🌱</h2>
          {habits.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีกิจวัตร เพิ่มอันแรกด้านล่างได้เลย</p>}
          <ul className="space-y-2">
            {habits.map((h) => {
              const n = streak(new Set(logs.filter((l) => l.habit_id === h.id).map((l) => l.log_date)))
              const d = isDone(h.id)
              return (
                <li key={h.id}>
                  <button
                    onClick={() => toggle(h.id)}
                    aria-pressed={d}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition active:scale-[0.99] ${d ? 'bg-pink-50 ring-1 ring-pink-200' : 'bg-sky-50/70 ring-1 ring-sky-100 hover:bg-sky-50'}`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm ${d ? 'border-pink-300 bg-pink-300 text-white' : 'border-sky-200 bg-white text-transparent'}`} aria-hidden>✓</span>
                    <span className={`flex-1 ${d ? 'text-slate-400 line-through' : ''}`}>{h.emoji} {h.name}</span>
                    {n > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">🔥 {n} วัน</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex gap-2">
            <input className={`${field} min-w-0 flex-1`} placeholder="กิจวัตรใหม่ เช่น ออกกำลังกาย" value={name} onChange={(e) => setName(e.target.value)} />
            <button className={btn} onClick={addHabit}>เพิ่ม</button>
          </div>
        </section>

        <section aria-labelledby="money-h" className={`${card} space-y-4`}>
          <div className="flex items-start justify-between gap-3">
            <div><h2 id="money-h" className="text-lg font-semibold">เงินของเดือนนี้ 🪙</h2><p className="text-xs text-slate-500">ยอดจริงจากรายการที่บันทึก · {monthStart} ถึง {today}</p></div>
            <span className="shrink-0 rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-700">{currentTxs.length} รายการ</span>
          </div>
          <QuickAdd cats={cats} onSaved={load} />
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100"><dt className="text-emerald-800">รายรับ</dt><dd className="mt-1 break-words text-xl font-semibold text-emerald-950">฿{baht(income)}</dd><p className="mt-1 text-xs text-emerald-700">เงินเข้าทั้งเดือน</p></div>
            <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100"><dt className="text-rose-800">รายจ่าย</dt><dd className="mt-1 break-words text-xl font-semibold text-rose-950">฿{baht(expense)}</dd><p className="mt-1 text-xs text-rose-700">{expenseChange === null ? 'ยังไม่มีข้อมูลเดือนก่อน' : (expenseChange > 0 ? 'เพิ่ม' : expenseChange < 0 ? 'ลด' : 'เท่าเดิม') + ' ' + Math.abs(expenseChange) + '% จากเดือนก่อน'}</p></div>
            <div className={'rounded-2xl p-4 ring-1 ' + (income - expense >= 0 ? 'bg-sky-50 ring-sky-100' : 'bg-amber-50 ring-amber-100')}><dt className="text-slate-700">คงเหลือสุทธิ</dt><dd className="mt-1 break-words text-xl font-semibold text-slate-950">฿{baht(income - expense)}</dd><p className="mt-1 text-xs text-slate-600">{income > 0 ? 'ใช้ไป ' + Math.round(expense / income * 100) + '% ของรายรับ' : 'เพิ่มรายการรายรับเพื่อดูสัดส่วน'}</p></div>
          </dl>
          <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
            <div className="flex justify-between text-xs text-slate-500"><span>สัดส่วนรายรับ</span><span>สัดส่วนรายจ่าย</span></div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-200"><div className="bg-emerald-300 transition-all" style={{ width: (income + expense ? income / (income + expense) * 100 : 0) + '%' }} /><div className="bg-rose-300 transition-all" style={{ width: (income + expense ? expense / (income + expense) * 100 : 0) + '%' }} /></div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">หมวดที่ใช้จ่ายสูงสุด</h3><Link href="/insights" className="text-xs text-sky-700 underline underline-offset-2">ดูรายละเอียด →</Link></div>
            {categorySpending.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีรายจ่ายเดือนนี้</p> : categorySpending.map((c) => <div key={c.label}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{c.label}</span><span className="shrink-0 font-medium">{baht(c.total)} บาท</span></div><div className="h-2 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: (c.total / maxCategorySpend * 100) + '%' }} /></div></div>)}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-sky-50/60 p-3">
            <select className={field} value={type} onChange={(e) => { setType(e.target.value as Kind); setCatId('') }} aria-label="ประเภท">
              <option value="expense">รายจ่าย</option>
              <option value="income">รายรับ</option>
            </select>
            <input className={field} inputMode="decimal" placeholder="จำนวนเงิน (บาท)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select className={field} value={catId} onChange={(e) => setCatId(e.target.value)} aria-label="หมวดหมู่">
              <option value="">ไม่ระบุหมวด</option>
              {cats.filter((c) => c.type === type).map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
            <input className={field} placeholder="โน้ต (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className={`${btn} col-span-2`} onClick={addTx}>บันทึกรายการ</button>
          </div>

          <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">รายการเดือนนี้</h3><select className={field} value={txFilter} onChange={(e) => setTxFilter(e.target.value as 'all' | Kind)} aria-label="กรองรายการ"><option value="all">ทั้งหมด</option><option value="income">รายรับ</option><option value="expense">รายจ่าย</option></select></div>
          {visibleTxs.length === 0 && <p className="text-sm text-slate-500">{currentTxs.length === 0 ? 'เดือนนี้ยังไม่มีรายการ' : 'ไม่มีรายการตามตัวกรองนี้'}</p>}
          <ul className="space-y-2">
            {visibleTxs.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-2 text-sm ring-1 ring-sky-100">
                <span>
                  {t.categories?.emoji ?? '•'} {t.categories?.name ?? 'ไม่ระบุหมวด'}
                  {t.note && <span className="text-slate-500"> · {t.note}</span>}
                  <span className="block text-xs text-slate-400">{t.tx_date}</span>
                </span>
                <span className={`font-medium ${t.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {t.type === 'income' ? '+' : '−'}{baht(t.amount_satang)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
