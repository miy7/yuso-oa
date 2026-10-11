import { NextResponse } from 'next/server'
import { z } from 'zod'
const querySchema=z.object({category:z.string().optional()})
export async function GET(request:Request){const result=querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if(!result.success)return NextResponse.json({error:'คำขอไม่ถูกต้อง'},{status:400}); return NextResponse.json({data:[],message:'เชื่อมต่อ Prisma เพื่อโหลดสินค้า'})}
