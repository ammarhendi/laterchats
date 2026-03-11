import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, AppState } from "react-native";
import { crossInfo } from "@/lib/cross-alert";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";
import * as ScreenCapture from "expo-screen-capture";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { ChatProvider, useChat } from "@/lib/chat-context";
import { useRouter } from "expo-router";
import { useRef } from "react";

// Global component that auto-opens the PM screen when a new PM arrives from anywhere in the app
function PMAutoNavigator() {
  const { incomingPM, dismissIncomingPM, markPMRead } = useChat();
  const router = useRouter();
  const lastOpenedRef = useRef<string | null>(null);
  const lastOpenedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!incomingPM) return;
    const now = Date.now();
    // Debounce: don't re-open same sender within 3 seconds
    if (lastOpenedRef.current === incomingPM.from && now - lastOpenedTimeRef.current < 3000) return;
    lastOpenedRef.current = incomingPM.from;
    lastOpenedTimeRef.current = now;
    markPMRead(incomingPM.from);
    dismissIncomingPM();
    router.push(`/pm/${incomingPM.from}` as any);
  }, [incomingPM?.from]);

  return null;
}

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  // ── Global screen capture prevention ─────────────────────────────────────
  // Prevents screenshots, screen recording, and capture from any source.
  // Android: FLAG_SECURE makes screen appear black when captured or recorded.
  // iOS: blurs app when not in foreground (protects against recording from another phone).
  // Re-applied every time the app comes back to foreground.
  useEffect(() => {
    if (Platform.OS === "web") return;

    // Activate protection immediately
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});

    // iOS: blur app content in app switcher / when backgrounded (protects against recording from another phone)
    if (Platform.OS === "ios") {
      ScreenCapture.enableAppSwitcherProtectionAsync(1.0).catch(() => {});
    }

    // Alert user if they attempt a screenshot
    const screenshotSub = ScreenCapture.addScreenshotListener(() => {
      crossInfo("🔒 Screenshot Blocked", "Screenshots are not allowed in Later to protect all users’ privacy.");
    });

    // Re-apply protection every time app becomes active (foreground)
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        ScreenCapture.preventScreenCaptureAsync().catch(() => {});
        if (Platform.OS === "ios") {
          ScreenCapture.enableAppSwitcherProtectionAsync(1.0).catch(() => {});
        }
      }
    });

    return () => {
      screenshotSub.remove();
      appStateSub.remove();
    };
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ChatProvider>
          <PMAutoNavigator />
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat" />
            <Stack.Screen name="pm/[nickname]" options={{ presentation: "modal" }} />
            <Stack.Screen name="admin" options={{ presentation: "modal" }} />
            <Stack.Screen name="oauth/callback" />
            <Stack.Screen name="privacy" options={{ presentation: "modal" }} />
            <Stack.Screen name="terms" options={{ presentation: "modal" }} />
          </Stack>
          <StatusBar style="auto" />
          </ChatProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
