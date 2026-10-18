import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { NepseScrip, NepseSnapshot } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import {
  formatCount,
  formatPercent,
  formatPrice,
  formatRupees,
  isFromCurrentSession,
  marketDateLabel,
  marketTimeLabel,
} from "@/utils/format";

/**
 * Full NEPSE Market Board rendered at the top of the NEPSE section.
 *
 * Mirrors `site/src/components/widgets/NepseBoardView.tsx`:
 *   - Index close, point move, and percentage move
 *   - Session status ("Market open" / "Market closed" / "Last session")
 *   - Summary totals (Turnover in Rs arba/crore, Traded Shares, Transactions)
 *   - Tabbed mover lists on mobile: Top gainers, Top losers, Most traded
 */

interface NepseBoardProps {
  snapshot: NepseSnapshot;
  style?: ViewStyle;
}

type MoverTab = "gainers" | "losers" | "traded";

export function NepseBoard({ snapshot, style }: NepseBoardProps) {
  const { palette } = useTheme();
  const [activeTab, setActiveTab] = useState<MoverTab>("gainers");

  if (!snapshot.index && snapshot.gainers.length === 0) return null;

  const { index, isOpen, summary, gainers, losers, mostTraded, scripCount } = snapshot;
  const at = marketTimeLabel(index?.generatedAt ?? null);
  const on = marketDateLabel(index?.generatedAt ?? null);
  const current = isFromCurrentSession(index?.generatedAt ?? null);

  const indexMoveColor =
    (index?.change ?? 0) > 0
      ? palette.marketUp
      : (index?.change ?? 0) < 0
        ? palette.red
        : palette.quiet;

  const activeScrips: NepseScrip[] =
    activeTab === "gainers"
      ? gainers
      : activeTab === "losers"
        ? losers
        : mostTraded;

  return (
    <View
      style={[
        styles.container,
        {
          borderTopColor: palette.ink,
          borderBottomColor: palette.ink,
        },
        style,
      ]}
      accessibilityLabel="NEPSE market board"
    >
      <Text style={[styles.kicker, { color: palette.red }]}>
        {!current ? "Last session" : isOpen ? "Market open" : "Market closed"}
      </Text>

      {index ? (
        <View style={styles.indexHeadlineRow}>
          <Text style={[styles.indexClose, { color: palette.ink }]}>
            {formatPrice(index.close)}
          </Text>
          <Text style={[styles.indexDelta, { color: indexMoveColor }]}>
            {index.change > 0 ? "+" : index.change < 0 ? "−" : ""}
            {formatPrice(Math.abs(index.change))} {formatPercent(index.percentChange)}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.metaStamp, { color: palette.quiet }]}>
        NEPSE Index
        {at ? ` · as of ${at}` : ""}
        {on ? ` on ${on}` : ""}
      </Text>

      {summary.length > 0 ? (
        <View style={styles.summaryGrid}>
          {summary.slice(0, 4).map((row) => (
            <View key={row.label} style={styles.summaryCell}>
              <Text style={[styles.summaryLabel, { color: palette.quiet }]}>
                {row.label}
              </Text>
              <Text style={[styles.summaryValue, { color: palette.ink }]}>
                {/turnover/i.test(row.label)
                  ? formatRupees(row.value)
                  : formatCount(row.value)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {gainers.length > 0 ? (
        <View style={styles.moversSection}>
          <View
            style={[
              styles.moverTabsRow,
              { borderTopColor: palette.ink, borderBottomColor: palette.rule },
            ]}
          >
            {(
              [
                { id: "gainers", label: "Top gainers" },
                { id: "losers", label: "Top losers" },
                { id: "traded", label: "Most traded" },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[
                    styles.moverTabBtn,
                    selected && {
                      borderBottomWidth: 1.5,
                      borderBottomColor: palette.ink,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.moverTabLabel,
                      { color: selected ? palette.ink : palette.quiet },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {activeScrips.map((scrip) => {
            const scripColor =
              scrip.change > 0
                ? palette.marketUp
                : scrip.change < 0
                  ? palette.red
                  : palette.quiet;

            return (
              <View
                key={scrip.symbol}
                style={[
                  styles.scripRow,
                  { borderBottomColor: palette.rule },
                ]}
              >
                <View style={styles.scripLeft}>
                  <Text style={[styles.scripSymbol, { color: palette.ink }]}>
                    {scrip.symbol}
                  </Text>
                  <Text
                    style={[styles.scripName, { color: palette.quiet }]}
                    numberOfLines={1}
                  >
                    {scrip.name}
                  </Text>
                </View>

                <View style={styles.scripRight}>
                  <Text style={[styles.scripPrice, { color: palette.ink }]}>
                    {formatPrice(scrip.ltp)}
                  </Text>
                  <Text
                    style={[
                      styles.scripMetric,
                      {
                        color: activeTab === "traded" ? palette.quiet : scripColor,
                      },
                    ]}
                  >
                    {activeTab === "traded"
                      ? formatRupees(scrip.turnover)
                      : formatPercent(scrip.percentChange)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={[styles.disclaimer, { color: palette.quiet }]}>
        Figures from the Nepal Stock Exchange
        {scripCount > 0 ? ` across ${formatCount(scripCount)} listed scrips` : ""}, via
        the open-source YoNEPSE dataset. Provided for information only — not investment advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 20,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  indexHeadlineRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 6,
  },
  indexClose: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 38,
    lineHeight: 42,
    fontVariant: ["tabular-nums"],
  },
  indexDelta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  metaStamp: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    marginTop: 4,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 18,
    rowGap: 12,
  },
  summaryCell: {
    width: "50%",
    paddingRight: 8,
  },
  summaryLabel: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
  },
  summaryValue: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16.5,
    marginTop: 3,
    fontVariant: ["tabular-nums"],
  },
  moversSection: {
    marginTop: 20,
  },
  moverTabsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: 20,
  },
  moverTabBtn: {
    paddingVertical: 10,
  },
  moverTabLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  scripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingVertical: 9,
    gap: 10,
  },
  scripLeft: {
    flex: 1,
    minWidth: 0,
  },
  scripSymbol: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 13.5,
    fontWeight: "500",
  },
  scripName: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    marginTop: 1,
  },
  scripRight: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  scripPrice: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  scripMetric: {
    minWidth: 82,
    textAlign: "right",
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12.5,
    fontVariant: ["tabular-nums"],
  },
  disclaimer: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 14,
  },
});
