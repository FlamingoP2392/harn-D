import {billSchema} from '@/lib/validation/bill';
import {NextResponse,type NextRequest} from 'next/server';
import {z} from 'zod';
import {requireUser,apiError} from '@/lib/server-api';
const schema=z.object({billId:z.uuid(),personId:z.uuid(),paid:z.boolean()});
export async function PATCH(request:NextRequest){
  try{const {client}=await requireUser(request);const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'ข้อมูลสถานะไม่ถูกต้อง'},{status:400});const {billId,personId,paid}=parsed.data;const response=await client.rpc('mark_payment',{target_bill:billId,target_person:personId,is_paid:paid});if(response.error)throw response.error;const data:unknown=response.data;return NextResponse.json({bill:billSchema.parse(data)});}catch(error){return apiError(error);}
}
