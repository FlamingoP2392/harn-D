import type { AllocateInput, Allocation } from './types';

export function allocate({ totalSatang, participants }: AllocateInput): readonly Allocation[] {
  if (totalSatang < 0n) throw new RangeError('ยอดเงินต้องไม่ติดลบ');
  if (participants.length === 0) throw new RangeError('กรุณาเลือกคนหารอย่างน้อย 1 คน');
  const ids = new Set<string>();
  for (const person of participants) {
    if (!person.personId.trim() || ids.has(person.personId)) throw new RangeError('รหัสคนหารต้องไม่ว่างและไม่ซ้ำ');
    if (person.weight <= 0n) throw new RangeError('น้ำหนักต้องมากกว่า 0');
    ids.add(person.personId);
  }
  const weightSum = participants.reduce((sum, p) => sum + p.weight, 0n);
  const quotas = participants.map((p, index) => ({
    personId: p.personId, index,
    amountSatang: totalSatang * p.weight / weightSum,
    remainder: totalSatang * p.weight % weightSum,
  }));
  let left = totalSatang - quotas.reduce((sum, p) => sum + p.amountSatang, 0n);
  const ranked = [...quotas].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const quota of ranked) {
    if (left === 0n) break;
    quota.amountSatang += 1n;
    left -= 1n;
  }
  return quotas.map(({ personId, amountSatang }) => ({ personId, amountSatang }));
}
