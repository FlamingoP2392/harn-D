declare module 'promptpay-qr' {
  export default function generatePayload(target: string, options?: { amount?: number }): string;
}
