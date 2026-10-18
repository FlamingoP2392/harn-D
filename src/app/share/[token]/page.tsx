import {z} from 'zod';
import {createClient} from '@supabase/supabase-js';
import {billSchema,toSplitBill} from '@/lib/validation/bill';
import {calculateBill} from '@/lib/split/calculate-bill';
import {SharedBill} from '@/components/shared-bill';
export const dynamic='force-dynamic';
export const metadata={title:'สรุปบิลที่แชร์ — หารดี',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let shared:z.infer<typeof schema>|null=null;
  const schema=z.object({bill:billSchema,promptpayId:z.string()});
  if(url&&key&&/^[0-9a-f]{64}$/.test(token)){
    try{const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const response=await client.rpc('read_shared_bill',{token});const data:unknown=response.data;const error=response.error;if(!error){const parsed=schema.safeParse(data);if(parsed.success){calculateBill(toSplitBill(parsed.data.bill));shared=parsed.data;}}}catch{/* Render a generic unavailable state without leaking bill existence. */}
  }
  if(!shared)return <main className="app-loading"><h1 style={{fontSize:25}}>ลิงก์นี้ใช้งานไม่ได้แล้ว</h1><p>ลิงก์อาจถูกเพิกถอน หรือยังไม่ได้เชื่อมต่อระบบ</p><a className="primary" href="/">สร้างบิลของคุณเอง</a></main>;
  return <SharedBill bill={shared.bill} promptpayId={shared.promptpayId}/>;
}
