import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { clearAdminSession, createAdminSession, getAdminSession, verifyPassword } from '@/lib/admin-auth'

const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) })

export async function GET() {
  const admin = await getAdminSession()
  return NextResponse.json({ authenticated: Boolean(admin), admin: admin ? { id: admin.id, name: admin.name, role: admin.role } : null })
}

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง' }, { status: 400 })
  const admin = await prisma.adminUser.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
  if (!admin || !(await verifyPassword(parsed.data.password, admin.passwordHash))) return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  await createAdminSession(admin.id)
  return NextResponse.json({ data: { id: admin.id, name: admin.name, role: admin.role } })
}

export async function DELETE() {
  await clearAdminSession()
  return NextResponse.json({ data: { ok: true } })
}

export const runtime = 'nodejs'
