import { NextResponse } from 'next/server'
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), status: z.nativeEnum(OrderStatus).optional(), paymentStatus: z.nativeEnum(PaymentStatus).optional() })
const updateSchema = z.object({ status: z.nativeEnum(OrderStatus).optional(), paymentStatus: z.nativeEnum(PaymentStatus).optional(), deliveryFeeSatang: z.number().int().min(0).max(100000).optional(), note: z.string().trim().max(500).optional() }).refine((value) => value.status || value.paymentStatus || value.deliveryFeeSatang !== undefined, 'No changes')

const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING_LOCATION: [OrderStatus.PENDING_DELIVERY_CONFIRMATION, OrderStatus.CANCELLED], PENDING_DELIVERY_CONFIRMATION: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED], PENDING_PAYMENT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED], CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED], PREPARING: [OrderStatus.READY_FOR_PICKUP, OrderStatus.READY_FOR_DELIVERY, OrderStatus.CANCELLED], READY_FOR_PICKUP: [OrderStatus.COMPLETED, OrderStatus.CANCELLED], READY_FOR_DELIVERY: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED], OUT_FOR_DELIVERY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED], COMPLETED: [], CANCELLED: [],
}

export async function GET(request: Request) {
  if (!await getAdminSession()) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบผู้ดูแล' }, { status: 401 })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'ตัวกรองไม่ถูกต้อง' }, { status: 400 })
  const { page, pageSize, status, paymentStatus } = parsed.data
  const where = { ...(status ? { status } : {}), ...(paymentStatus ? { paymentStatus } : {}) }
  const [orders, total] = await prisma.$transaction([prisma.order.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' }, select: { id: true, orderNumber: true, fulfillment: true, status: true, paymentStatus: true, subtotalSatang: true, deliveryFeeSatang: true, totalSatang: true, createdAt: true, customer: { select: { displayName: true, phone: true } }, items: { select: { productName: true, quantity: true, unitPriceSatang: true } }, delivery: { select: { latitude: true, longitude: true, addressNote: true, confirmedFeeSatang: true } } } }), prisma.order.count({ where })])
  return NextResponse.json({ data: orders, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
