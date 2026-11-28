import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState, Linking, Platform, StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { getAppVersionInfo } from "@/lib/api/appVersion";
import { useTheme } from "@/hooks/useTheme";
import { isOutdated } from "./version";

const HOUR_MS = 60 * 60 * 1000;

/**
 * "Please update": covers the whole app when this version is older than the
 * oldest one the site still supports (after a breaking change on our side,
 * such as moving the database). Asked at launch and again on returning to
 * the app after an hour. No way past it, but only a definite answer from the
 * site shows it: offline, or anything unreadable, and the app carries on.
 * Not persisted, so an old answer never blocks a cold start.
 */
export function UpdateGate() {
  const { palette } = useTheme();
  const platform = Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : null;
  const installed = Constants.expoConfig?.version ?? null;

  const { data, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["app-version"],
    queryFn: getAppVersionInfo,
    enabled: platform !== null,
    staleTime: HOUR_MS,
    retry: false,
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && Date.now() - dataUpdatedAt > HOUR_MS) void refetch();
    });
    return () => sub.remove();
  }, [refetch, dataUpdatedAt]);

  if (!platform || !data || !isOutdated(installed, data.minVersion[platform])) return null;

  const storeUrl = data.storeUrl[platform];
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: palette.paper }]}
      accessibilityViewIsModal
    >
      <EmptyState
        kicker="Update needed"
        title="Please update the app"
        description={`This version (${installed}) no longer works. Update Inner Circle Nepal from the ${
          platform === "ios" ? "App Store" : "Play Store"
        } to keep reading.`}
        actionLabel="Update"
        onAction={() => void Linking.openURL(storeUrl)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { zIndex: 1000, elevation: 1000, justifyContent: "center" },
});
