import { describe, expect, it } from 'vitest';
import { allocate } from '../allocate';
import type { AllocateInput, AllocationParticipant } from '../types';

const equalPeople = [
  { personId: 'A', weight: 1n },
  { personId: 'B', weight: 1n },
  { personId: 'C', weight: 1n },
] as const;

const cases = [
  {
    name: '100 baht / 3 people conserves every satang',
    totalSatang: 10_000n,
    participants: equalPeople,
    expected: [3_334n, 3_333n, 3_333n],
  },
  {
    name: 'one satang / 3 people uses input order for tied remainders',
    totalSatang: 1n,
    participants: equalPeople,
    expected: [1n, 0n, 0n],
  },
  {
    name: 'two satang / 3 people awards one to each of the first two',
    totalSatang: 2n,
    participants: equalPeople,
    expected: [1n, 1n, 0n],
  },
  {
    name: 'zero total with valid participants produces zeros',
    totalSatang: 0n,
    participants: equalPeople,
    expected: [0n, 0n, 0n],
  },
  {
    name: 'ten million baht / 3 people remains exact',
    totalSatang: 1_000_000_000n,
    participants: equalPeople,
    expected: [333_333_334n, 333_333_333n, 333_333_333n],
  },
  {
    name: 'one person receives the full amount',
    totalSatang: 12_345n,
    participants: [{ personId: 'A', weight: 7n }],
    expected: [12_345n],
  },
  {
    name: 'weights 1:2:3 divide proportionally',
    totalSatang: 10_000n,
    participants: [
      { personId: 'A', weight: 1n },
      { personId: 'B', weight: 2n },
      { personId: 'C', weight: 3n },
    ],
    expected: [1_667n, 3_333n, 5_000n],
  },
  {
    name: 'largest remainder wins even when it appears later',
    totalSatang: 1n,
    participants: [
      { personId: 'A', weight: 1n },
      { personId: 'B', weight: 3n },
    ],
    expected: [0n, 1n],
  },
  {
    name: 'decimal weights 1.25 and 2.5 use a shared integer scale',
    totalSatang: 10_000n,
    participants: [
      { personId: 'A', weight: 1_250_000n },
      { personId: 'B', weight: 2_500_000n },
    ],
    expected: [3_333n, 6_667n],
  },
  {
    name: 'ties follow insertion order, not alphabetical person ID',
    totalSatang: 1n,
    participants: [
      { personId: 'Z', weight: 1n },
      { personId: 'A', weight: 1n },
    ],
    expected: [1n, 0n],
  },
  {
    name: 'intermediate products beyond Number precision remain exact',
    totalSatang: 1_000_000_000n,
    participants: [
      { personId: 'A', weight: 9_007_199_254_740_993n },
      { personId: 'B', weight: 9_007_199_254_740_993n },
    ],
    expected: [500_000_000n, 500_000_000n],
  },
] satisfies readonly {
  name: string;
  totalSatang: bigint;
  participants: readonly AllocationParticipant[];
  expected: readonly bigint[];
}[];

describe('allocate: valid inputs', () => {
  it.each(cases)('$name', ({ totalSatang, participants, expected }) => {
    const result = allocate({ totalSatang, participants });
    expect(result).toEqual(
      participants.map((person, index) => ({
        personId: person.personId,
        amountSatang: expected[index],
      })),
    );
    expect(result.reduce((sum, person) => sum + person.amountSatang, 0n))
      .toBe(totalSatang);
  });

  it('accepts frozen input without changing people, weights, or their order', () => {
    const participants = Object.freeze([
      Object.freeze({ personId: 'Z', weight: 1n }),
      Object.freeze({ personId: 'A', weight: 3n }),
    ]);
    const input = Object.freeze({ totalSatang: 1n, participants });
    expect(allocate(input)).toEqual([
      { personId: 'Z', amountSatang: 0n },
      { personId: 'A', amountSatang: 1n },
    ]);
    expect(input).toEqual({
      totalSatang: 1n,
      participants: [
        { personId: 'Z', weight: 1n },
        { personId: 'A', weight: 3n },
      ],
    });
  });
});

const invalidCases = [
  { name: 'negative total', totalSatang: -1n, participants: equalPeople },
  { name: 'empty participants', totalSatang: 100n, participants: [] },
  { name: 'empty participants even with zero total', totalSatang: 0n, participants: [] },
  {
    name: 'zero weight', totalSatang: 100n,
    participants: [{ personId: 'A', weight: 0n }],
  },
  {
    name: 'negative weight', totalSatang: 100n,
    participants: [{ personId: 'A', weight: -1n }],
  },
  {
    name: 'duplicate person IDs', totalSatang: 100n,
    participants: [{ personId: 'A', weight: 1n }, { personId: 'A', weight: 2n }],
  },
  {
    name: 'empty person ID', totalSatang: 100n,
    participants: [{ personId: '', weight: 1n }],
  },
  {
    name: 'blank person ID', totalSatang: 100n,
    participants: [{ personId: '   ', weight: 1n }],
  },
] satisfies readonly (AllocateInput & { readonly name: string })[];

describe('allocate: invalid inputs', () => {
  it.each(invalidCases)('rejects $name with a descriptive RangeError', (input) => {
    expect(() => allocate(input)).toThrow(RangeError);
    expect(() => allocate(input)).toThrow(/\S/);
  });
});
