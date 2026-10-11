import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { Prisma, FulfillmentMethod, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { adminOrderMessage, lineStatusMessage, pushLineText } from '@/lib/line'

const optionValueSchema = z.union([z.string().trim().max(120), z.number().int().nonnegative(), z.boolean()])
const itemSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(20),
  selectedOptions: z.record(z.string().trim().min(1).max(60), optionValueSchema).default({}),
})
const createOrderSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(128),
  customer: z.object({
    displayName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(7).max(30),
  }),
  fulfillment: z.nativeEnum(FulfillmentMethod),
  paymentMethod: z.nativeEnum(PaymentMethod),
  customerNote: z.string().trim().max(500).optional(),
  addressNote: z.string().trim().min(1).max(500).optional(),
  items: z.array(itemSchema).min(1).max(50),
}).superRefine((value, context) => {
  if (value.fulfillment === FulfillmentMethod.DELIVERY && !value.addressNote) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['addressNote'], message: 'Delivery address is required' })
  }
})

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = createOrderSchema.safeParse(body)
  if (!parsed.success) return errorResponse('คำสั่งซื้อไม่ถูกต้อง')

  const input = parsed.data
  try {
    const existingKey = await prisma.idempotencyKey.findUnique({ where: { key: input.idempotencyKey } })
    if (existingKey?.orderId) {
      const existingOrder = await prisma.order.findUnique({ where: { id: existingKey.orderId }, select: { id: true, orderNumber: true, totalSatang: true, status: true, paymentStatus: true } })
      if (existingOrder) return NextResponse.json({ data: existingOrder })
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))]
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isAvailable: true },
      select: { id: true, nameTh: true, priceSatang: true },
    })
    if (products.length !== productIds.length) return errorResponse('สินค้าบางรายการไม่พร้อมจำหน่าย', 409)

    const productById = new Map(products.map((product) => [product.id, product]))
    const normalizedItems = input.items.map((item) => {
      const product = productById.get(item.productId)!
      return {
        productId: product.id,
        productName: product.nameTh,
        customization: item.selectedOptions as Prisma.InputJsonValue,
        unitPriceSatang: product.priceSatang,
        quantity: item.quantity,
      }
    })
    const subtotalSatang = normalizedItems.reduce((sum, item) => sum + item.unitPriceSatang * item.quantity, 0)
    const deliveryFeeSatang = input.fulfillment === FulfillmentMethod.DELIVERY ? 0 : 0
    const totalSatang = subtotalSatang + deliveryFeeSatang
    const orderNumber = `YS-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`
    const accessToken = randomBytes(32).toString('hex')
    const accessTokenHash = tokenHash(accessToken)

    const order = await prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.create({ data: input.customer })
      const created = await transaction.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          accessTokenHash,
          fulfillment: input.fulfillment,
          status: OrderStatus.PENDING_PAYMENT,
          paymentMethod: input.paymentMethod,
          paymentStatus: PaymentStatus.UNPAID,
          subtotalSatang,
          deliveryFeeSatang,
          totalSatang,
          customerNote: input.customerNote,
          items: { create: normalizedItems },
          payments: { create: { method: input.paymentMethod, status: PaymentStatus.UNPAID } },
          history: { create: { status: OrderStatus.PENDING_PAYMENT, note: 'Order created' } },
          ...(input.fulfillment === FulfillmentMethod.DELIVERY
            ? { delivery: { create: { correlationTokenHash: tokenHash(`${orderNumber}:${accessToken}`), addressNote: input.addressNote } } }
            : {}),
        },
        select: { id: true, orderNumber: true, totalSatang: true, status: true, paymentStatus: true },
      })
      await transaction.idempotencyKey.create({ data: { key: input.idempotencyKey, orderId: created.id } })
      await transaction.notificationOutbox.create({ data: { orderId: created.id, type: 'ORDER_RECEIVED', payload: { orderNumber: created.orderNumber } } })
      return created
    })

    const recipients = await prisma.order.findUnique({ where: { id: order.id }, select: { orderNumber: true, totalSatang: true, fulfillment: true, paymentMethod: true, customer: { select: { lineIdentity: { select: { lineUserId: true } } } } } })
    const notificationTasks = []
    if (recipients?.customer.lineIdentity?.lineUserId) notificationTasks.push(pushLineText(recipients.customer.lineIdentity.lineUserId, lineStatusMessage(order.orderNumber, 'ได้รับออเดอร์แล้ว')))
    if (process.env.LINE_ADMIN_USER_ID && recipients) notificationTasks.push(pushLineText(process.env.LINE_ADMIN_USER_ID, adminOrderMessage(recipients)))
    void Promise.allSettled(notificationTasks).then((results) => { if (results.some((result) => result.status === 'rejected')) console.error('[orders] LINE notification failed') })
    return NextResponse.json({ data: order, accessToken, locationToken: input.fulfillment === FulfillmentMethod.DELIVERY ? `${order.orderNumber}:${accessToken}` : undefined }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existingKey = await prisma.idempotencyKey.findUnique({ where: { key: input.idempotencyKey }, include: { order: { select: { id: true, orderNumber: true, totalSatang: true, status: true, paymentStatus: true } } } })
      if (existingKey?.order) return NextResponse.json({ data: existingKey.order })
    }
    console.error('[orders] create failed', error)
    return errorResponse('ไม่สามารถสร้างคำสั่งซื้อได้ในขณะนี้', 503)
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const orderNumber = url.searchParams.get('orderNumber')?.trim()
  const accessToken = url.searchParams.get('accessToken')?.trim()
  if (!orderNumber || !accessToken) return errorResponse('ต้องระบุข้อมูลคำสั่งซื้อและโทเคน', 401)

  try {
    const order = await prisma.order.findFirst({
      where: { orderNumber, accessTokenHash: tokenHash(accessToken) },
      select: {
        orderNumber: true, fulfillment: true, status: true, paymentMethod: true, paymentStatus: true,
        subtotalSatang: true, deliveryFeeSatang: true, totalSatang: true, customerNote: true, createdAt: true,
        customer: { select: { displayName: true, phone: true } },
        items: { select: { productName: true, customization: true, unitPriceSatang: true, quantity: true } },
        delivery: { select: { addressNote: true, confirmedFeeSatang: true } },
      },
    })
    if (!order) return errorResponse('ไม่พบคำสั่งซื้อ', 404)
    return NextResponse.json({ data: order })
  } catch (error) {
    console.error('[orders] read failed', error)
    return errorResponse('ไม่สามารถโหลดคำสั่งซื้อได้ในขณะนี้', 503)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Prevent accidental floating-point money changes in future edits.
export type OrderMoney = number
