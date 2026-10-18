import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate } from '../allocate';

const allocationInputs = fc.record({
  totalSatang: fc.bigInt({ min: 0n, max: 1_000_000_000n }),
  weights: fc.array(fc.bigInt({ min: 1n, max: 100_000_000n }), {
    minLength: 1,
    maxLength: 30,
  }),
}).map(({ totalSatang, weights }) => ({
  totalSatang,
  participants: weights.map((weight, index) => ({
    personId: 'person-' + index.toString(),
    weight,
  })),
}));

const options = { seed: 20261018, numRuns: 300 };

describe('allocate: generated properties', () => {
  it('conserves the total and gives every person a nonnegative integer amount', () => {
    fc.assert(fc.property(allocationInputs, (input) => {
      const result = allocate(input);
      expect(result.map((person) => person.personId))
        .toEqual(input.participants.map((person) => person.personId));
      expect(result.reduce((sum, person) => sum + person.amountSatang, 0n))
        .toBe(input.totalSatang);
      for (const person of result) {
        expect(typeof person.amountSatang).toBe('bigint');
        expect(person.amountSatang).toBeGreaterThanOrEqual(0n);
      }
    }), options);
  });

  it('is deterministic and leaves input unchanged', () => {
    fc.assert(fc.property(allocationInputs, (input) => {
      const before = structuredClone(input);
      expect(allocate(input)).toEqual(allocate(input));
      expect(input).toEqual(before);
    }), options);
  });

  it('allocates either the floor or ceiling of each exact weighted quota', () => {
    fc.assert(fc.property(allocationInputs, (input) => {
      const result = allocate(input);
      const weightSum = input.participants.reduce((sum, person) => sum + person.weight, 0n);
      input.participants.forEach((person, index) => {
        const product = input.totalSatang * person.weight;
        const floor = product / weightSum;
        const ceiling = floor + (product % weightSum === 0n ? 0n : 1n);
        const allocation = result[index];
        expect(allocation).toBeDefined();
        expect(allocation?.amountSatang === floor || allocation?.amountSatang === ceiling)
          .toBe(true);
      });
    }), options);
  });
});
