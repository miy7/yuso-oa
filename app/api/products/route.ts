import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const querySchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
})

export async function GET(request: Request) {
  const result = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))

  if (!result.success) {
    return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    const products = await prisma.product.findMany({
      where: {
        isAvailable: true,
        ...(result.data.category ? { category: { slug: result.data.category } } : {}),
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { nameTh: 'asc' }],
      select: {
        id: true,
        nameTh: true,
        nameEn: true,
        description: true,
        priceSatang: true,
        imageUrl: true,
        category: { select: { name: true, slug: true } },
      },
    })

    return NextResponse.json({ data: products })
  } catch (error) {
    console.error('[products] database read failed', error)
    return NextResponse.json({ error: 'ไม่สามารถโหลดเมนูได้ในขณะนี้' }, { status: 503 })
  }
}
