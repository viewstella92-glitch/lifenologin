import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Life Dashboard',
  description: 'กิจวัตร รายรับรายจ่าย และอารมณ์ ในที่เดียว',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
