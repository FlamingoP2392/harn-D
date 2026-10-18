import { ZodError } from 'zod';
import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from './supabase/server';
export async function requireUser(request: NextRequest) {
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) throw new Error('ORIGIN');
    const size = Number(request.headers.get('content-length') ?? '0');
    if (size > 2_000_000) throw new Error('SIZE');
  }
  const client = await serverClient();
  const { data:{ user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error('AUTH');
  return { client,user };
}
export function apiError(error: unknown) {
  if(typeof error==='object' && error!==null && 'code' in error && error.code==='40001') return NextResponse.json({error:'บิลเปลี่ยนจากอีกอุปกรณ์แล้ว กรุณาโหลดฉบับล่าสุดก่อนบันทึก'}, {status:409});
  if(error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({error:'ข้อมูลคำขอไม่ถูกต้อง'}, {status:400});
  if (error instanceof Error && error.message === 'AUTH') return NextResponse.json({ error:'กรุณาเข้าสู่ระบบอีกครั้ง' }, {status:401});
  if (error instanceof Error && error.message === 'ORIGIN') return NextResponse.json({error:'ต้นทางคำขอไม่ถูกต้อง'}, {status:403});
  if (error instanceof Error && error.message === 'SIZE') return NextResponse.json({error:'ข้อมูลบิลใหญ่เกินไป'}, {status:413});
  console.error('API error', error instanceof Error ? error.message : 'Unknown error');
  return NextResponse.json({error:'ดำเนินการไม่สำเร็จ กรุณาตรวจการเชื่อมต่อและลองอีกครั้ง'}, {status:500});
}
