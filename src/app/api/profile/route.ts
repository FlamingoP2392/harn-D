import { NextResponse, type NextRequest } from 'next/server';
import {requireUser,apiError} from '@/lib/server-api';
import {profileSchema} from '@/lib/validation/bill';
export async function GET(request:NextRequest) {
  try { const {client,user}=await requireUser(request); const {data,error}=await client.from('profiles').select('display_name,promptpay_id').eq('id',user.id).maybeSingle(); if(error)throw error; return NextResponse.json({profile:data},{headers:{'Cache-Control':'private, no-store'}}); } catch(error){return apiError(error);}
}
export async function PUT(request:NextRequest) {
  try { const {client,user}=await requireUser(request); const parsed=profileSchema.safeParse(await request.json()); if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??'ข้อมูลไม่ถูกต้อง'},{status:400}); const {error}=await client.from('profiles').upsert({id:user.id,display_name:parsed.data.displayName,promptpay_id:parsed.data.promptpayId}); if(error)throw error; return NextResponse.json({ok:true}); }catch(error){return apiError(error);}
}
