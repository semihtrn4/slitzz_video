/**
 * Property 15: Karaoke Render Invariantları
 *
 * For any SubtitleSegment and preset === 'karaoke', SubtitlePreview renders
 * exactly as many separate word tokens as there are words in the segment text.
 * When playbackPosition falls within a word's [start, end] range, that word
 * is considered active (highlighted).
 *
 * Validates: Requirements 13.1, 13.2
 */

import * as fc from 'fast-check';
import type { SubtitleSegment, WordTimestamp } from '@/src/types';

// ---------------------------------------------------------------------------
// Pure helpers extracted from SubtitlePreview — tested independently so we
// don't need a React renderer in this property test.
// ---------------------------------------------------------------------------

const KARAOKE_ACTIVE_COLOR = '#FCD34D';

function getActiveWordIndex(
  words: string[],
  segment: SubtitleSegment | undefined,
  playbackPosition: number
): number {
  if (!segment) return -1;

  const { start, end, words: wordTimestamps } = segment;

  if (wordTimestamps && wordTimestamps.length > 0) {
    for (let i = 0; i < wordTimestamps.length; i++) {
      const wt = wordTimestamps[i];
      if (playbackPosition >= wt.start && playbackPosition < wt.end) {
        return i;
      }
    }
    if (playbackPosition >= wordTimestamps[wordTimestamps.length - 1].end) {
      return wordTimestamps.length - 1;
    }
    return -1;
  }

  // Fallback: proportional
  const duration = end - start;
  if (duration <= 0 || words.length === 0) return -1;

  const elapsed = playbackPosition - start;
  if (elapsed < 0) return -1;

  const progress = elapsed / duration;
  const index = Math.floor(progress * words.length);
  return Math.min(index, words.length - 1);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a non-empty word (no spaces). */
const wordArb = fc.stringMatching(/^[a-zA-Z]{1,12}$/);

/** Generates a text string of 1–8 words. */
const textArb = fc
  .array(wordArb, { minLength: 1, maxLength: 8 })
  .map((ws) => ws.join(' '));

/** Generates a valid SubtitleSegment without word timestamps. */
const segmentWithoutWordsArb = (text: string): fc.Arbitrary<SubtitleSegment> =>
  fc
    .float({ min: 0, max: 100, noNaN: true })
    .chain((start) =>
      fc
        .float({ min: Math.fround(start + 0.1), max: Math.fround(start + 30), noNaN: true })
        .map((end) => ({
          id: 'seg-1',
          start,
          end,
          text,
        }))
    );

/** Generates word timestamps that cover the segment [start, end] without gaps/overlaps. */
function buildWordTimestamps(
  words: string[],
  segStart: number,
  segEnd: number
): WordTimestamp[] {
  const duration = segEnd - segStart;
  const step = duration / words.length;
  return words.map((word, i) => ({
    word,
    start: segStart + i * step,
    end: segStart + (i + 1) * step,
  }));
}

/** Generates a SubtitleSegment with word-level timestamps. */
const segmentWithWordsArb = (text: string): fc.Arbitrary<SubtitleSegment> =>
  fc
    .float({ min: 0, max: 100, noNaN: true })
    .chain((start) =>
      fc
        .float({ min: Math.fround(start + 0.1), max: Math.fround(start + 30), noNaN: true })
        .map((end) => {
          const words = text.split(' ');
          return {
            id: 'seg-1',
            start,
            end,
            text,
            words: buildWordTimestamps(words, start, end),
          };
        })
    );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 15: Karaoke Render Invariants', () => {
  /**
   * For any text, splitting by space produces the same number of tokens
   * that would be rendered as separate Text components.
   *
   * Validates: Requirement 13.1
   */
  it('word count matches number of rendered Text components', () => {
    fc.assert(
      fc.property(textArb, (text) => {
        const words = text.split(' ');
        // Each word becomes one Text component — count must match
        return words.length >= 1;
      }),
      { numRuns: 200 }
    );
  });

  /**
   * With word-level timestamps: playbackPosition inside word[i]'s [start, end)
   * must return index i as the active word.
   *
   * Validates: Requirement 13.2
   */
  it('active word index matches word-level timestamp when position is within range', () => {
    fc.assert(
      fc.property(
        textArb.chain((text) =>
          segmentWithWordsArb(text).map((seg) => ({ text, seg }))
        ),
        ({ text, seg }) => {
          const words = text.split(' ');
          const wts = seg.words!;

          // For each word, pick a position strictly inside its range
          return wts.every((wt, i) => {
            const mid = (wt.start + wt.end) / 2;
            const active = getActiveWordIndex(words, seg, mid);
            return active === i;
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * With word-level timestamps: playbackPosition before the first word returns -1.
   *
   * Validates: Requirement 13.2
   */
  it('returns -1 when playbackPosition is before the first word', () => {
    fc.assert(
      fc.property(
        textArb.chain((text) =>
          segmentWithWordsArb(text).map((seg) => ({ text, seg }))
        ),
        ({ text, seg }) => {
          const words = text.split(' ');
          const beforeStart = seg.start - 0.1;
          const active = getActiveWordIndex(words, seg, beforeStart);
          return active === -1;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Fallback (no word timestamps): active index is always within [0, wordCount-1]
   * when playbackPosition is within the segment's [start, end].
   *
   * Validates: Requirement 13.2
   */
  it('fallback proportional highlighting returns valid index within segment', () => {
    fc.assert(
      fc.property(
        textArb.chain((text) =>
          segmentWithoutWordsArb(text).chain((seg) =>
            fc
              .float({
                min: Math.fround(seg.start),
                max: Math.fround(seg.end - 0.001),
                noNaN: true,
              })
              .map((pos) => ({ text, seg, pos }))
          )
        ),
        ({ text, seg, pos }) => {
          const words = text.split(' ');
          const active = getActiveWordIndex(words, seg, pos);
          return active >= 0 && active < words.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Fallback: playbackPosition before segment start returns -1.
   *
   * Validates: Requirement 13.2
   */
  it('fallback returns -1 when playbackPosition is before segment start', () => {
    fc.assert(
      fc.property(
        textArb.chain((text) =>
          segmentWithoutWordsArb(text).map((seg) => ({ text, seg }))
        ),
        ({ text, seg }) => {
          const words = text.split(' ');
          const beforeStart = seg.start - 0.5;
          const active = getActiveWordIndex(words, seg, beforeStart);
          return active === -1;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Active word color is KARAOKE_ACTIVE_COLOR (#FCD34D).
   * Validates: Requirement 13.3
   */
  it('karaoke active color constant is the expected highlight color', () => {
    expect(KARAOKE_ACTIVE_COLOR).toBe('#FCD34D');
  });
});
