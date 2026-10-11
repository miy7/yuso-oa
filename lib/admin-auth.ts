import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

const scrypt = promisify(scryptCallback)
const COOKIE_NAME = 'yuso_admin_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 12

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function verifyPassword(password: string, encoded: string) {
  const [salt, stored] = encoded.split(':')
  if (!salt || !stored) return false
  const derived = (await scrypt(password, salt, 64)) as Buffer
  const expected = Buffer.from(stored, 'hex')
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

export async function createAdminSession(adminId: string) {
  const token = randomBytes(32).toString('hex')
  await prisma.adminSession.create({ data: { tokenHash: hashToken(token), adminId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } })
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS / 1000 })
}

export async function getAdminSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  const session = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { admin: true } })
  if (!session || session.expiresAt <= new Date()) return null
  return session.admin
}

export function hasValidSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } })
  cookieStore.set(COOKIE_NAME, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
}

export { COOKIE_NAME }
