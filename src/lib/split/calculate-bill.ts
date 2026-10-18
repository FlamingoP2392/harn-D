import { allocate } from './allocate';

export interface SplitPerson { readonly id: string; readonly name: string }
export interface SplitItem {
  readonly id: string;
  readonly name: string;
  readonly amountSatang: bigint;
  readonly mode: 'equal' | 'weight' | 'fixed';
  readonly participants: readonly { readonly personId: string; readonly weight: bigint; readonly fixedSatang: bigint }[];
}
export interface SplitBill {
  readonly people: readonly SplitPerson[];
  readonly items: readonly SplitItem[];
  readonly serviceBps: bigint;
  readonly vatBps: bigint;
  readonly vatIncluded: boolean;
  readonly discountSatang: bigint;
  readonly paidBy: string | null;
}
export interface Breakdown {
  readonly itemId: string;
  readonly name: string;
  readonly base: bigint;
  readonly service: bigint;
  readonly vat: bigint;
  readonly total: bigint;
}
export interface PersonTotal {
  readonly id: string;
  readonly name: string;
  readonly base: bigint;
  readonly service: bigint;
  readonly vat: bigint;
  readonly discount: bigint;
  readonly total: bigint;
  readonly breakdown: readonly Breakdown[];
}
export interface BillTotal {
  readonly subtotal: bigint;
  readonly service: bigint;
  readonly vat: bigint;
  readonly includedVat: bigint;
  readonly discount: bigint;
  readonly total: bigint;
  readonly people: readonly PersonTotal[];
  readonly transfers: readonly { readonly from: string; readonly to: string; readonly amount: bigint }[];
}

/** Round half up on nonnegative integer ratios, without floating point. */
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('อัตราส่วนไม่ถูกต้อง');
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function proportional(total: bigint, entries: readonly { id: string; value: bigint }[]): Map<string, bigint> {
  const positive = entries.filter(e => e.value > 0n);
  if (positive.length === 0) {
    if (total !== 0n) throw new RangeError('ไม่สามารถกระจายยอดบนฐานราคา 0 ได้');
    return new Map(entries.map(e => [e.id, 0n]));
  }
  return new Map(allocate({ totalSatang: total, participants: positive.map(e => ({ personId: e.id, weight: e.value })) }).map(p => [p.personId, p.amountSatang]));
}

export function calculateBill(bill: SplitBill): BillTotal {
  if (bill.people.length === 0) throw new RangeError('เพิ่มคนในบิลอย่างน้อย 1 คน');
  if (bill.items.length === 0) throw new RangeError('เพิ่มรายการอย่างน้อย 1 รายการ');
  if (bill.serviceBps < 0n || bill.serviceBps > 10_000n || bill.vatBps < 0n || bill.vatBps > 10_000n) throw new RangeError('เปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100');
  const personIds = new Set(bill.people.map(p => p.id));
  if (personIds.size !== bill.people.length || bill.people.some(p => !p.id.trim())) throw new RangeError('รหัสคนในบิลไม่ถูกต้อง');
  if (new Set(bill.items.map(i => i.id)).size !== bill.items.length || bill.items.some(i => !i.id.trim())) throw new RangeError('รหัสรายการไม่ถูกต้อง');
  if (bill.paidBy !== null && !personIds.has(bill.paidBy)) throw new RangeError('ผู้จ่ายต้องอยู่ในบิล');
  const bases = new Map<string, ReadonlyMap<string, bigint>>();
  for (const item of bill.items) {
    if (item.amountSatang < 0n) throw new RangeError('ราคาต้องไม่ติดลบ');
    if (item.participants.length === 0) throw new RangeError(item.name + ': กรุณาเลือกคนหารอย่างน้อย 1 คน');
    const participants = [...item.participants].sort((a, b) => bill.people.findIndex(p => p.id === a.personId) - bill.people.findIndex(p => p.id === b.personId));
    if (new Set(participants.map(p => p.personId)).size !== participants.length || participants.some(p => !personIds.has(p.personId) || p.weight <= 0n || p.fixedSatang < 0n)) throw new RangeError(item.name + ': ข้อมูลคนหารไม่ถูกต้อง');
    if (item.mode === 'fixed') {
      const sum = participants.reduce((s, p) => s + p.fixedSatang, 0n);
      if (sum !== item.amountSatang) throw new RangeError(item.name + ': ยอดระบุเองไม่ตรง ส่วนต่าง ' + (item.amountSatang - sum).toString() + ' สตางค์');
      bases.set(item.id, new Map(participants.map(p => [p.personId, p.fixedSatang])));
    } else if (item.mode === 'equal' || item.mode === 'weight') {
      bases.set(item.id, new Map(allocate({ totalSatang: item.amountSatang, participants: participants.map(p => ({ personId: p.personId, weight: item.mode === 'equal' ? 1n : p.weight })) }).map(p => [p.personId, p.amountSatang])));
    } else throw new RangeError('โหมดหารไม่ถูกต้อง');
  }
  const subtotal = bill.items.reduce((s, i) => s + i.amountSatang, 0n);
  const service = roundRatio(subtotal * bill.serviceBps, 10_000n);
  const serviceByItem = proportional(service, bill.items.map(i => ({ id: i.id, value: i.amountSatang })));
  const vatBase = bill.vatIncluded ? service : subtotal + service;
  const vat = roundRatio(vatBase * bill.vatBps, 10_000n);
  const includedVat = bill.vatIncluded ? roundRatio(subtotal * bill.vatBps, 10_000n + bill.vatBps) : 0n;
  const vatByItem = proportional(vat, bill.items.map(i => ({ id: i.id, value: (bill.vatIncluded ? 0n : i.amountSatang) + (serviceByItem.get(i.id) ?? 0n) })));
  const beforeDiscount = subtotal + service + vat;
  if (bill.discountSatang < 0n || bill.discountSatang > beforeDiscount) throw new RangeError('ส่วนลดต้องไม่ติดลบและต้องไม่เกินยอดรวมบิล');
  const rows = new Map<string, Breakdown[]>(bill.people.map(p => [p.id, []]));
  for (const item of bill.items) {
    const shares = bases.get(item.id);
    if (!shares) throw new RangeError('ไม่พบส่วนแบ่งรายการ');
    const weights = [...shares].map(([id, value]) => ({ id, value }));
    const fees = proportional(serviceByItem.get(item.id) ?? 0n, weights);
    const taxes = proportional(vatByItem.get(item.id) ?? 0n, weights);
    for (const [personId, base] of shares) {
      const fee = fees.get(personId) ?? 0n;
      const tax = taxes.get(personId) ?? 0n;
      rows.get(personId)?.push({ itemId: item.id, name: item.name, base, service: fee, vat: tax, total: base + fee + tax });
    }
  }
  const gross = bill.people.map(p => ({ ...p, breakdown: rows.get(p.id) ?? [] }));
  const discounts = proportional(bill.discountSatang, gross.map(p => ({ id: p.id, value: p.breakdown.reduce((s, r) => s + r.total, 0n) })));
  const people = gross.map(p => {
    const base = p.breakdown.reduce((s, r) => s + r.base, 0n);
    const fee = p.breakdown.reduce((s, r) => s + r.service, 0n);
    const tax = p.breakdown.reduce((s, r) => s + r.vat, 0n);
    const discount = discounts.get(p.id) ?? 0n;
    return { ...p, base, service: fee, vat: tax, discount, total: base + fee + tax - discount };
  });
  const transfers = bill.paidBy === null ? [] : people.filter(p => p.id !== bill.paidBy && p.total > 0n).map(p => ({ from: p.id, to: bill.paidBy as string, amount: p.total }));
  return { subtotal, service, vat, includedVat, discount: bill.discountSatang, total: beforeDiscount - bill.discountSatang, people, transfers };
}

/** Deterministic greedy settlement of a group's integer net balances. */
export function settleBalances(balances: readonly { personId: string; balance: bigint }[]): readonly { from: string; to: string; amount: bigint }[] {
  if (new Set(balances.map(b => b.personId)).size !== balances.length || balances.some(b => !b.personId.trim())) throw new RangeError('รหัสคนต้องไม่ว่างและไม่ซ้ำ');
  if (balances.reduce((s, p) => s + p.balance, 0n) !== 0n) throw new RangeError('ยอดสุทธิต้องรวมเป็นศูนย์');
  const creditors = balances.filter(p => p.balance > 0n).map(p => ({ ...p }));
  const debtors = balances.filter(p => p.balance < 0n).map(p => ({ ...p, balance: -p.balance }));
  const transfers: { from: string; to: string; amount: bigint }[] = [];
  for (const debtor of debtors) for (const creditor of creditors) {
    const amount = debtor.balance < creditor.balance ? debtor.balance : creditor.balance;
    if (amount > 0n) { transfers.push({ from: debtor.personId, to: creditor.personId, amount }); debtor.balance -= amount; creditor.balance -= amount; }
  }
  return transfers;
}
