import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { useBookmarks } from "@/features/bookmarks/BookmarksContext";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * Editorial bottom navigation bar.
 *
 * Tabs: Home (`/`), Newsroom (`/explore`), Chautari, Saved, Settings. The active tab is
 * marked by a filled (or heavier) icon and an ink label.
 */

const ICON = 24;

const TAB_ROUTES = new Set(["/", "/explore", "/chautari", "/bookmarks", "/settings"]);

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { bookmarks } = useBookmarks();

  if (!TAB_ROUTES.has(pathname)) {
    return null;
  }

  const tabs = [
    {
      key: "home",
      label: "Home",
      href: "/" as const,
      active: pathname === "/",
      icon: (color: string, active: boolean) => (
        <Svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-9.5Z"
            stroke={color}
            strokeWidth={1.7}
            strokeLinejoin="round"
            fill={active ? color : "none"}
          />
        </Svg>
      ),
    },
    {
      key: "explore",
      label: "Newsroom",
      href: "/explore" as const,
      active: pathname === "/explore",
      /*
       * A folded newspaper, not a magnifier: search is the header's job, and
       * a magnifier here read as a second search button.
       */
      icon: (color: string, active: boolean) => (
        <Svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 5.5h13v13a1.5 1.5 0 0 0 1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"
            stroke={color}
            strokeWidth={active ? 2 : 1.7}
            strokeLinejoin="round"
            fill={active ? color : "none"}
          />
          <Path
            d="M17 9h3v9.5a1.5 1.5 0 0 1-3 0V9Z"
            stroke={color}
            strokeWidth={active ? 2 : 1.7}
            strokeLinejoin="round"
          />
          <Path
            d="M7 9h7M7 12.5h7M7 16h4.5"
            stroke={active ? palette.paper : color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </Svg>
      ),
    },
    {
      key: "chautari",
      label: "Chautari",
      href: "/chautari" as const,
      active: pathname === "/chautari",
      /*
       * Concentric arcs: sound leaving a mouth, and the shape of people
       * sitting around a chautari. Drawn rather than an emoji so it inherits
       * the ink colour and the 1.6 stroke every other tab uses.
       */
      icon: (color: string) => (
        <Svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={2.5} stroke={color} strokeWidth={1.7} />
          <Path
            d="M7.5 8.5a6 6 0 0 0 0 7M16.5 8.5a6 6 0 0 1 0 7"
            stroke={color}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <Path
            d="M4.5 5.5a10 10 0 0 0 0 13M19.5 5.5a10 10 0 0 1 0 13"
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.55}
          />
        </Svg>
      ),
    },
    {
      key: "bookmarks",
      label: "Saved",
      href: "/bookmarks" as const,
      active: pathname === "/bookmarks",
      badgeCount: bookmarks.length,
      icon: (color: string, active: boolean) => (
        <Svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="none">
          <Path
            d="M6 4h12a1 1 0 0 1 1 1v15.5l-7-4-7 4V5a1 1 0 0 1 1-1Z"
            stroke={color}
            strokeWidth={1.7}
            fill={active ? color : "none"}
            strokeLinejoin="round"
          />
        </Svg>
      ),
    },
    {
      key: "settings",
      label: "Settings",
      href: "/settings" as const,
      active: pathname === "/settings",
      icon: (color: string, active: boolean) => (
        <Svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 6.5h16M4 12h16M4 17.5h16"
            stroke={color}
            strokeWidth={active ? 2.2 : 1.7}
            strokeLinecap="round"
          />
        </Svg>
      ),
    },
  ];

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: palette.paper,
          borderTopColor: palette.rule,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const color = tab.active ? palette.ink : palette.quiet;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (tab.active) return;
              /*
               * `navigate` either pushes the tab or unwinds to it if it is
               * already on the stack, so switching tabs repeatedly does not
               * pile up screens. It replaces `replace`, which threw the
               * stack away and left the Android back button with nowhere to
               * go but out of the app.
               */
              router.navigate(tab.href);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab.active }}
            accessibilityLabel={tab.label}
            style={styles.tabItem}
          >
            <View style={styles.iconWrap}>
              {tab.icon(color, tab.active)}
              {tab.badgeCount && tab.badgeCount > 0 ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: palette.red },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {tab.badgeCount > 99 ? "99+" : tab.badgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingTop: 8,
    minHeight: 52,
  },
  iconWrap: {
    position: "relative",
    height: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -12,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    paddingHorizontal: 3.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9,
    fontWeight: "500",
  },
  tabLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 4,
  },
});
