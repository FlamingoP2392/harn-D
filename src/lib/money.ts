export function baht(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return (negative ? '−' : '') + (absolute / 100n).toLocaleString('th-TH') + '.' + (absolute % 100n).toString().padStart(2, '0');
}
export function decimalMoney(value: bigint): string {
  return (value / 100n).toString() + '.' + (value % 100n).toString().padStart(2, '0');
}
