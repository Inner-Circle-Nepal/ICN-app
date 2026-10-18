import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useBookmarks } from "@/features/bookmarks/BookmarksContext";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * Editorial bottom navigation bar.
 *
 * Tabs:
 *   - Home (`/`)
 *   - Explore (`/explore`)
 *   - Saved (`/bookmarks`)
 *   - Settings (`/settings`)
 */

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
      icon: (color: string) => (
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 6h16M4 12h16M4 18h10"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      ),
    },
    {
      key: "explore",
      label: "Explore",
      href: "/explore" as const,
      active: pathname === "/explore",
      icon: (color: string) => (
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
          <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={1.6} />
          <Path
            d="m16.5 16.5 4.5 4.5"
            stroke={color}
            strokeWidth={1.6}
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
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={2.5} stroke={color} strokeWidth={1.6} />
          <Path
            d="M7.5 8.5a6 6 0 0 0 0 7M16.5 8.5a6 6 0 0 1 0 7"
            stroke={color}
            strokeWidth={1.6}
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
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
          <Path
            d="M6 4h12a1 1 0 0 1 1 1v15.5l-7-4-7 4V5a1 1 0 0 1 1-1Z"
            stroke={color}
            strokeWidth={1.6}
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
      icon: (color: string) => (
        <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
          <Rect
            x={4}
            y={5}
            width={16}
            height={14}
            stroke={color}
            strokeWidth={1.6}
          />
          <Path d="M4 9.5h16" stroke={color} strokeWidth={1.4} />
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
          paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 10 : 8),
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
            <View
              style={[
                styles.activeIndicator,
                { backgroundColor: tab.active ? palette.ink : "transparent" },
              ]}
            />
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
  activeIndicator: {
    position: "absolute",
    top: 0,
    width: 28,
    height: 1.5,
  },
  iconWrap: {
    position: "relative",
    height: 22,
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
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginTop: 4,
  },
});
