import { NextResponse } from 'next/server'
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import { getAdminSession, hasValidSameOrigin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

const updateSchema = z.object({ status: z.nativeEnum(OrderStatus).optional(), paymentStatus: z.nativeEnum(PaymentStatus).optional(), deliveryFeeSatang: z.number().int().min(0).max(100000).optional(), note: z.string().trim().max(500).optional() }).refine((value) => value.status || value.paymentStatus || value.deliveryFeeSatang !== undefined, 'No changes')
const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING_LOCATION: [OrderStatus.PENDING_DELIVERY_CONFIRMATION, OrderStatus.CANCELLED], PENDING_DELIVERY_CONFIRMATION: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED], PENDING_PAYMENT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED], CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED], PREPARING: [OrderStatus.READY_FOR_PICKUP, OrderStatus.READY_FOR_DELIVERY, OrderStatus.CANCELLED], READY_FOR_PICKUP: [OrderStatus.COMPLETED, OrderStatus.CANCELLED], READY_FOR_DELIVERY: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED], OUT_FOR_DELIVERY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED], COMPLETED: [], CANCELLED: [],
}

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  if (!hasValidSameOrigin(request)) return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 403 })
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบผู้ดูแล' }, { status: 401 })
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลการแก้ไขไม่ถูกต้อง' }, { status: 400 })
  const { orderId } = await context.params
  try {
    const current = await prisma.order.findUnique({ where: { id: orderId }, include: { delivery: true } })
    if (!current) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 })
    if (parsed.data.status && !transitions[current.status].includes(parsed.data.status)) return NextResponse.json({ error: 'ไม่อนุญาตให้เปลี่ยนสถานะนี้' }, { status: 409 })
    const fee = parsed.data.deliveryFeeSatang
    if (fee !== undefined && current.fulfillment === 'PICKUP' && fee !== 0) return NextResponse.json({ error: 'ออเดอร์รับเองไม่สามารถคิดค่าส่งได้' }, { status: 409 })
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({ where: { id: orderId }, data: { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.paymentStatus ? { paymentStatus: parsed.data.paymentStatus } : {}), ...(fee !== undefined ? { deliveryFeeSatang: fee, totalSatang: current.subtotalSatang + fee, ...(current.delivery ? { delivery: { update: { confirmedFeeSatang: fee } } } : {}) } : {}) } })
      if (parsed.data.status) await tx.orderStatusHistory.create({ data: { orderId, status: parsed.data.status, changedById: admin.id, note: parsed.data.note } })
      return order
    })
    return NextResponse.json({ data: result })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return NextResponse.json({ error: 'ไม่สามารถแก้ไขคำสั่งซื้อได้' }, { status: 409 })
    return NextResponse.json({ error: 'ไม่สามารถแก้ไขคำสั่งซื้อได้ในขณะนี้' }, { status: 503 })
  }
}

export const runtime = 'nodejs'
