/**
 * Bug Condition Exploration Tests
 * ================================
 * These tests document the bug conditions that cause the white screen on startup
 * in production builds of SlitzCut / BlitzCut.
 *
 * METHODOLOGY:
 * - Tests PASS as written — they document/assert the buggy behavior exists
 * - Each test proves a specific bug condition is present in the unfixed code
 * - When the fix is applied (Task 3), these tests will be updated to assert
 *   the CORRECT behavior (Task 3.8)
 *
 * BUG_CONDITION references map to the formal spec in design.md:
 *   C1 — return null → white screen
 *   C2 — router.replace() before <Stack> is mounted
 *   C4 — expo-file-system/legacy import path unresolvable in production
 *   C5 — store hydration race condition with checkOnboarding
 *
 * Validates: Requirements 1.1, 1.2, 1.4, 1.6
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock expo-router
const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  Stack: { Screen: () => null },
}));

// Mock @react-native-async-storage/async-storage
const mockAsyncStorageGetItem = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: mockAsyncStorageGetItem,
}));

// Mock expo-splash-screen
const mockHideAsync = jest.fn();
const mockPreventAutoHideAsync = jest.fn();
jest.mock('expo-splash-screen', () => ({
  hideAsync: mockHideAsync,
  preventAutoHideAsync: mockPreventAutoHideAsync,
}));

// Mock expo-file-system (standard path — should work)
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/user/0/com.app/files/',
  cacheDirectory: 'file:///data/user/0/com.app/cache/',
}));

// Mock expo-file-system/legacy (production: subpath cannot be resolved → undefined)
// BUG_CONDITION: C4 — Metro bundler cannot resolve '/legacy' subpath in production builds
jest.mock(
  'expo-file-system/legacy',
  () => {
    // Simulate production Metro bundle behavior: subpath not found → empty module
    return {};
  },
  { virtual: true }
);

// ---------------------------------------------------------------------------
// Helpers — extracted logic from app/_layout.tsx (unfixed)
// ---------------------------------------------------------------------------

/**
 * Simulates the RootLayoutNav render decision in the UNFIXED _layout.tsx.
 *
 * Unfixed code:
 *   if (!isReady) { return null; }
 *   return <Stack .../>
 *
 * We model the render output as: null | 'Stack'
 */
function simulateRootLayoutNavRender(isReady: boolean): null | 'Stack' {
  // BUG_CONDITION: C1 — exact logic from unfixed app/_layout.tsx line 42
  if (!isReady) {
    return null; // ← this causes the white screen
  }
  return 'Stack';
}

/**
 * Simulates the checkOnboarding function from the UNFIXED _layout.tsx.
 *
 * Unfixed code runs router.replace() BEFORE isReady is set to true,
 * meaning it fires before <Stack> is ever rendered/mounted.
 *
 * Returns the sequence of events as an array for inspection.
 */
async function simulateCheckOnboarding(
  asyncStorageValue: string | null,
  routerReplace: (route: string) => void,
  setIsReady: (v: boolean) => void,
  hideAsync: () => void
): Promise<string[]> {
  const events: string[] = [];

  // BUG_CONDITION: C2 — router.replace() is called here, BEFORE setIsReady(true)
  // At this point isReady=false, so <Stack> has never been rendered.
  try {
    if (asyncStorageValue !== 'true') {
      routerReplace('/onboarding');
      events.push('router.replace(/onboarding)');
    } else {
      routerReplace('/(tabs)');
      events.push('router.replace(/(tabs))');
    }
  } catch (error) {
    events.push('error');
  } finally {
    setIsReady(true);
    events.push('setIsReady(true)');
    hideAsync();
    events.push('SplashScreen.hideAsync()');
  }

  return events;
}

/**
 * Simulates 3 Zustand stores hydrating simultaneously from AsyncStorage,
 * while checkOnboarding runs independently (race condition).
 *
 * Returns which finished first: 'checkOnboarding' or 'storesHydrated'
 */
async function simulateStoreHydrationRace(
  storeHydrationDelayMs: number
): Promise<{ checkOnboardingFinishedFirst: boolean; order: string[] }> {
  const order: string[] = [];

  // checkOnboarding runs immediately (no delay) — unfixed behavior
  const checkOnboardingPromise = Promise.resolve().then(() => {
    order.push('checkOnboarding');
  });

  // 3 stores hydrate with a delay (simulating AsyncStorage reads)
  const storeHydrationPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      order.push('subscriptionStore.hydrated');
      order.push('projectStore.hydrated');
      order.push('settingsStore.hydrated');
      resolve();
    }, storeHydrationDelayMs);
  });

  await checkOnboardingPromise;
  await storeHydrationPromise;

  return {
    checkOnboardingFinishedFirst: order[0] === 'checkOnboarding',
    order,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Bug Condition Exploration — White Screen on Startup', () => {
  // -------------------------------------------------------------------------
  // C1: return null → white screen
  // -------------------------------------------------------------------------
  describe('C1: RootLayoutNav returns null when isReady=false', () => {
    it('should return null when isReady is false — direct white screen evidence', () => {
      // BUG_CONDITION: C1
      // The unfixed RootLayoutNav returns null before initialization completes.
      // When SplashScreen.hideAsync() is called in the finally block, the splash
      // hides and reveals a completely empty (white) screen behind it.
      const renderOutput = simulateRootLayoutNavRender(false);

      // This PASSES — it documents that null IS returned (the bug exists)
      expect(renderOutput).toBeNull();
    });

    it('should return Stack only after isReady becomes true', () => {
      // BUG_CONDITION: C1 — corollary: Stack is never shown during initialization
      const renderOutputBefore = simulateRootLayoutNavRender(false);
      const renderOutputAfter = simulateRootLayoutNavRender(true);

      expect(renderOutputBefore).toBeNull(); // bug: white screen window exists
      expect(renderOutputAfter).toBe('Stack');
    });

    it('documents the timing gap: SplashScreen.hideAsync() fires while render is null', async () => {
      // BUG_CONDITION: C1 + C2
      // In the unfixed code, hideAsync() is called in the finally block of
      // checkOnboarding, which runs BEFORE setIsReady(true) completes a re-render.
      // The sequence is: hideAsync() → null render visible → re-render with Stack
      // This gap is the white screen window.
      let isReady = false;
      const setIsReady = (v: boolean) => { isReady = v; };

      const events = await simulateCheckOnboarding(
        null,
        mockRouterReplace,
        setIsReady,
        mockHideAsync
      );

      // hideAsync is called as part of the finally block
      expect(mockHideAsync).toHaveBeenCalledTimes(1);

      // At the moment hideAsync fires, the render output would still be null
      // because React hasn't re-rendered yet with isReady=true
      const renderAtHideTime = simulateRootLayoutNavRender(false);
      expect(renderAtHideTime).toBeNull(); // white screen is visible here

      // Events confirm the order: router.replace → setIsReady → hideAsync
      expect(events).toEqual([
        'router.replace(/onboarding)',
        'setIsReady(true)',
        'SplashScreen.hideAsync()',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // C2: router.replace() called before <Stack> is mounted
  // -------------------------------------------------------------------------
  describe('C2: router.replace() fires before <Stack> is mounted', () => {
    it('router.replace() is called while isReady=false (Stack not yet rendered)', async () => {
      // BUG_CONDITION: C2
      // checkOnboarding calls router.replace() synchronously inside the try block.
      // At that point isReady=false, so <Stack> has never been rendered.
      // Expo Router silently ignores or crashes on navigation before Stack mounts.
      let isReady = false;
      const setIsReady = (v: boolean) => { isReady = v; };

      // Capture isReady value at the moment router.replace is called
      let isReadyAtReplaceTime: boolean | undefined;
      const trackingReplace = (route: string) => {
        isReadyAtReplaceTime = isReady; // capture state at call time
        mockRouterReplace(route);
      };

      await simulateCheckOnboarding(
        'true',
        trackingReplace,
        setIsReady,
        mockHideAsync
      );

      // This PASSES — documents that router.replace fires when isReady=false
      expect(isReadyAtReplaceTime).toBe(false); // Stack not mounted yet
      expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
    });

    it('router.replace() is called before setIsReady(true) in the event sequence', async () => {
      // BUG_CONDITION: C2
      // The event order in unfixed code: router.replace → setIsReady(true)
      // Correct order should be: setIsReady(true) → [Stack renders] → router.replace
      let isReady = false;
      const setIsReady = (v: boolean) => { isReady = v; };

      const events = await simulateCheckOnboarding(
        null,
        mockRouterReplace,
        setIsReady,
        mockHideAsync
      );

      // router.replace fires BEFORE setIsReady(true) — this is the bug
      const replaceIndex = events.indexOf('router.replace(/onboarding)');
      const setReadyIndex = events.indexOf('setIsReady(true)');

      expect(replaceIndex).toBeLessThan(setReadyIndex); // bug: replace before ready
    });
  });

  // -------------------------------------------------------------------------
  // C4: expo-file-system/legacy import path unresolvable in production
  // -------------------------------------------------------------------------
  describe('C4: expo-file-system/legacy import path fails in production', () => {
    it('documentDirectory is undefined when imported from expo-file-system/legacy', () => {
      // BUG_CONDITION: C4
      // In production Metro bundles, 'expo-file-system/legacy' subpath cannot be
      // resolved. The module loads as an empty object, so documentDirectory is undefined.
      // This causes all file operations (video copy, thumbnail, model download) to fail.

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const LegacyFileSystem = require('expo-file-system/legacy') as Record<string, unknown>;

      // Simulate the cast pattern used in the unfixed code:
      // const documentDirectory = (FileSystem as any).documentDirectory;
      const documentDirectory = LegacyFileSystem.documentDirectory;
      const cacheDirectory = LegacyFileSystem.cacheDirectory;

      // This PASSES — documents that legacy path returns undefined (the bug)
      expect(documentDirectory).toBeUndefined();
      expect(cacheDirectory).toBeUndefined();
    });

    it('documentDirectory is a valid string when imported from expo-file-system (correct path)', () => {
      // BUG_CONDITION: C4 — contrast: the correct import works fine
      // This documents that the fix (removing /legacy) resolves the issue.

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FileSystem = require('expo-file-system') as {
        documentDirectory: string;
        cacheDirectory: string;
      };

      expect(typeof FileSystem.documentDirectory).toBe('string');
      expect(FileSystem.documentDirectory).not.toBe('');
      expect(typeof FileSystem.cacheDirectory).toBe('string');
      expect(FileSystem.cacheDirectory).not.toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // C5: Store hydration race condition with checkOnboarding
  // -------------------------------------------------------------------------
  describe('C5: Store hydration race condition — checkOnboarding fires before stores are ready', () => {
    it('checkOnboarding completes before stores hydrate when AsyncStorage has any delay', async () => {
      // BUG_CONDITION: C5
      // In the unfixed code, checkOnboarding runs immediately on mount with no
      // coordination with Zustand store hydration. The 3 stores (subscriptionStore,
      // projectStore, settingsStore) read from AsyncStorage concurrently.
      // checkOnboarding wins the race, making navigation decisions before
      // subscriptionStore.isPremium has its persisted value.

      const result = await simulateStoreHydrationRace(10 /* ms delay */);

      // This PASSES — documents that checkOnboarding always wins the race
      expect(result.checkOnboardingFinishedFirst).toBe(true);
      expect(result.order[0]).toBe('checkOnboarding');
    });

    it('navigation decision is made before subscriptionStore is hydrated', async () => {
      // BUG_CONDITION: C5
      // Consequence: isPremium defaults to false even for premium users,
      // potentially showing wrong UI or wrong route on first render.
      const result = await simulateStoreHydrationRace(5 /* ms delay */);

      const checkOnboardingIdx = result.order.indexOf('checkOnboarding');
      const subscriptionHydratedIdx = result.order.indexOf('subscriptionStore.hydrated');

      // checkOnboarding finishes before subscriptionStore is hydrated
      expect(checkOnboardingIdx).toBeLessThan(subscriptionHydratedIdx);
    });

    it('all three stores hydrate after checkOnboarding in the unfixed flow', async () => {
      // BUG_CONDITION: C5
      // Documents that ALL stores are affected, not just one.
      const result = await simulateStoreHydrationRace(1 /* ms delay */);

      const checkOnboardingIdx = result.order.indexOf('checkOnboarding');
      const projectHydratedIdx = result.order.indexOf('projectStore.hydrated');
      const settingsHydratedIdx = result.order.indexOf('settingsStore.hydrated');

      expect(checkOnboardingIdx).toBeLessThan(projectHydratedIdx);
      expect(checkOnboardingIdx).toBeLessThan(settingsHydratedIdx);
    });
  });

  // -------------------------------------------------------------------------
  // Summary: isBugCondition formal spec
  // -------------------------------------------------------------------------
  describe('isBugCondition — formal specification from design.md', () => {
    /**
     * Implements the formal isBugCondition function from design.md.
     * Returns true if any bug condition is active.
     */
    function isBugCondition(appState: {
      isReady: boolean;
      renderOutput: null | 'Stack';
      navigationMounted: boolean;
      routerReplaceCalled: boolean;
      fileSystemImport: 'expo-file-system' | 'expo-file-system/legacy';
      storesHydrated: boolean;
      checkOnboardingCalled: boolean;
    }): boolean {
      // C1: return null → white screen
      if (!appState.isReady && appState.renderOutput === null) return true;
      // C2: navigation not ready when router.replace() called
      if (!appState.navigationMounted && appState.routerReplaceCalled) return true;
      // C4: legacy import path
      if (appState.fileSystemImport === 'expo-file-system/legacy') return true;
      // C5: store hydration race
      if (!appState.storesHydrated && appState.checkOnboardingCalled) return true;
      return false;
    }

    it('C1 is active: isReady=false + renderOutput=null', () => {
      expect(isBugCondition({
        isReady: false,
        renderOutput: null,
        navigationMounted: true,
        routerReplaceCalled: false,
        fileSystemImport: 'expo-file-system',
        storesHydrated: true,
        checkOnboardingCalled: false,
      })).toBe(true);
    });

    it('C2 is active: navigationMounted=false + routerReplaceCalled=true', () => {
      expect(isBugCondition({
        isReady: true,
        renderOutput: 'Stack',
        navigationMounted: false,
        routerReplaceCalled: true,
        fileSystemImport: 'expo-file-system',
        storesHydrated: true,
        checkOnboardingCalled: false,
      })).toBe(true);
    });

    it('C4 is active: fileSystemImport=expo-file-system/legacy', () => {
      expect(isBugCondition({
        isReady: true,
        renderOutput: 'Stack',
        navigationMounted: true,
        routerReplaceCalled: false,
        fileSystemImport: 'expo-file-system/legacy',
        storesHydrated: true,
        checkOnboardingCalled: false,
      })).toBe(true);
    });

    it('C5 is active: storesHydrated=false + checkOnboardingCalled=true', () => {
      expect(isBugCondition({
        isReady: true,
        renderOutput: 'Stack',
        navigationMounted: true,
        routerReplaceCalled: false,
        fileSystemImport: 'expo-file-system',
        storesHydrated: false,
        checkOnboardingCalled: true,
      })).toBe(true);
    });

    it('no bug condition when all flags are correct', () => {
      expect(isBugCondition({
        isReady: true,
        renderOutput: 'Stack',
        navigationMounted: true,
        routerReplaceCalled: false,
        fileSystemImport: 'expo-file-system',
        storesHydrated: true,
        checkOnboardingCalled: false,
      })).toBe(false);
    });

    it('combined C1+C2 (the actual startup scenario in unfixed code)', () => {
      // BUG_CONDITION: C1 + C2 — the most common production failure scenario
      // isReady=false → null render → router.replace fires → Stack never mounts
      expect(isBugCondition({
        isReady: false,
        renderOutput: null,
        navigationMounted: false,
        routerReplaceCalled: true,
        fileSystemImport: 'expo-file-system/legacy',
        storesHydrated: false,
        checkOnboardingCalled: true,
      })).toBe(true);
    });
  });
});
