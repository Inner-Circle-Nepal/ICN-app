import React, { useEffect } from "react";
import { LogBox, Platform, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
/*
 * Fonts are imported one weight at a time.
 *
 * Importing from the package root pulls in its index, which requires every
 * weight the family ships — 39 files and 6.7 MB of TTF for the eight faces
 * this app sets. Mukta alone is ~400 KB per weight because of the Devanagari
 * glyph set. The per-weight entry points bring in 1.5 MB instead, which is
 * five megabytes off the download for readers on the mid-range Android
 * handsets most of this audience uses.
 */
import { useFonts } from "expo-font";
import { Newsreader_300Light } from "@expo-google-fonts/newsreader/300Light";
import { Newsreader_400Regular } from "@expo-google-fonts/newsreader/400Regular";
import { Newsreader_400Regular_Italic } from "@expo-google-fonts/newsreader/400Regular_Italic";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";
import { Archivo_400Regular } from "@expo-google-fonts/archivo/400Regular";
import { Archivo_500Medium } from "@expo-google-fonts/archivo/500Medium";
import { Mukta_400Regular } from "@expo-google-fonts/mukta/400Regular";
import { Mukta_500Medium } from "@expo-google-fonts/mukta/500Medium";

import { ClerkProvider } from "@clerk/clerk-expo";

import { registerLiveKitGlobals } from "@/lib/livekit/platform";
import { CLERK_PUBLISHABLE_KEY, isClerkConfigured } from "@/constants/config";
import { clerkTokenCache } from "@/lib/auth/tokenCache";
import { queryClient } from "@/lib/query/queryClient";
import { ThemeProvider, useAppTheme } from "@/theme/ThemeContext";
import { BookmarksProvider } from "@/features/bookmarks/BookmarksContext";
import { BottomNav } from "@/components/BottomNav";
import { extractNotificationPath } from "@/lib/notifications/push";
import { deepLinkToRouterPath, resolveDeepLink } from "@/utils/deepLinks";

LogBox.ignoreLogs(["Invalid DOM property `transform-origin`"]);

if (Platform.OS === "web" && typeof console !== "undefined") {
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Invalid DOM property") &&
      args.some((a) => typeof a === "string" && a.includes("transform-origin"))
    ) {
      return;
    }
    origConsoleError.apply(console, args);
  };
}

void SplashScreen.preventAutoHideAsync().catch(() => {});

/*
 * Install the WebRTC globals LiveKit expects, once, before any room code
 * runs. Module scope rather than an effect: `livekit-client` reaches for
 * them at import time, so a component would already be too late.
 *
 * Resolved per platform — on web this is a no-op and, crucially, pulls in
 * none of `@livekit/react-native`. See src/lib/livekit/platform.ts.
 */
registerLiveKitGlobals();

function AppShell() {
  const router = useRouter();
  const { palette, resolvedMode } = useAppTheme();

  // Deep link & notification navigation handler
  useEffect(() => {
    const navigateToUrl = (rawUrl: string | null) => {
      if (!rawUrl) return;
      const resolved = resolveDeepLink(rawUrl);
      if (!resolved || resolved.type === "external") return;
      const target = deepLinkToRouterPath(resolved);
      if (target && target !== "/") {
        router.push(target);
      }
    };

    const urlSub = Linking.addEventListener("url", (event) => {
      navigateToUrl(event.url);
    });

    if (Platform.OS !== "web") {
      const notifSub = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const path = extractNotificationPath(response);
          navigateToUrl(path);
        },
      );
      return () => {
        urlSub.remove();
        notifSub.remove();
      };
    }

    return () => {
      urlSub.remove();
    };
  }, [router]);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safeRoot, { backgroundColor: palette.paper }]}
    >
      <StatusBar style={resolvedMode === "dark" ? "light" : "dark"} />
      <View style={[styles.contentArea, { backgroundColor: palette.paper }]}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.paper },
            animation: "fade",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="explore" />
          <Stack.Screen name="bookmarks" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="chautari" />
          <Stack.Screen
            name="chautari/new"
            options={{ animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="chautari/[slug]"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="sign-in"
            options={{ animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="search"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="article/[slug]"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="category/[slug]"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="[category]/[slug]"
            options={{ animation: "slide_from_right" }}
          />
        </Stack>
      </View>
      <BottomNav />
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_300Light,
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Archivo_400Regular,
    Archivo_500Medium,
    Mukta_400Regular,
    Mukta_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  const tree = (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BookmarksProvider>
          <AppShell />
        </BookmarksProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );

  return (
    <SafeAreaProvider>
      {/*
        Clerk wraps the app only when it is configured. Without a key the
        provider would throw on mount and take the whole app down with it —
        including reading, which has never needed an account. An unconfigured
        build simply has no Chautari.
      */}
      {isClerkConfigured ? (
        <ClerkProvider
          publishableKey={CLERK_PUBLISHABLE_KEY}
          tokenCache={clerkTokenCache}
        >
          {tree}
        </ClerkProvider>
      ) : (
        tree
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
});
