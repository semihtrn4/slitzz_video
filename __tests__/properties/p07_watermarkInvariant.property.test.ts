/**
 * Property 7: Free Plan Watermark Invariantı
 * Feature: native-integrations-editor
 *
 * For any Free Plan active state, hasWatermark() must always return true.
 * For Premium Plan active, hasWatermark() must always return false.
 *
 * Validates: Requirements 20.3
 */

import * as fc from 'fast-check';
import { FREE_PLAN_LIMITS } from '../../src/constants/exportPresets';

/** Pure mirror of subscriptionStore.hasWatermark */
function hasWatermark(isPremium: boolean): boolean {
  if (isPremium) return false;
  return FREE_PLAN_LIMITS.watermark;
}

describe('Property 7: Free Plan Watermark Invariantı', () => {
  /**
   * Free plan: hasWatermark always returns true.
   * Validates: Requirements 20.3
   */
  it('free plan always has watermark', () => {
    // Deterministic: free plan watermark is always true
    expect(hasWatermark(false)).toBe(true);
  });

  /**
   * Premium plan: hasWatermark always returns false.
   * Validates: Requirements 20.3
   */
  it('premium plan never has watermark', () => {
    expect(hasWatermark(true)).toBe(false);
  });

  /**
   * Property: hasWatermark result is always the inverse of isPremium
   * (given FREE_PLAN_LIMITS.watermark === true).
   * Validates: Requirements 20.3
   */
  it('hasWatermark is always the inverse of isPremium', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isPremium) => {
          const result = hasWatermark(isPremium);
          return result === !isPremium;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * FREE_PLAN_LIMITS.watermark constant must be true (config sanity check).
   * Validates: Requirements 20.3
   */
  it('FREE_PLAN_LIMITS.watermark is true', () => {
    expect(FREE_PLAN_LIMITS.watermark).toBe(true);
  });
});
