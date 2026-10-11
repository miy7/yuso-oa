'use client'

import { useState } from 'react'
import Link from 'next/link'

export function LineLogin() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function login() {
    setBusy(true)
    try {
      const liff = await import('@line/liff')
      if (!process.env.NEXT_PUBLIC_LIFF_ID) {
        setMessage('ยังไม่ได้ตั้งค่า LINE Login — สามารถสั่งผ่านเมนูได้ตามปกติ')
        return
      }
      await liff.default.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID })
      if (!liff.default.isLoggedIn()) {
        liff.default.login()
        return
      }
      const idToken = liff.default.getIDToken()
      if (!idToken) throw new Error('ไม่พบ LINE ID token')
      const response = await fetch('/api/line/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) })
      if (!response.ok) throw new Error('login failed')
      setMessage('เชื่อมต่อ LINE สำเร็จ')
    } catch {
      setMessage('ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาลองใหม่หรือสั่งผ่านเมนู')
    } finally {
      setBusy(false)
    }
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn secondary" type="button" onClick={login} disabled={busy}>{busy ? 'กำลังเชื่อมต่อ…' : 'เข้าสู่ระบบด้วย LINE'}</button>
      <Link className="btn" href="/menu">Order via LINE</Link>
    </div>
    {message ? <small role="status" style={{ color: '#6f7d73' }}>{message}</small> : null}
  </div>
}
