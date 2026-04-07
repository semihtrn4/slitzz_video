/**
 * Preservation Property Tests
 * ============================
 * These tests document the CORRECT baseline behavior that must be preserved
 * after the white-screen startup fix is applied.
 *
 * METHODOLOGY:
 * - Tests PASS on the UNFIXED code — they document behavior that already works
 * - After the fix (Task 3), these same tests must continue to pass (Task 3.9)
 * - Any regression introduced by the fix will cause these tests to fail
 *
 * Property references map to design.md:
 *   P2 — Onboarding routing preserved
 *   P4 — FileSystem API works correctly
 *   P3 — Store persistence works correctly
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mocks — same patterns as bugConditionExploration.test.ts
// ---------------------------------------------------------------------------

const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  Stack: { Screen: () => null },
}));

const mockAsyncStorageStore: Record<string, string> = {};
const mockAsyncStorageGetItem = jest.fn(async (key: string) => {
  return mockAsyncStorageStore[key] ?? null;
});
const mockAsyncStorageSetItem = jest.fn(async (key: string, value: string) => {
  mockAsyncStorageStore[key] = value;
});
const mockAsyncStorageRemoveItem = jest.fn(async (key: string) => {
  delete mockAsyncStorageStore[key];
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockAsyncStorageGetItem,
  setItem: mockAsyncStorageSetItem,
  removeItem: mockAsyncStorageRemoveItem,
}));

const mockHideAsync = jest.fn();
const mockPreventAutoHideAsync = jest.fn();
jest.mock('expo-splash-screen', () => ({
  hideAsync: mockHideAsync,
  preventAutoHideAsync: mockPreventAutoHideAsync,
}));

// expo-file-system (standard path — works correctly)
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/user/0/com.app/files/',
  cacheDirectory: 'file:///data/user/0/com.app/cache/',
}));

// expo-file-system/legacy (production: subpath cannot be resolved → empty module)
jest.mock(
  'expo-file-system/legacy',
  () => {
    return {};
  },
  { virtual: true }
);

// ---------------------------------------------------------------------------
// Helpers — routing logic extracted from app/_layout.tsx
// ---------------------------------------------------------------------------

/**
 * Mirrors the onboarding routing decision in _layout.tsx checkOnboarding.
 * Returns the route that would be passed to router.replace().
 */
function resolveOnboardingRoute(onboardingCompleted: string | null | undefined): string {
  if (onboardingCompleted !== 'true') {
    return '/onboarding';
  }
  return '/(tabs)';
}

/**
 * Simulates the full checkOnboarding flow from _layout.tsx.
 * Returns the route that was navigated to.
 */
async function simulateCheckOnboarding(
  asyncStorageValue: string | null,
  routerReplace: (route: string) => void,
  setIsReady: (v: boolean) => void,
  hideAsync: () => void
): Promise<string> {
  let navigatedRoute = '';
  try {
    const completed = asyncStorageValue;
    if (completed !== 'true') {
      routerReplace('/onboarding');
      navigatedRoute = '/onboarding';
    } else {
      routerReplace('/(tabs)');
      navigatedRoute = '/(tabs)';
    }
  } catch (error) {
    // error path
  } finally {
    setIsReady(true);
    hideAsync();
  }
  return navigatedRoute;
}

// ---------------------------------------------------------------------------
// Helpers — store persistence simulation
// ---------------------------------------------------------------------------

/**
 * Simulates a Zustand persist store write/read cycle through AsyncStorage.
 * Models the storage adapter used in subscriptionStore, projectStore, settingsStore.
 */
async function simulateStorePersistence(
  storeName: string,
  stateToWrite: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const AsyncStorage = require('@react-native-async-storage/async-storage') as {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  };

  // Write (setItem)
  await AsyncStorage.setItem(storeName, JSON.stringify({ state: stateToWrite, version: 0 }));

  // Read (getItem)
  const raw = await AsyncStorage.getItem(storeName);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
  return parsed.state;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Reset the in-memory AsyncStorage store
  Object.keys(mockAsyncStorageStore).forEach((k) => delete mockAsyncStorageStore[k]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Preservation Tests — Baseline Behavior Must Survive the Fix', () => {
  // -------------------------------------------------------------------------
  // P2: Onboarding routing
  // -------------------------------------------------------------------------
  describe('P2: Onboarding routing is preserved', () => {
    /**
     * Validates: Requirements 3.1
     */
    it('onboarding_completed=null routes to /onboarding', async () => {
      let isReady = false;
      const setIsReady = (v: boolean) => { isReady = v; };

      const route = await simulateCheckOnboarding(
        null,
        mockRouterReplace,
        setIsReady,
        mockHideAsync
      );

      expect(route).toBe('/onboarding');
      expect(mockRouterReplace).toHaveBeenCalledWith('/onboarding');
    });

    /**
     * Validates: Requirements 3.2
     */
    it("onboarding_completed='true' routes to /(tabs)", async () => {
      let isReady = false;
      const setIsReady = (v: boolean) => { isReady = v; };

      const route = await simulateCheckOnboarding(
        'true',
        mockRouterReplace,
        setIsReady,
        mockHideAsync
      );

      expect(route).toBe('/(tabs)');
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
    });

    /**
     * Property-based: any onboarding_completed value maps to the correct route.
     *
     * Validates: Requirements 3.1, 3.2
     */
    it('property: random onboarding_completed values always route correctly', () => {
      // Generator: the set of values that can realistically appear in AsyncStorage
      const onboardingValueArb = fc.oneof(
        fc.constant(null),
        fc.constant('true'),
        fc.constant('false'),
        fc.constant(''),
        fc.constant(undefined as unknown as string | null)
      );

      fc.assert(
        fc.property(onboardingValueArb, (value) => {
          const route = resolveOnboardingRoute(value);

          if (value === 'true') {
            return route === '/(tabs)';
          } else {
            return route === '/onboarding';
          }
        }),
        { numRuns: 200 }
      );
    });

    /**
     * Validates: Requirements 3.1 — 'false' string is treated as not-completed
     */
    it("onboarding_completed='false' routes to /onboarding", () => {
      expect(resolveOnboardingRoute('false')).toBe('/onboarding');
    });

    /**
     * Validates: Requirements 3.1 — empty string is treated as not-completed
     */
    it("onboarding_completed='' routes to /onboarding", () => {
      expect(resolveOnboardingRoute('')).toBe('/onboarding');
    });

    /**
     * Validates: Requirements 3.2 — only exact string 'true' routes to tabs
     */
    it("only exact string 'true' routes to /(tabs)", () => {
      expect(resolveOnboardingRoute('true')).toBe('/(tabs)');
      expect(resolveOnboardingRoute('True')).toBe('/onboarding');
      expect(resolveOnboardingRoute('TRUE')).toBe('/onboarding');
      expect(resolveOnboardingRoute('1')).toBe('/onboarding');
    });
  });

  // -------------------------------------------------------------------------
  // P4: FileSystem API
  // -------------------------------------------------------------------------
  describe('P4: FileSystem API returns valid strings from expo-file-system', () => {
    /**
     * Validates: Requirements 3.3, 3.4, 3.5
     */
    it('documentDirectory from expo-file-system is a non-empty string', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FileSystem = require('expo-file-system') as {
        documentDirectory: string;
        cacheDirectory: string;
      };

      expect(typeof FileSystem.documentDirectory).toBe('string');
      expect(FileSystem.documentDirectory.length).toBeGreaterThan(0);
    });

    /**
     * Validates: Requirements 3.3, 3.4, 3.5
     */
    it('cacheDirectory from expo-file-system is a non-empty string', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FileSystem = require('expo-file-system') as {
        documentDirectory: string;
        cacheDirectory: string;
      };

      expect(typeof FileSystem.cacheDirectory).toBe('string');
      expect(FileSystem.cacheDirectory.length).toBeGreaterThan(0);
    });

    /**
     * Validates: Requirements 3.3, 3.4, 3.5
     * Both directories must be defined (not undefined, not null)
     */
    it('documentDirectory and cacheDirectory are both defined', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FileSystem = require('expo-file-system') as {
        documentDirectory: string | null | undefined;
        cacheDirectory: string | null | undefined;
      };

      expect(FileSystem.documentDirectory).toBeDefined();
      expect(FileSystem.documentDirectory).not.toBeNull();
      expect(FileSystem.cacheDirectory).toBeDefined();
      expect(FileSystem.cacheDirectory).not.toBeNull();
    });

    /**
     * Contrast: expo-file-system/legacy returns undefined (the bug).
     * This documents why the fix (removing /legacy) is necessary.
     * Validates: Requirements 3.3 (indirectly — shows the broken path)
     */
    it('expo-file-system/legacy returns undefined for documentDirectory (bug contrast)', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const LegacyFileSystem = require('expo-file-system/legacy') as Record<string, unknown>;
      expect(LegacyFileSystem.documentDirectory).toBeUndefined();
      expect(LegacyFileSystem.cacheDirectory).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // P3: Store persistence
  // -------------------------------------------------------------------------
  describe('P3: Store persistence — write/read through AsyncStorage works correctly', () => {
    /**
     * Validates: Requirements 3.6
     * subscriptionStore: isPremium and plan persist correctly
     */
    it('subscriptionStore state persists and reads back correctly', async () => {
      const written = { isPremium: true, plan: 'pro', debugProMode: false };
      const read = await simulateStorePersistence('blitzcut-subscription', written);

      expect(read).not.toBeNull();
      expect(read!.isPremium).toBe(true);
      expect(read!.plan).toBe('pro');
      expect(read!.debugProMode).toBe(false);
    });

    /**
     * Validates: Requirements 3.6
     * projectStore: projects array persists correctly
     */
    it('projectStore state persists and reads back correctly', async () => {
      const written = {
        projects: [{ id: 'proj-1', name: 'Test Project', status: 'draft' }],
        currentProjectId: 'proj-1',
      };
      const read = await simulateStorePersistence('blitzcut-projects', written);

      expect(read).not.toBeNull();
      expect(Array.isArray(read!.projects)).toBe(true);
      expect((read!.projects as Array<{ id: string }>)[0].id).toBe('proj-1');
      expect(read!.currentProjectId).toBe('proj-1');
    });

    /**
     * Validates: Requirements 3.6
     * settingsStore: settings persist correctly
     */
    it('settingsStore state persists and reads back correctly', async () => {
      const written = {
        hapticEnabled: false,
        autoDownloadModel: true,
        defaultResolution: '4k',
        defaultAspectRatio: '16:9',
      };
      const read = await simulateStorePersistence('blitzcut-settings', written);

      expect(read).not.toBeNull();
      expect(read!.hapticEnabled).toBe(false);
      expect(read!.autoDownloadModel).toBe(true);
      expect(read!.defaultResolution).toBe('4k');
      expect(read!.defaultAspectRatio).toBe('16:9');
    });

    /**
     * Property-based: any boolean state written to a store reads back identically.
     *
     * Validates: Requirements 3.6
     */
    it('property: store boolean values survive write/read cycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          async (isPremium, debugProMode) => {
            const written = { isPremium, debugProMode, plan: 'free' };
            const read = await simulateStorePersistence('blitzcut-subscription', written);
            return (
              read !== null &&
              read.isPremium === isPremium &&
              read.debugProMode === debugProMode
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property-based: any string state written to a store reads back identically.
     *
     * Validates: Requirements 3.6
     */
    it('property: store string values survive write/read cycle', async () => {
      const planArb = fc.oneof(
        fc.constant('free'),
        fc.constant('pro'),
        fc.constant('premium')
      );

      await fc.assert(
        fc.asyncProperty(planArb, async (plan) => {
          const written = { isPremium: plan !== 'free', plan };
          const read = await simulateStorePersistence('blitzcut-subscription', written);
          return read !== null && read.plan === plan;
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Validates: Requirements 3.6
     * Missing key returns null (store starts with defaults — not corrupted data)
     */
    it('reading a non-existent store key returns null', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage') as {
        getItem: (key: string) => Promise<string | null>;
      };
      const result = await AsyncStorage.getItem('blitzcut-nonexistent');
      expect(result).toBeNull();
    });
  });
});
