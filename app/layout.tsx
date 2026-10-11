import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'YUSO MATCHA — มัทฉะโฮมคาเฟ่', description: 'มัทฉะพรีเมียม ชงสดจากบ้านของเรา ส่งตรงถึงคุณ' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="th"><body>{children}</body></html> }
