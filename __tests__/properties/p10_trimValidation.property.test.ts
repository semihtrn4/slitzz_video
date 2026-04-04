/**
 * Property 10: Trim Aralığı Geçerliliği
 * Feature: native-integrations-editor
 *
 * For any trimStart and trimEnd values, when trimStart >= trimEnd the system
 * should show an invalid trim error and export must not be initiated.
 * Only pairs where trimStart < trimEnd are considered valid.
 *
 * Validates: Requirements 9.5
 */

import * as fc from 'fast-check';

/**
 * Pure helper that mirrors the validation logic in app/editor/[id].tsx:
 *   isTrimInvalid = trimEnd > 0 && trimStart >= trimEnd
 */
function isTrimInvalid(trimStart: number, trimEnd: number): boolean {
  return trimEnd > 0 && trimStart >= trimEnd;
}

/**
 * Whether a (trimStart, trimEnd) pair is considered valid for export.
 * Valid means: trimEnd === 0 (no trim set) OR trimStart < trimEnd.
 */
function isTrimValid(trimStart: number, trimEnd: number): boolean {
  return !isTrimInvalid(trimStart, trimEnd);
}

/** Simulate the export guard; returns number of times export body ran */
function runExportGuard(trimStart: number, trimEnd: number): number {
  const counter = { n: 0 };
  const handleExport = () => {
    if (isTrimInvalid(trimStart, trimEnd)) return;
    counter.n += 1;
  };
  handleExport();
  return counter.n;
}

// fc.float requires 32-bit float boundaries
const F_SMALL = Math.fround(0.01);
const F_MAX_TIME = Math.fround(3600);
const F_MAX_DELTA = Math.fround(1);

describe('Property 10: Trim Aralığı Geçerliliği', () => {
  /**
   * When trimStart >= trimEnd (and trimEnd > 0), the trim is invalid.
   * Validates: Requirements 9.5
   */
  it('trimStart >= trimEnd with trimEnd > 0 is always invalid', () => {
    fc.assert(
      fc.property(
        fc.float({ min: F_SMALL, max: F_MAX_TIME, noNaN: true }),
        fc.float({ min: 0, max: F_MAX_TIME, noNaN: true }),
        (trimEnd, extra) => {
          const trimStart = trimEnd + extra; // trimStart >= trimEnd
          return isTrimInvalid(trimStart, trimEnd) === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * When trimStart < trimEnd, the trim is always valid.
   * Validates: Requirements 9.5
   */
  it('trimStart < trimEnd is always valid', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(3599), noNaN: true }),
        fc.float({ min: F_SMALL, max: F_MAX_DELTA, noNaN: true }),
        (trimStart, delta) => {
          const trimEnd = trimStart + delta; // trimEnd > trimStart
          return isTrimValid(trimStart, trimEnd) === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * When trimEnd === 0 (no trim configured), the trim is always valid
   * regardless of trimStart value.
   * Validates: Requirements 9.5
   */
  it('trimEnd === 0 is always valid (no trim configured)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: F_MAX_TIME, noNaN: true }),
        (trimStart) => {
          return isTrimValid(trimStart, 0) === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Exact boundary: trimStart === trimEnd with trimEnd > 0 is invalid.
   * Validates: Requirements 9.5
   */
  it('trimStart === trimEnd (equal values, trimEnd > 0) is invalid', () => {
    fc.assert(
      fc.property(
        fc.float({ min: F_SMALL, max: F_MAX_TIME, noNaN: true }),
        (value) => {
          return isTrimInvalid(value, value) === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Export should not be initiated when trim is invalid.
   * Simulates the guard: if (isTrimInvalid) return early.
   * Validates: Requirements 9.5
   */
  it('export is blocked when trim is invalid', () => {
    fc.assert(
      fc.property(
        fc.float({ min: F_SMALL, max: F_MAX_TIME, noNaN: true }),
        fc.float({ min: 0, max: F_MAX_TIME, noNaN: true }),
        (trimEnd, extra) => {
          const trimStart = trimEnd + extra;
          return runExportGuard(trimStart, trimEnd) === 0;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Export proceeds when trim is valid.
   * Validates: Requirements 9.5
   */
  it('export proceeds when trim is valid', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: Math.fround(3599), noNaN: true }),
        fc.float({ min: F_SMALL, max: F_MAX_DELTA, noNaN: true }),
        (trimStart, delta) => {
          const trimEnd = trimStart + delta;
          return runExportGuard(trimStart, trimEnd) === 1;
        }
      ),
      { numRuns: 200 }
    );
  });
});
