import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  const store = await cookies();
  return createServerClient(url, key, { cookies: {
    getAll: () => store.getAll(),
    setAll: values => { try { values.forEach(({name,value,options}) => store.set(name,value,options)); } catch { /* Server component cookies are refreshed by proxy. */ } },
  } });
}
