import {NextResponse,type NextRequest} from 'next/server';
import {z} from 'zod';
import {requireUser,apiError} from '@/lib/server-api';
const friendSchema=z.object({name:z.string().trim().min(1).max(60)});
export async function GET(request:NextRequest){
  try{const {client}=await requireUser(request);const {data,error}=await client.from('friends').select('id,name').order('name');if(error)throw error;return NextResponse.json({friends:data},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiError(error);}
}
export async function POST(request:NextRequest){
  try{const {client,user}=await requireUser(request);const parsed=friendSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'กรอกชื่อเพื่อน 1–60 ตัวอักษร'},{status:400});const {data,error}=await client.from('friends').insert({owner_id:user.id,name:parsed.data.name}).select('id,name').single();if(error)throw error;return NextResponse.json({friend:data});}catch(error){return apiError(error);}
}
export async function DELETE(request:NextRequest){
  try{const {client}=await requireUser(request);const id=z.uuid().parse(request.nextUrl.searchParams.get('id'));const {error}=await client.from('friends').delete().eq('id',id);if(error)throw error;return NextResponse.json({ok:true});}catch(error){return apiError(error);}
}
