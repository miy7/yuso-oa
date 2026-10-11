import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { locationMessage, normalizeLineEventId, pushLineText, verifyLineSignature } from '@/lib/line'

export const runtime = 'nodejs'

function hash(value: string) { return createHash('sha256').update(value).digest('hex') }

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!verifyLineSignature(rawBody, request.headers.get('x-line-signature'))) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  let body: { events?: Array<Record<string, unknown>> }
  try { body = JSON.parse(rawBody) as { events?: Array<Record<string, unknown>> } } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  for (const event of body.events ?? []) {
    const eventId = normalizeLineEventId(event.webhookEventId)
    if (!eventId) continue
    try { await prisma.webhookEvent.create({ data: { eventId, payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue } }) }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
      throw error
    }
    const source = event.source as { userId?: string } | undefined
    const message = event.message as { type?: string; text?: string; latitude?: number; longitude?: number } | undefined
    if (!source?.userId || !message) continue

    if (message.type === 'text' && typeof message.text === 'string' && message.text.startsWith('LOC ')) {
      const token = message.text.slice(4).trim()
      const separator = token.indexOf(':')
      if (separator > 0) {
        const orderNumber = token.slice(0, separator)
        const accessToken = token.slice(separator + 1)
        const delivery = await prisma.deliveryDetails.findFirst({ where: { correlationTokenHash: hash(`${orderNumber}:${accessToken}`), order: { orderNumber } } })
        if (delivery) {
          await prisma.deliveryDetails.update({ where: { id: delivery.id }, data: { lineUserId: source.userId } })
          await pushLineText(source.userId, 'ได้รับรหัสออเดอร์แล้ว กรุณาส่ง Location ในแชตนี้').catch(() => undefined)
        }
      }
    }

    if (message.type === 'location' && typeof message.latitude === 'number' && typeof message.longitude === 'number') {
      const delivery = await prisma.deliveryDetails.findFirst({ where: { lineUserId: source.userId, latitude: null, longitude: null }, orderBy: { order: { createdAt: 'desc' } }, include: { order: { select: { orderNumber: true } } } })
      if (delivery) {
        await prisma.deliveryDetails.update({ where: { id: delivery.id }, data: { latitude: message.latitude, longitude: message.longitude } })
        await pushLineText(source.userId, locationMessage(delivery.order.orderNumber, message.latitude, message.longitude)).catch(() => undefined)
      }
    }
  }
  return NextResponse.json({ ok: true })
}
