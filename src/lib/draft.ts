import { z } from 'zod';
import { billSchema, type BillDraft } from './validation/bill';
export const STORAGE_KEY = 'handi:bills:v1';
export const storageSchema = z.object({ version: z.literal(1), bills: z.array(billSchema), activeId: z.uuid().nullable() });
export function localDate(): string {
  const now = new Date();
  return [now.getFullYear().toString(), (now.getMonth() + 1).toString().padStart(2, '0'), now.getDate().toString().padStart(2, '0')].join('-');
}
export function newBill(): BillDraft {
  const people = ['คุณ', 'เพื่อน 1'].map(name => ({ id: crypto.randomUUID(), name, friendId: null }));
  return { id: crypto.randomUUID(), title: 'บิลใหม่ของเรา', date: localDate(), people, items: [], service: '0', vat: '0', vatIncluded: false, discount: '0', paidBy: null, paid: [], updatedAt: new Date().toISOString() };
}
export function sampleBill(template: 'dinner' | 'bbq' | 'trip' = 'dinner'): BillDraft {
  const people = ['คุณ', 'เมย์', 'ต้น', 'พลอย'].map(name => ({ id: crypto.randomUUID(), name, friendId: null }));
  const names = template === 'trip' ? ['ที่พัก 1 คืน', 'อาหารเย็น', 'ค่าน้ำมัน'] : template === 'bbq' ? ['ชุดปิ้งย่าง', 'เครื่องดื่ม', 'ของหวาน'] : ['พิซซ่าทรัฟเฟิล', 'พาสต้าเบคอน', 'เครื่องดื่ม'];
  const amounts = template === 'trip' ? ['2400', '800', '600'] : template === 'bbq' ? ['1299', '180', '120'] : ['590', '320', '180'];
  return { id: crypto.randomUUID(), title: template === 'trip' ? 'ทริปนี้มีแต่ความทรงจำ' : template === 'bbq' ? 'ปิ้งย่างกับแก๊ง' : 'มื้ออร่อยกับคนโปรด', date: localDate(), people,
    items: names.map((name, index) => ({ id: crypto.randomUUID(), name, amount: amounts[index] ?? '0', mode: 'equal', participants: people.filter((_, p) => index === 0 || p !== (index === 1 ? 3 : 2)).map(p => ({ personId: p.id, weight: '1', fixed: '0' })) })),
    service: '10', vat: '7', vatIncluded: false, discount: '0', paidBy: null, paid: [], updatedAt: new Date().toISOString() };
}
// Drafts can be temporarily incomplete while editing; validate the envelope and field
// shapes here, then apply all calculation refinements before export or cloud writes.
const editableBillSchema = billSchema.safeExtend({ title: z.string().max(120), date:z.string().max(10), people: z.array(z.object({ id: z.uuid(), name: z.string().max(60), friendId: z.uuid().nullable() })), items: z.array(z.object({ id: z.uuid(), name: z.string().max(120), amount: z.string().max(24), mode: z.enum(['equal','weight','fixed']), participants: z.array(z.object({ personId:z.uuid(), weight:z.string().max(24), fixed:z.string().max(24) })) })), service:z.string().max(24),vat:z.string().max(24),discount:z.string().max(24) });
// safeExtend preserves refinements; remove them for incomplete edit persistence.
export const editableStorageSchema = z.object({ version:z.literal(1), bills:z.array(z.object(editableBillSchema.shape)), activeId:z.uuid().nullable() });
export function readLocalBills(): { bills: BillDraft[]; activeId: string | null; error: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bills: [], activeId:null, error:null };
    const parsed = editableStorageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { bills:[], activeId:null, error:'ข้อมูลเดิมมีรูปแบบไม่รองรับ จึงยังไม่เขียนทับ คุณสามารถดาวน์โหลดข้อมูลสำรองได้' };
    return { ...parsed.data, error:null };
  } catch { return { bills:[], activeId:null, error:'อ่านข้อมูลในเครื่องไม่ได้ กรุณาเปิดสิทธิ์พื้นที่จัดเก็บของเบราว์เซอร์' }; }
}
export function writeLocalBills(bills: BillDraft[], activeId:string | null): string | null {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:1, bills, activeId })); return null; }
  catch { return 'บันทึกในเครื่องไม่สำเร็จ พื้นที่อาจเต็ม กรุณาดาวน์โหลดข้อมูลสำรอง'; }
}
