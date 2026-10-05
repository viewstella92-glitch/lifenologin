import { Mali } from 'next/font/google'

const mali = Mali({ subsets: ['thai', 'latin'], weight: ['400', '500', '600'] })

export const shell = `${mali.className} min-h-screen bg-gradient-to-b from-sky-50 via-pink-50 to-white text-slate-700`
export const card = 'rounded-3xl bg-white/90 p-5 shadow-[0_10px_28px_-14px_rgba(56,189,248,0.55)] ring-1 ring-sky-100'
export const field = 'rounded-full border-2 border-sky-100 bg-white px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none'
export const btn = 'rounded-full bg-sky-300 px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-sky-400 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500'

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const baht = (s: number) =>
  (s / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
