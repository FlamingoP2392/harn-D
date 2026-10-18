import generatePayload from 'promptpay-qr';
import { decimalMoney } from './money';
import { promptpaySchema } from './validation/bill';

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const char of payload) {
    crc ^= char.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export function promptpayPayload(target: string, amountSatang: bigint): string {
  const parsed = promptpaySchema.parse(target);
  if (!parsed || amountSatang <= 0n || amountSatang > 99_999_999_999n) throw new RangeError('ยอดหรือเลขพร้อมเพย์ไม่ถูกต้อง');
  // promptpay-qr builds the recipient block; inject the exact decimal amount
  // ourselves to avoid its Number.toFixed() conversion of money.
  const base = generatePayload(parsed, {}).slice(0, -8).replace('010211', '010212');
  const amount = decimalMoney(amountSatang);
  const body = base + '54' + amount.length.toString().padStart(2, '0') + amount + '6304';
  return body + crc16(body);
}
