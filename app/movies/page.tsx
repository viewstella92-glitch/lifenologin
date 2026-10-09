'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mali } from 'next/font/google'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const mali = Mali({ subsets: ['thai', 'latin'], weight: ['400', '500', '600'] })
type Status = 'want' | 'watching' | 'watched'
type Movie = {
  id: string; title: string; year: number | null; genre: string | null; status: Status
  rating: number | null; watched_on: string | null; notes: string | null; poster_url: string | null; created_at: string
}
const STATUS: Record<Status, string> = { want: 'อยากดู', watching: 'กำลังดู', watched: 'ดูแล้ว' }
const GENRES = ['แอคชั่น', 'ตลก', 'ดราม่า', 'ระทึกขวัญ/สยองขวัญ', 'โรแมนติก', 'ไซไฟ/แฟนตาซี', 'อนิเมชั่น', 'สารคดี', 'อื่นๆ']
const BUCKET = 'movie-posters'
const shell = `${mali.className} min-h-screen bg-gradient-to-b from-sky-50 via-pink-50 to-white text-slate-700`
const card = 'rounded-3xl bg-white/90 p-5 shadow-[0_10px_28px_-14px_rgba(56,189,248,0.55)] ring-1 ring-sky-100'
const field = 'min-w-0 rounded-full border-2 border-sky-100 bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none'
const btn = 'rounded-full bg-sky-300 px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-sky-400 active:scale-95 disabled:opacity-50'
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function MoviesPage() {
  const thisYear = new Date().getFullYear()
  const [movies, setMovies] = useState<Movie[]>([])
  const [filter, setFilter] = useState<'all' | Status>('all')
  const [query, setQuery] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [year, setYear] = useState('')
  const [genre, setGenre] = useState('')
  const [status, setStatus] = useState<Status>('want')
  const [rating, setRating] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('movies').select('*').order('created_at', { ascending: false })
    if (error) { setErr(error.message); return }
    setErr('')
    setMovies((data ?? []) as Movie[])
  }, [])
  useEffect(() => { void load() }, [load])

  const addMovie = async () => {
    if (!title.trim()) { setErr('ใส่ชื่อเรื่องก่อนนะ'); return }
    setBusy(true); setErr('')
    let poster_url: string | null = null
    if (file) {
      if (!file.type.startsWith('image/')) { setBusy(false); setErr('กรุณาเลือกไฟล์รูปภาพ'); return }
      if (file.size > 5 * 1024 * 1024) { setBusy(false); setErr('รูปภาพต้องมีขนาดไม่เกิน 5 MB'); return }
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) { setBusy(false); setErr(uploadError.message); return }
      poster_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    }
    const { error } = await supabase.from('movies').insert({
      title: title.trim(), year: year ? Number(year) : null, genre: genre || null, status,
      rating: status === 'watched' && rating ? Number(rating) : null,
      watched_on: status === 'watched' ? date || ymd(new Date()) : null,
      notes: notes.trim() || null, poster_url,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setTitle(''); setYear(''); setGenre(''); setStatus('want'); setRating(''); setDate(''); setNotes(''); setFile(null); setFileKey(k => k + 1)
    await load()
  }
  const patch = async (id: string, values: Partial<Movie>) => {
    const { error } = await supabase.from('movies').update(values).eq('id', id)
    if (error) setErr(error.message); else await load()
  }
  const changeStatus = (m: Movie, next: Status) => patch(m.id, {
    status: next, watched_on: next === 'watched' ? m.watched_on ?? ymd(new Date()) : m.watched_on,
    rating: next === 'watched' ? m.rating : null,
  })
  const remove = async (m: Movie) => {
    if (!confirm(`ลบ "${m.title}" ใช่ไหม?`)) return
    const { error } = await supabase.from('movies').delete().eq('id', m.id)
    if (error) setErr(error.message); else await load()
  }
  const watched = movies.filter(m => m.status === 'watched')
  const rated = watched.filter(m => m.rating != null)
  const avg = rated.length ? (rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length).toFixed(1) : '-'
  const watchedThisYear = watched.filter(m => m.watched_on?.startsWith(String(thisYear))).length
  const genreCount: Record<string, number> = {}
  watched.forEach(m => { if (m.genre) genreCount[m.genre] = (genreCount[m.genre] ?? 0) + 1 })
  const topGenre = Object.entries(genreCount).sort((a, b) => b[1] - a[1])[0]
  const shown = movies.filter(m => (filter === 'all' || m.status === filter) && (!query.trim() || m.title.toLowerCase().includes(query.trim().toLowerCase())))

  return <div className={shell}>
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
      <header className={`${card} flex items-start justify-between gap-3`}>
        <div><h1 className="text-xl font-semibold">แทร็กการดูหนัง 🎬</h1><p className="text-sm text-slate-500">บันทึกหนังที่อยากดู กำลังดู และดูแล้ว</p></div>
        <Link href="/" className="shrink-0 rounded-full bg-pink-100 px-3 py-1 text-xs hover:bg-pink-200">← วันนี้</Link>
      </header>
      {err && <p role="alert" className="break-words rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">{err}</p>}
      <dl className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
        <div className="rounded-2xl bg-sky-50 p-3"><dt className="text-sky-800">หนังทั้งหมด</dt><dd className="text-lg font-semibold text-sky-900">{movies.length}</dd></div>
        <div className="rounded-2xl bg-emerald-50 p-3"><dt className="text-emerald-800">ดูแล้ว</dt><dd className="text-lg font-semibold text-emerald-900">{watched.length}</dd></div>
        <div className="rounded-2xl bg-pink-50 p-3"><dt className="text-pink-800">ดูปีนี้</dt><dd className="text-lg font-semibold text-pink-900">{watchedThisYear}</dd></div>
        <div className="rounded-2xl bg-amber-50 p-3"><dt className="text-amber-800">คะแนนเฉลี่ย</dt><dd className="text-lg font-semibold text-amber-900">{avg}</dd></div>
      </dl>
      {topGenre && <p className="px-2 text-sm text-slate-500">แนวที่ดูบ่อยที่สุด: {topGenre[0]} ({topGenre[1]} เรื่อง)</p>}
      <section className={`${card} space-y-3`}>
        <h2 className="text-lg font-semibold">เพิ่มหนังใหม่ 🍿</h2>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-sky-50/60 p-3">
          <input className={`${field} col-span-2`} placeholder="ชื่อเรื่อง *" value={title} onChange={e => setTitle(e.target.value)} />
          <input className={field} inputMode="numeric" type="number" min="1888" max="2100" placeholder="ปีที่ออกฉาย" value={year} onChange={e => setYear(e.target.value)} />
          <select className={field} value={genre} onChange={e => setGenre(e.target.value)} aria-label="ประเภท"><option value="">ไม่ระบุประเภท</option>{GENRES.map(g => <option key={g}>{g}</option>)}</select>
          <select className={field} value={status} onChange={e => setStatus(e.target.value as Status)} aria-label="สถานะ">{(Object.keys(STATUS) as Status[]).map(s => <option key={s} value={s}>{STATUS[s]}</option>)}</select>
          <select className={field} value={rating} onChange={e => setRating(e.target.value)} aria-label="คะแนน" disabled={status !== 'watched'}><option value="">ยังไม่ให้คะแนน</option>{[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select>
          <input className={field} type="date" aria-label="วันที่ดูจบ" value={date} onChange={e => setDate(e.target.value)} disabled={status !== 'watched'} />
          <input className={`${field} col-span-2`} placeholder="โน้ต (ไม่บังคับ)" value={notes} onChange={e => setNotes(e.target.value)} />
          <label className="col-span-2 text-sm text-slate-500">โปสเตอร์ (ไม่บังคับ, สูงสุด 5 MB)<input key={fileKey} type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
          <button className={`${btn} col-span-2`} onClick={addMovie} disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกหนัง'}</button>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        {(['all','want','watching','watched'] as const).map(f => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full px-4 py-1.5 text-sm transition ${filter === f ? 'bg-pink-300 font-semibold text-slate-800' : 'bg-white ring-1 ring-sky-100 hover:bg-sky-50'}`}>{f === 'all' ? 'ทั้งหมด' : STATUS[f]}</button>)}
        <input className={`${field} ml-auto w-full sm:w-56`} type="search" placeholder="ค้นหาชื่อเรื่อง" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      {shown.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{movies.length ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีหนัง เพิ่มเรื่องแรกด้านบนได้เลย'}</p>}
      <ul className="space-y-3">{shown.map(m => <li key={m.id} className={`${card} flex gap-4 p-4`}>
        {m.poster_url ? <img src={m.poster_url} alt={`โปสเตอร์ ${m.title}`} className="h-28 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-sky-100" /> : <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-2xl" aria-hidden>🎞️</div>}
        <div className="flex min-w-0 flex-1 flex-col gap-2"><div>
          <h3 className="break-words font-semibold">{m.title}{m.year ? <span className="font-normal text-slate-400"> ({m.year})</span> : null}</h3>
          <p className="text-xs text-slate-500">{[m.genre, m.watched_on && `ดูเมื่อ ${m.watched_on}`, m.rating && '★'.repeat(m.rating)].filter(Boolean).join(' · ')}</p>
          {m.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{m.notes}</p>}
        </div><div className="mt-auto flex flex-wrap items-center gap-2">
          <select className={`${field} py-1`} value={m.status} onChange={e => changeStatus(m, e.target.value as Status)} aria-label={`สถานะ ${m.title}`}>{(Object.keys(STATUS) as Status[]).map(s => <option key={s} value={s}>{STATUS[s]}</option>)}</select>
          <select className={`${field} py-1`} value={m.rating ?? ''} onChange={e => patch(m.id, { rating: e.target.value ? Number(e.target.value) : null })} aria-label={`คะแนน ${m.title}`}><option value="">ไม่ให้คะแนน</option>{[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select>
          <button onClick={() => remove(m)} className="ml-auto text-sm text-rose-600 hover:underline">ลบ</button>
        </div></div>
      </li>)}</ul>
    </main>
  </div>
}
