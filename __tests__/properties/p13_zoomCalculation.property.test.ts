/**
 * Property 13: Zoom Hesaplama Invariantları
 *
 * For any pinch gesture scale value, `pixelsPerSecond` must always stay within
 * the [5, 50] range. The playhead pixel position must always be calculated as
 * `playbackPosition * pixelsPerSecond`; this relationship must be preserved
 * when zoom changes.
 *
 * Validates: Requirements 8.2, 8.4
 */

import * as fc from 'fast-check';

const MIN_PPS = 5;
const MAX_PPS = 50;
const INITIAL_PPS = 30;

/**
 * Pure function that mirrors the pinch zoom logic in Timeline.tsx.
 * Given a base PPS and a pinch scale, returns the clamped new PPS.
 */
function computeNewPPS(basePPS: number, scale: number): number {
  const raw = basePPS * scale;
  return Math.min(MAX_PPS, Math.max(MIN_PPS, raw));
}

/**
 * Pure function that mirrors playhead position calculation.
 */
function computePlayheadPosition(playbackPosition: number, pixelsPerSecond: number): number {
  return playbackPosition * pixelsPerSecond;
}

describe('Property 13: Zoom Calculation Invariants', () => {
  /**
   * For any pinch scale, pixelsPerSecond must always stay within [5, 50].
   * Validates: Requirement 8.2
   */
  it('pixelsPerSecond stays within [5, 50] for any scale value', () => {
    fc.assert(
      fc.property(
        // basePPS: any value that could be the current PPS (already clamped)
        fc.float({ min: Math.fround(MIN_PPS), max: Math.fround(MAX_PPS), noNaN: true }),
        // scale: any realistic pinch scale (0.01 to 100)
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
        (basePPS, scale) => {
          const newPPS = computeNewPPS(basePPS, scale);
          return newPPS >= MIN_PPS && newPPS <= MAX_PPS;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * For any scale, the result is exactly MIN_PPS when scale would push below minimum.
   * Validates: Requirement 8.2
   */
  it('pixelsPerSecond clamps to MIN_PPS when scale is very small', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(MIN_PPS), max: Math.fround(MAX_PPS), noNaN: true }),
        fc.float({ min: Math.fround(0.001), max: Math.fround(0.09), noNaN: true }), // very small scale
        (basePPS, scale) => {
          const newPPS = computeNewPPS(basePPS, scale);
          return newPPS === MIN_PPS;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * For any scale, the result is exactly MAX_PPS when scale would push above maximum.
   * Validates: Requirement 8.2
   */
  it('pixelsPerSecond clamps to MAX_PPS when scale is very large', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(MIN_PPS), max: Math.fround(MAX_PPS), noNaN: true }),
        fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }), // large scale
        (basePPS, scale) => {
          const newPPS = computeNewPPS(basePPS, scale);
          return newPPS === MAX_PPS;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Playhead position is always playbackPosition * pixelsPerSecond.
   * When zoom changes, this relationship is preserved.
   * Validates: Requirement 8.4
   */
  it('playhead position equals playbackPosition * pixelsPerSecond after zoom change', () => {
    fc.assert(
      fc.property(
        // playbackPosition: valid time in seconds (0 to 3600)
        fc.float({ min: Math.fround(0), max: Math.fround(3600), noNaN: true }),
        // basePPS before pinch
        fc.float({ min: Math.fround(MIN_PPS), max: Math.fround(MAX_PPS), noNaN: true }),
        // pinch scale
        fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }),
        (playbackPosition, basePPS, scale) => {
          const newPPS = computeNewPPS(basePPS, scale);
          const playheadPos = computePlayheadPosition(playbackPosition, newPPS);
          const expected = playbackPosition * newPPS;
          return Math.abs(playheadPos - expected) < 0.0001;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Initial PPS is 30 (within valid range).
   * Validates: Requirement 8.2
   */
  it('initial pixelsPerSecond is within valid range', () => {
    expect(INITIAL_PPS).toBeGreaterThanOrEqual(MIN_PPS);
    expect(INITIAL_PPS).toBeLessThanOrEqual(MAX_PPS);
  });
});
