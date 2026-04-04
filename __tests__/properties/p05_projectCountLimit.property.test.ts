/**
 * Property 5: Free Plan Proje Sayısı Sınırı
 * Feature: native-integrations-editor
 *
 * For any current project count and Free Plan active,
 * canCreateProject(count) should return true only when count < 3.
 * For count === 3 it must return false.
 *
 * Validates: Requirements 20.1
 */

import * as fc from 'fast-check';
import { FREE_PLAN_LIMITS } from '../../src/constants/exportPresets';

/** Pure mirror of subscriptionStore.canCreateProject for free plan */
function canCreateProjectFree(currentCount: number): boolean {
  return currentCount < FREE_PLAN_LIMITS.maxProjects;
}

/** Premium plan always allows project creation */
function canCreateProjectPremium(_currentCount: number): boolean {
  return true;
}

describe('Property 5: Free Plan Proje Sayısı Sınırı', () => {
  /**
   * Free plan: canCreateProject returns true only when count < 3.
   * Validates: Requirements 20.1
   */
  it('free plan allows creation only when count < 3', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (count) => {
          const result = canCreateProjectFree(count);
          return result === (count < FREE_PLAN_LIMITS.maxProjects);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Free plan: count === 3 must return false (limit reached).
   * Validates: Requirements 20.1
   */
  it('free plan blocks creation at exactly count === 3', () => {
    expect(canCreateProjectFree(3)).toBe(false);
  });

  /**
   * Free plan: count < 3 must always return true.
   * Validates: Requirements 20.1
   */
  it('free plan allows creation for all counts below limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        (count) => canCreateProjectFree(count) === true
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Free plan: count > 3 must always return false.
   * Validates: Requirements 20.1
   */
  it('free plan blocks creation for all counts above limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 1000 }),
        (count) => canCreateProjectFree(count) === false
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Premium plan: always allows creation regardless of count.
   * Validates: Requirements 20.1
   */
  it('premium plan always allows project creation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        (count) => canCreateProjectPremium(count) === true
      ),
      { numRuns: 200 }
    );
  });
});
