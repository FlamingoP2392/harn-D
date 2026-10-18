import {NextResponse,type NextRequest} from 'next/server';
import {z} from 'zod';
import {requireUser,apiError} from '@/lib/server-api';
export async function POST(request:NextRequest){
  try{const {client}=await requireUser(request);const parsed=z.object({billId:z.uuid()}).safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'รหัสบิลไม่ถูกต้อง'},{status:400});const response=await client.rpc('create_share_link',{target_bill:parsed.data.billId});const data:unknown=response.data;const error=response.error;if(error)throw error;return NextResponse.json({token:z.string().regex(/^[0-9a-f]{64}$/).parse(data)});}catch(error){return apiError(error);}
}
export async function DELETE(request:NextRequest){
  try{const {client}=await requireUser(request);const id=z.uuid().parse(request.nextUrl.searchParams.get('id'));const {error}=await client.rpc('revoke_share_link',{target_bill:id});if(error)throw error;return NextResponse.json({ok:true});}catch(error){return apiError(error);}
}
