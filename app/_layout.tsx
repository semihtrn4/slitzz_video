import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastContainer } from '@/src/components/ui/Toast';
import { useSubscriptionStore } from '@/src/stores/subscriptionStore';

// Prevent the splash screen from auto-hiding before asset loading is complete.
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string | null>(null);

  useEffect(() => {
    // Wait for subscriptionStore hydration before making navigation decision.
    // onFinishHydration fires after AsyncStorage read completes.
    const checkAndNavigate = () => {
      AsyncStorage.getItem('onboarding_completed')
        .then((completed) => {
          setTargetRoute(completed === 'true' ? '/(tabs)' : '/onboarding');
        })
        .catch(() => {
          setTargetRoute('/onboarding');
        })
        .finally(() => {
          setIsReady(true);
        });
    };

    // If already hydrated (e.g. hot reload), run immediately
    if (useSubscriptionStore.persist.hasHydrated()) {
      checkAndNavigate();
    } else {
      // Wait for hydration to finish before making navigation decision
      const unsubscribe = useSubscriptionStore.persist.onFinishHydration(() => {
        checkAndNavigate();
      });
      return () => {
        unsubscribe();
      };
    }
  }, []);

  // Navigate only after <Stack> is rendered (isReady=true) and route is known
  useEffect(() => {
    if (isReady && targetRoute) {
      router.replace(targetRoute as any);
      void SplashScreen.hideAsync();
    }
  }, [isReady, targetRoute]);

  // FIX: return a dark View instead of null to prevent white screen
  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: '#121212' }} />;
  }

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="paywall"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="editor/[id]"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <RootLayoutNav />
        <ToastContainer />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
