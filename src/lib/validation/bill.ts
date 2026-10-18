import { z } from 'zod';
import type { SplitBill } from '../split/calculate-bill';

export function parseDecimal(value: string, places: number): bigint {
  if (!Number.isInteger(places) || places < 0 || places > 6 || !/^\d+(?:\.\d+)?$/.test(value)) throw new RangeError('รูปแบบตัวเลขไม่ถูกต้อง');
  const [whole = '0', fraction = ''] = value.split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > places) throw new RangeError('รูปแบบตัวเลขไม่ถูกต้อง');
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
}
const decimal = (places: number, maxScaled: bigint, positive = false) => {
  const pattern = new RegExp('^\\d+(?:\\.\\d{1,' + places.toString() + '})?$');
  return z.string().trim().max(24).regex(pattern, 'กรอกตัวเลขและทศนิยมไม่เกิน ' + places.toString() + ' ตำแหน่ง').superRefine((value, context) => {
    if (!pattern.test(value) || value.length > 24) return;
    const scaled = parseDecimal(value, places);
    if (scaled > maxScaled || (positive && scaled === 0n)) context.addIssue({ code: 'custom', message: positive ? 'ค่าต้องมากกว่า 0 และไม่เกินขอบเขต' : 'จำนวนเกินขอบเขตที่รองรับ' });
  });
};
export const moneySchema = decimal(2, 99_999_999_999n);
export const weightSchema = decimal(6, 999_999_999_999n, true);
export const percentSchema = decimal(2, 10_000n);
const participantSchema = z.object({ personId: z.uuid(), weight: weightSchema, fixed: moneySchema });
export const personSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1, 'กรอกชื่อคน').max(60), friendId: z.uuid().nullable().default(null) });
export const itemSchema = z.object({
  id: z.uuid(), name: z.string().trim().min(1, 'กรอกชื่อรายการ').max(120), amount: moneySchema,
  mode: z.enum(['equal', 'weight', 'fixed']), participants: z.array(participantSchema),
});
export const billSchema = z.object({
  id: z.uuid(), title: z.string().trim().min(1, 'กรอกชื่อบิล').max(120), date: z.iso.date(),
  people: z.array(personSchema).min(1, 'เพิ่มคนอย่างน้อย 1 คน'), items: z.array(itemSchema).min(1, 'เพิ่มรายการอย่างน้อย 1 รายการ'),
  service: percentSchema, vat: percentSchema, vatIncluded: z.boolean(), discount: moneySchema,
  paidBy: z.uuid().nullable(), paid: z.array(z.uuid()), updatedAt: z.iso.datetime(),
}).superRefine((bill, context) => {
  const ids = new Set(bill.people.map(p => p.id));
  if (ids.size !== bill.people.length) context.addIssue({ code: 'custom', path: ['people'], message: 'คนในบิลต้องไม่ซ้ำ' });
  if (new Set(bill.items.map(i => i.id)).size !== bill.items.length) context.addIssue({ code: 'custom', path: ['items'], message: 'รหัสรายการซ้ำ' });
  if (bill.paidBy && !ids.has(bill.paidBy)) context.addIssue({ code: 'custom', path: ['paidBy'], message: 'ผู้จ่ายต้องอยู่ในบิล' });
  if (bill.paid.some(id => !ids.has(id)) || new Set(bill.paid).size !== bill.paid.length) context.addIssue({ code: 'custom', path: ['paid'], message: 'สถานะโอนไม่ถูกต้อง' });
  bill.items.forEach((item, index) => {
    if (!item.participants.length) context.addIssue({ code: 'custom', path: ['items', index, 'participants'], message: item.name + ': เลือกคนหารอย่างน้อย 1 คน' });
    if (new Set(item.participants.map(p => p.personId)).size !== item.participants.length || item.participants.some(p => !ids.has(p.personId))) context.addIssue({ code: 'custom', path: ['items', index], message: 'คนหารไม่ถูกต้อง' });
    if (item.mode === 'fixed' && moneySchema.safeParse(item.amount).success && item.participants.every(p => moneySchema.safeParse(p.fixed).success)) {
      const difference = parseDecimal(item.amount, 2) - item.participants.reduce((s, p) => s + parseDecimal(p.fixed, 2), 0n);
      if (difference !== 0n) context.addIssue({ code: 'custom', path: ['items', index], message: item.name + ': ยอดระบุเองไม่ตรง ส่วนต่าง ' + difference.toString() + ' สตางค์' });
    }
  });
});
export type BillDraft = z.infer<typeof billSchema>;
export type PersonDraft = z.infer<typeof personSchema>;
export type ItemDraft = z.infer<typeof itemSchema>;
export function toSplitBill(bill: BillDraft): SplitBill {
  return {
    people: bill.people, paidBy: bill.paidBy,
    items: bill.items.map(item => ({ id: item.id, name: item.name, amountSatang: parseDecimal(item.amount, 2), mode: item.mode, participants: item.participants.map(p => ({ personId: p.personId, weight: parseDecimal(p.weight, 6), fixedSatang: parseDecimal(p.fixed, 2) })) })),
    serviceBps: parseDecimal(bill.service, 2), vatBps: parseDecimal(bill.vat, 2), vatIncluded: bill.vatIncluded, discountSatang: parseDecimal(bill.discount, 2),
  };
}
export const promptpaySchema = z.string().trim().refine(value => value === '' || /^0\d{9}$/.test(value) || /^\d{13}$/.test(value), 'ใช้เบอร์โทร 10 หลักขึ้นต้น 0 หรือเลขพร้อมเพย์ 13 หลัก');
export const profileSchema = z.object({ displayName: z.string().trim().min(1).max(80), promptpayId: promptpaySchema });
