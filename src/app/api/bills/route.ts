import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, apiError } from '@/lib/server-api';
import { billSchema, toSplitBill } from '@/lib/validation/bill';
import { calculateBill } from '@/lib/split/calculate-bill';
export async function GET(request: NextRequest) {
  try { const {client} = await requireUser(request); const {data,error} = await client.from('bills').select('id,draft,updated_at').order('bill_date',{ascending:false}); if(error) throw error; return NextResponse.json({bills:data}, {headers:{'Cache-Control':'private, no-store'}}); }
  catch(error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const {client} = await requireUser(request);
    const parsed = z.object({bill:billSchema,expectedUpdatedAt:z.iso.datetime().nullable()}).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({error:parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง'}, {status:400});
    try { calculateBill(toSplitBill(parsed.data.bill)); } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : 'คำนวณไม่สำเร็จ'}, {status:400}); }
    const response = await client.rpc('save_bill',{payload:parsed.data.bill,expected_updated_at:parsed.data.expectedUpdatedAt});
    const data:unknown=response.data; const error=response.error;
    if(error) throw error;
    return NextResponse.json({bill:billSchema.parse(data)});
  } catch(error) { return apiError(error); }
}
export async function DELETE(request: NextRequest) {
  try { const {client} = await requireUser(request); const parsed=z.uuid().safeParse(request.nextUrl.searchParams.get('id')); if(!parsed.success) return NextResponse.json({error:'รหัสบิลไม่ถูกต้อง'},{status:400}); const {error}=await client.from('bills').delete().eq('id',parsed.data); if(error) throw error; return NextResponse.json({ok:true}); }
  catch(error) { return apiError(error); }
}
