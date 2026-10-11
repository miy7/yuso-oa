import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const scrypt = promisify(scryptCallback)

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const name = process.env.ADMIN_NAME?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !name || !password) throw new Error('Set ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD for bootstrap.')
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.')
  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) throw new Error('An admin with this email already exists. Use a separate credential-rotation procedure.')
  await prisma.adminUser.create({ data: { email, name, passwordHash: await hashPassword(password), role: 'OWNER' } })
  console.log(`Created first admin: ${email}`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
