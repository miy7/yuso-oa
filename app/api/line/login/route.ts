import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyLineIdToken } from '@/lib/line'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { idToken?: unknown } | null
  if (!body || typeof body.idToken !== 'string' || body.idToken.length > 10000) return NextResponse.json({ error: 'LINE ID token is required' }, { status: 400 })
  try {
    const identity = await verifyLineIdToken(body.idToken)
    const existing = await prisma.customer.findFirst({ where: { lineIdentity: { lineUserId: identity.lineUserId } }, select: { id: true } })
    const customer = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { displayName: identity.displayName }, select: { id: true, displayName: true } })
      : await prisma.customer.create({ data: { displayName: identity.displayName, lineIdentity: { create: { lineUserId: identity.lineUserId } } }, select: { id: true, displayName: true } })
    return NextResponse.json({ data: customer })
  } catch (error) {
    console.error('[line/login] failed', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({ error: 'ไม่สามารถเข้าสู่ระบบ LINE ได้' }, { status: 401 })
  }
}
