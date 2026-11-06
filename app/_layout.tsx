import React, { useEffect } from "react";
import { LogBox, Platform, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { notificationsModule } from "@/lib/notifications/module";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
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
import { persistOptions, queryClient } from "@/lib/query/queryClient";
import { prewarmSharedQueries } from "@/lib/query/prewarm";
import { ThemeProvider, useAppTheme } from "@/theme/ThemeContext";
import { BookmarksProvider } from "@/features/bookmarks/BookmarksContext";
import { BottomNav } from "@/components/BottomNav";
import { MiniRoomBar } from "@/components/chautari/MiniRoomBar";
import { ActiveRoomProvider } from "@/features/chautari/ActiveRoom";
import { extractNotificationPath, syncPushRegistration } from "@/lib/notifications/push";
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

  /*
   * Warm the handful of queries every secondary tab will ask for, once the
   * persist provider above has had a chance to restore anything cached from
   * last session. Without this, each tab switch kicks off its own query chain
   * on arrival and shows a ~400 ms blank gap before the tab looks "real" —
   * see src/lib/query/prewarm.ts for the specific queries.
   */
  useEffect(() => {
    prewarmSharedQueries(queryClient);
  }, []);

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

    /*
     * Absent in Expo Go, where the native module does not exist. Importing
     * it directly here used to throw during module evaluation, so this
     * layout exported no default and the entire app failed to mount — see
     * src/lib/notifications/module.ts.
     */
    const N = Platform.OS !== "web" ? notificationsModule() : null;
    if (N) {
      const notifSub = N.addNotificationResponseReceivedListener((response) => {
        const path = extractNotificationPath(response);
        navigateToUrl(path);
      });

      /*
       * The listener above only hears taps while the app is running. A tap
       * that LAUNCHED the app arrived before it was attached, so it is read
       * back here — otherwise a breaking-news alert opened from a closed app
       * lands on the front page instead of the story. Cleared once handled so
       * a later remount does not open the same story again.
       */
      void N.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        navigateToUrl(extractNotificationPath(response));
        void N.clearLastNotificationResponseAsync();
      });

      // Keep the newsroom's list current: tokens rotate, and an offline opt-in needs retrying.
      void syncPushRegistration();
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
            /*
             * The default is "none" because every sub-screen below (article,
             * profile, Chautari room, category, sign-in …) sets its own
             * explicit slide animation. Only the five tab routes (index,
             * explore, bookmarks, settings, chautari) inherit this default —
             * and for tabs a fade introduces ~300 ms of opacity interpolation
             * between tap and visible content, which readers feel as the
             * difference between "snappy" and "a bit slow". Instant switch is
             * what the icon flip already promised — the transition should
             * honour it.
             */
            animation: "none",
          }}
        >
          {/*
            The five tab routes (index, explore, chautari, bookmarks,
            settings) live inside a Tabs navigator in `app/(tabs)/` so
            they stay mounted between switches. Only the group is a
            Stack screen; the individual tab files are not. Group routes
            do not appear in URLs, so every existing deep link like
            `/explore` still works untouched.
          */}
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="chautari/new"
            options={{ animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="chautari/earn"
            options={{ animation: "slide_from_right" }}
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
            name="profile"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="search"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="article/[slug]"
            options={{
              animation: "slide_from_right",
              /*
               * Explicitly opt the article screen into the swipe-from-edge
               * gesture. react-native-screens' default varies by platform
               * and by the screen's animation; stating it here guarantees
               * the Android gesture-nav back (and iOS edge-swipe back) are
               * wired into the native stack's pop path.
               */
              gestureEnabled: true,
            }}
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
      <MiniRoomBar />
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
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ThemeProvider>
        <BookmarksProvider>
          <ActiveRoomProvider>
            <AppShell />
          </ActiveRoomProvider>
        </BookmarksProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
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
