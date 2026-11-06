import React from "react";
import { Tabs } from "expo-router";

/**
 * Tabs layout — keeps the five tab screens alive between switches.
 *
 * ## Why this layout exists
 *
 * Prior to this layout the five tab routes (index, explore, chautari,
 * bookmarks, settings) sat at the root of the Stack navigator. Every tap on
 * `BottomNav` called `router.navigate(...)`, which pushed or unwound the
 * tab's route — in both cases the destination screen **re-mounted**: its
 * queries re-ran, its FlatLists rebuilt, its React trees rendered from
 * scratch. Even with the shared-query prewarm in place that first paint took
 * 150–400 ms per switch, which readers felt as a hesitation between tap and
 * content.
 *
 * Tabs, unlike a Stack, keeps every tab screen **mounted** once visited.
 * Switching from Explore back to Home is a show/hide; the Home component
 * tree never unmounted, so its FlatList is still scrolled where the reader
 * left it, its queries are still cached, and the switch is genuinely
 * instant. The first visit to each tab still pays the full mount cost once.
 *
 * ## Headless by design
 *
 * `BottomNav` already renders the tab bar at the root layout, and it does
 * so with the editorial typography, icon set, and optimistic-icon behaviour
 * the rest of the app's chrome follows. Letting the react-navigation
 * bottom-tab bar draw on top of it would double up the UI, so the default
 * bar is suppressed with `tabBar={() => null}` and the layout falls through
 * to the existing `BottomNav` in the root shell.
 *
 * `tabBarStyle: { display: "none" }` is NOT the right switch here — it
 * leaves the bar in the layout tree, just invisible, so screens above it
 * get laid out as if it were there. Returning `null` from `tabBar` removes
 * the bar from the tree entirely.
 *
 * ## URL shape unchanged
 *
 * `(tabs)` is a route **group** — parentheses in the folder name tell Expo
 * Router to collapse it out of the URL. `/`, `/explore`, `/chautari`,
 * `/bookmarks`, `/settings` all resolve the same way they did before this
 * migration, which keeps every deep link, notification path, and
 * `router.navigate` call in `BottomNav` working unchanged.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Lazy-mount each tab's content so we don't pay the full cost of
        // every tab on first boot — only the tabs the reader actually opens
        // mount. Once mounted a tab stays mounted (that's the whole reason
        // this layout exists).
        lazy: true,
      }}
      tabBar={() => null}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="chautari" />
      <Tabs.Screen name="bookmarks" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
