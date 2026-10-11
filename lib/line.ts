import { createHmac, timingSafeEqual } from 'node:crypto'

const LINE_API = 'https://api.line.me'

export function isLineConfigured() {
  return Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN)
}

export function verifyLineSignature(rawBody: string, signature: string | null) {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64')
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function verifyLineIdToken(idToken: string) {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? process.env.LINE_CHANNEL_ID
  if (!channelId) throw new Error('LINE Login is not configured')
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('LINE ID token verification failed')
  const data = await response.json() as { sub?: string; name?: string; picture?: string; exp?: number }
  if (!data.sub || (data.exp && data.exp * 1000 < Date.now())) throw new Error('LINE ID token is invalid or expired')
  return { lineUserId: data.sub, displayName: data.name?.slice(0, 120) }
}

export async function pushLineText(to: string, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return { sent: false, reason: 'LINE_CHANNEL_ACCESS_TOKEN is not configured' }
  const response = await fetch(`${LINE_API}/v2/bot/message/push`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`LINE push failed with status ${response.status}`)
  return { sent: true }
}

export function orderLocationToken(orderNumber: string, accessToken: string) {
  return `${orderNumber}:${accessToken}`
}

export function appUrl(path: string) {
  const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return new URL(path, base).toString()
}

export function lineStatusMessage(orderNumber: string, status: string) {
  return `YUSO MATCHA\nออเดอร์ ${orderNumber}\nสถานะ: ${status}`
}

export function adminOrderMessage(order: { orderNumber: string; totalSatang: number; fulfillment: string; paymentMethod: string }) {
  return `ออเดอร์ใหม่ ${order.orderNumber}\nยอดรวม ฿${(order.totalSatang / 100).toFixed(2)}\n${order.fulfillment} · ${order.paymentMethod}\n${appUrl(`/admin?order=${encodeURIComponent(order.orderNumber)}`)}`
}

export function locationMessage(orderNumber: string, latitude: number, longitude: number) {
  return `ตำแหน่งสำหรับออเดอร์ ${orderNumber}\n${latitude}, ${longitude}`
}

export const LINE_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'ร้านยืนยันออเดอร์แล้ว', PREPARING: 'กำลังเตรียม', READY_FOR_PICKUP: 'พร้อมรับที่ร้าน', READY_FOR_DELIVERY: 'พร้อมจัดส่ง', OUT_FOR_DELIVERY: 'กำลังนำส่ง', COMPLETED: 'เสร็จสมบูรณ์', CANCELLED: 'ยกเลิกแล้ว',
}

export function normalizeLineEventId(value: unknown) {
  return typeof value === 'string' && value.length <= 200 ? value : null
}
