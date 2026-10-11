'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Order = {
  id: string
  orderNumber: string
  fulfillment: 'DELIVERY' | 'PICKUP'
  status: string
  paymentStatus: string
  subtotalSatang: number
  deliveryFeeSatang: number
  totalSatang: number
  createdAt: string
  customer: { displayName: string | null; phone: string | null }
  items: { productName: string; quantity: number; unitPriceSatang: number }[]
  delivery: { addressNote: string | null; confirmedFeeSatang: number | null } | null
}

type ApiState = { data: Order[]; pagination: { page: number; pages: number; total: number } }

const statusLabels: Record<string, string> = { PENDING_LOCATION: 'รอพิกัด', PENDING_DELIVERY_CONFIRMATION: 'รอยืนยันค่าส่ง', PENDING_PAYMENT: 'รอชำระเงิน', CONFIRMED: 'ยืนยันแล้ว', PREPARING: 'กำลังเตรียม', READY_FOR_PICKUP: 'พร้อมรับ', READY_FOR_DELIVERY: 'รอจัดส่ง', OUT_FOR_DELIVERY: 'กำลังจัดส่ง', COMPLETED: 'เสร็จสิ้น', CANCELLED: 'ยกเลิก' }
const paymentLabels: Record<string, string> = { UNPAID: 'ยังไม่ชำระ', PENDING_REVIEW: 'รอตรวจสอบ', PAID: 'ชำระแล้ว', REJECTED: 'ไม่ผ่าน', REFUNDED: 'คืนเงินแล้ว' }
const statusOptions = Object.keys(statusLabels)
const paymentOptions = Object.keys(paymentLabels)
const money = (satang: number) => `฿${(satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`

export default function Admin() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [adminName, setAdminName] = useState('')
  const [orders, setOrders] = useState<ApiState | null>(null)
  const [status, setStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [loginError, setLoginError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '20' })
    if (status) params.set('status', status)
    if (paymentStatus) params.set('paymentStatus', paymentStatus)
    try {
      const response = await fetch(`/api/admin/orders?${params}`, { credentials: 'same-origin', cache: 'no-store', signal })
      if (response.status === 401) { setAuthenticated(false); return }
      if (!response.ok) throw new Error('โหลดรายการไม่สำเร็จ')
      setOrders(await response.json())
      setAuthenticated(true)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setMessage((error as Error).message)
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [page, paymentStatus, status])

  useEffect(() => {
    const controller = new AbortController()
    requestRef.current?.abort()
    requestRef.current = controller
    fetch('/api/admin/auth', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async response => {
      const result = await response.json()
      setAuthenticated(result.authenticated)
      if (result.admin) setAdminName(result.admin.name)
    }).catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!authenticated) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = () => {
      if (!active || document.visibilityState !== 'visible') return
      const controller = new AbortController()
      requestRef.current?.abort()
      requestRef.current = controller
      loadOrders(controller.signal).finally(() => { if (active) timer = setTimeout(poll, 7000) })
    }
    poll()
    const onVisibility = () => { if (document.visibilityState === 'visible' && active) { if (timer) clearTimeout(timer); poll() } }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { active = false; if (timer) clearTimeout(timer); requestRef.current?.abort(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [authenticated, loadOrders])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoginError(''); setBusy('login')
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) })
    const result = await response.json()
    if (!response.ok) setLoginError(result.error ?? 'เข้าสู่ระบบไม่สำเร็จ')
    else { setAuthenticated(true); setAdminName(result.data.name) }
    setBusy(null)
  }

  async function updateOrder(orderId: string, payload: Record<string, string | number>) {
    setBusy(orderId); setMessage('')
    const response = await fetch(`/api/admin/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await response.json()
    if (response.status === 401) setAuthenticated(false)
    else if (!response.ok) setMessage(result.error ?? 'แก้ไขไม่สำเร็จ')
    else { setMessage('บันทึกการเปลี่ยนแปลงแล้ว'); await loadOrders() }
    setBusy(null)
  }

  const visibleOrders = useMemo(() => orders?.data ?? [], [orders])
  if (authenticated === null) return <main className="admin-shell"><div className="admin-card">กำลังตรวจสอบสิทธิ์…</div></main>
  if (!authenticated) return <main className="admin-shell"><form className="admin-card login-card" onSubmit={login}><p className="eyebrow">YUSO MATCHA</p><h1>เข้าสู่ระบบผู้ดูแล</h1><label>อีเมล<input name="email" type="email" required autoComplete="username" /></label><label>รหัสผ่าน<input name="password" type="password" required autoComplete="current-password" /></label>{loginError && <p className="error">{loginError}</p>}<button className="primary-button" disabled={busy === 'login'}>{busy === 'login' ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button></form></main>
  return <main className="admin-shell"><section className="admin-content"><header className="admin-header"><div><p className="eyebrow">YUSO MATCHA / ORDERS</p><h1>ออเดอร์</h1><p className="muted">สวัสดี, {adminName} · อัปเดตอัตโนมัติทุก 7 วินาที</p></div><button className="secondary-button" onClick={async () => { await fetch('/api/admin/auth', { method: 'DELETE' }); setAuthenticated(false) }}>ออกจากระบบ</button></header><div className="filters"><label>สถานะออเดอร์<select value={status} onChange={event => { setPage(1); setStatus(event.target.value) }}><option value="">ทั้งหมด</option>{statusOptions.map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><label>สถานะชำระเงิน<select value={paymentStatus} onChange={event => { setPage(1); setPaymentStatus(event.target.value) }}><option value="">ทั้งหมด</option>{paymentOptions.map(value => <option key={value} value={value}>{paymentLabels[value]}</option>)}</select></label></div>{message && <p className="notice">{message}</p>}<div className="admin-card table-wrap">{loading && <p className="muted">กำลังโหลด…</p>}{!loading && visibleOrders.length === 0 && <p className="muted">ยังไม่มีออเดอร์ที่ตรงกับตัวกรอง</p>}{visibleOrders.map(order => <article className="order-row" key={order.id}><div className="order-main"><div><strong>{order.orderNumber}</strong><p className="muted">{new Date(order.createdAt).toLocaleString('th-TH')} · {order.customer.displayName ?? 'ไม่ระบุชื่อ'} · {order.customer.phone ?? 'ไม่มีเบอร์โทร'}</p></div><strong>{money(order.totalSatang)}</strong></div><p>{order.items.map(item => `${item.productName} × ${item.quantity}`).join(', ')}</p><p className="muted">{order.fulfillment === 'DELIVERY' ? `จัดส่ง${order.delivery?.addressNote ? ` · ${order.delivery.addressNote}` : ''}` : 'รับเอง'} · ค่าสินค้า {money(order.subtotalSatang)} · ค่าส่ง {money(order.deliveryFeeSatang)}</p><div className="order-controls"><label>ออเดอร์<select value={order.status} disabled={busy === order.id} onChange={event => updateOrder(order.id, { status: event.target.value })}>{statusOptions.map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><label>ชำระเงิน<select value={order.paymentStatus} disabled={busy === order.id} onChange={event => updateOrder(order.id, { paymentStatus: event.target.value })}>{paymentOptions.map(value => <option key={value} value={value}>{paymentLabels[value]}</option>)}</select></label><label>ค่าส่ง (สตางค์)<input type="number" min="0" max="100000" defaultValue={order.deliveryFeeSatang} disabled={busy === order.id} onBlur={event => { const next = Number(event.target.value); if (next !== order.deliveryFeeSatang) updateOrder(order.id, { deliveryFeeSatang: next }) }} /></label></div></article>)}</div>{orders && <nav className="pagination"><button className="secondary-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>ก่อนหน้า</button><span>หน้า {orders.pagination.page} / {Math.max(orders.pagination.pages, 1)} · {orders.pagination.total} รายการ</span><button className="secondary-button" disabled={page >= orders.pagination.pages} onClick={() => setPage(value => value + 1)}>ถัดไป</button></nav>}</section></main>
}

