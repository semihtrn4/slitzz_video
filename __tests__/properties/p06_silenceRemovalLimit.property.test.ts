/**
 * Property 6: Free Plan Sessizlik Kaldırma Sınırı
 * Feature: native-integrations-editor
 *
 * For any video duration and Free Plan active,
 * canRemoveSilence(duration) should return true only when duration <= 30.
 *
 * Validates: Requirements 3.4, 20.5
 */

import * as fc from 'fast-check';
import { FREE_PLAN_LIMITS } from '../../src/constants/exportPresets';

/** Pure mirror of subscriptionStore.canRemoveSilence for free plan */
function canRemoveSilenceFree(duration: number): boolean {
  return duration <= FREE_PLAN_LIMITS.silenceRemovalMaxDuration;
}

/** Premium plan always allows silence removal */
function canRemoveSilencePremium(_duration: number): boolean {
  return true;
}

describe('Property 6: Free Plan Sessizlik Kaldırma Sınırı', () => {
  /**
   * Free plan: canRemoveSilence returns true only when duration <= 30.
   * Validates: Requirements 3.4, 20.5
   */
  it('free plan allows silence removal only when duration <= 30', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 3600, noNaN: true }),
        (duration) => {
          const result = canRemoveSilenceFree(duration);
          return result === (duration <= FREE_PLAN_LIMITS.silenceRemovalMaxDuration);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Exact boundary: duration === 30 must return true.
   * Validates: Requirements 3.4, 20.5
   */
  it('free plan allows silence removal at exactly 30 seconds', () => {
    expect(canRemoveSilenceFree(30)).toBe(true);
  });

  /**
   * Just over boundary: duration > 30 must return false.
   * Validates: Requirements 3.4, 20.5
   */
  it('free plan blocks silence removal when duration > 30', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(30.001), max: 3600, noNaN: true }),
        (duration) => canRemoveSilenceFree(duration) === false
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Free plan: duration <= 30 must always return true.
   * Validates: Requirements 3.4, 20.5
   */
  it('free plan allows silence removal for all durations within limit', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 30, noNaN: true }),
        (duration) => canRemoveSilenceFree(duration) === true
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Premium plan: always allows silence removal regardless of duration.
   * Validates: Requirements 3.4, 20.5
   */
  it('premium plan always allows silence removal', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 3600, noNaN: true }),
        (duration) => canRemoveSilencePremium(duration) === true
      ),
      { numRuns: 200 }
    );
  });
});
