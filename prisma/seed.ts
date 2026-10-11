import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type SeedProduct = { category: string; slug: string; nameTh: string; nameEn?: string; description?: string; priceSatang: number; imageUrl?: string; sortOrder?: number }

async function main() {
  const raw = process.env.SEED_PRODUCTS_JSON
  if (!raw) throw new Error('Set SEED_PRODUCTS_JSON to an approved product list before seeding.')
  const products = JSON.parse(raw) as SeedProduct[]
  if (!Array.isArray(products) || products.length === 0) throw new Error('SEED_PRODUCTS_JSON must contain a non-empty array.')
  for (const product of products) {
    if (!product.slug || !product.nameTh || !Number.isInteger(product.priceSatang) || product.priceSatang < 0) throw new Error(`Invalid product: ${product.slug ?? 'unknown'}`)
    const category = await prisma.category.upsert({ where: { slug: product.category }, update: {}, create: { slug: product.category, name: product.category } })
    const existing = await prisma.product.findFirst({ where: { categoryId: category.id, nameTh: product.nameTh } })
    if (existing) { console.log(`Skipping existing product: ${product.nameTh}`); continue }
    await prisma.product.create({ data: { categoryId: category.id, nameTh: product.nameTh, nameEn: product.nameEn, description: product.description, priceSatang: product.priceSatang, imageUrl: product.imageUrl, sortOrder: product.sortOrder ?? 0 } })
    console.log(`Created product: ${product.nameTh}`)
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
