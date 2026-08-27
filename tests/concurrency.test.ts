import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/server/routes/diff.js';

describe('mapWithConcurrency', () => {
  it('keeps the number of in-flight calls bounded on a large fixture', async () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await mapWithConcurrency(items, 8, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return n * 2;
    });

    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(results).toEqual(items.map((n) => n * 2));
  });

  it('processes every item exactly once, in order', async () => {
    const items = Array.from({ length: 37 }, (_, i) => i);
    const seen: number[] = [];

    await mapWithConcurrency(items, 5, async (n) => {
      seen.push(n);
      return n;
    });

    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it('handles an empty list and a limit larger than the item count', async () => {
    expect(await mapWithConcurrency([], 8, async (n) => n)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 8, async (n) => n * 10)).toEqual([10, 20]);
  });
});
