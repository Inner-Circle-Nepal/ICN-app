import React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";

import { useForexRates, useNepseSnapshot } from "@/features/market/useMarket";
import { useTheme } from "@/hooks/useTheme";
import { editions } from "@/constants/site";
import { fontFamilies, spacing } from "@/theme/tokens";
import { AppHeader } from "@/components/AppHeader";
import { SectionRule } from "@/components/SectionRule";
import { ForexWidget } from "@/components/ForexWidget";
import { NepseBoard } from "@/components/NepseBoard";

/**
 * Newsroom (`/explore`): search, the NRB remittance converter and the live
 * NEPSE board.
 *
 * Stories live on Home; sections are reached from a story's section label
 * or from Search. This screen is the reader's money desk, so both tools are
 * open rather than hidden behind toggles.
 */
export default function NewsroomScreen() {
  const router = useRouter();
  const { palette, editionSlug } = useTheme();
  const forex = useForexRates();
  const nepse = useNepseSnapshot();

  const currency = editions.find((e) => e.slug === editionSlug)?.currency ?? "USD";
  const refreshing = (forex.isRefetching || nepse.isRefetching) && !forex.isLoading;

  const refresh = () => {
    void forex.refetch();
    void nepse.refetch();
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <AppHeader showSectionBar={false} showSearch={false} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.ink} />
        }
      >
        <View style={[styles.hero, { borderBottomColor: palette.ink }]}>
          <Text style={[styles.kicker, { color: palette.quiet }]}>Newsroom</Text>
          <Text style={[styles.title, { color: palette.ink }]}>Markets &amp; remittance</Text>

          <Pressable
            onPress={() => router.push("/search")}
            accessibilityRole="search"
            accessibilityLabel="Search articles, reporters, and topics"
            style={[
              styles.search,
              { borderColor: palette.rule2, backgroundColor: palette.paper2 },
            ]}
          >
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <Circle cx={11} cy={11} r={7} stroke={palette.quiet} strokeWidth={1.6} />
              <Path
                d="m16.5 16.5 4.5 4.5"
                stroke={palette.quiet}
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            </Svg>
            <Text style={[styles.searchText, { color: palette.quiet }]}>
              Search headlines, dispatches, or topics…
            </Text>
          </Pressable>
        </View>

        <View style={styles.block}>
          <SectionRule title="NRB forex & remittance" />
          {forex.data && forex.data.length > 0 ? (
            <ForexWidget rates={forex.data} defaultCode={currency} />
          ) : (
            <Status loading={forex.isLoading} label="Exchange rates are unavailable right now." />
          )}
        </View>

        <View style={styles.block}>
          <SectionRule title="Live NEPSE" />
          {nepse.data ? (
            <NepseBoard snapshot={nepse.data} />
          ) : (
            <Status loading={nepse.isLoading} label="The NEPSE board is unavailable right now." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Status({ loading, label }: { loading: boolean; label: string }) {
  const { palette } = useTheme();
  return loading ? (
    <ActivityIndicator style={styles.status} color={palette.quiet} />
  ) : (
    <Text style={[styles.status, styles.statusText, { color: palette.quiet }]}>{label}</Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.gutter, paddingTop: 18, paddingBottom: 40 },
  hero: { paddingBottom: 20, borderBottomWidth: 1 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.6,
    marginTop: 6,
  },
  search: {
    marginTop: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchText: { fontFamily: fontFamilies.serifRegular, fontSize: 15.5 },
  block: { marginTop: 26 },
  status: { paddingVertical: 24 },
  statusText: { fontFamily: fontFamilies.sansRegular, fontSize: 13 },
});
