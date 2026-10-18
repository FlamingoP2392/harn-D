/** Money in integer satang. Convert decimal input at the application boundary. */
export type Satang = bigint;

export interface AllocationParticipant {
  readonly personId: string;
  /** Positive integer ratio; decimal weights must share one integer scale. */
  readonly weight: bigint;
}

export interface AllocateInput {
  readonly totalSatang: Satang;
  /** Input order is the stable tie-break order. */
  readonly participants: readonly AllocationParticipant[];
}

export interface Allocation {
  readonly personId: string;
  readonly amountSatang: Satang;
}
