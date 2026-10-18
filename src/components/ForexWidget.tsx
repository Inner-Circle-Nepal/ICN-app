import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import type { ForexRate } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import {
  STALE_AFTER_DAYS,
  perUnit,
  rateAgeInDays,
} from "@/utils/format";

/**
 * Remittance converter and NRB indicative buying rate table.
 *
 * Mirrors `site/src/components/widgets/ForexWidget.tsx`:
 *   - "You send" input + currency selector
 *   - "They receive, approximately" in NPR (dividing by `unit` so JPY per-10
 *     and INR/KRW per-100 convert accurately)
 *   - Rate table ordered by remittance corridor
 *   - Staleness warning when rates are > 10 days old
 */

const CORRIDOR_ORDER = [
  "USD",
  "INR",
  "AED",
  "QAR",
  "SAR",
  "AUD",
  "GBP",
  "EUR",
  "MYR",
  "KRW",
  "JPY",
  "CAD",
];

interface ForexWidgetProps {
  rates: ForexRate[];
  defaultCode?: string;
  style?: ViewStyle;
}

export function ForexWidget({
  rates,
  defaultCode = "USD",
  style,
}: ForexWidgetProps) {
  const { palette } = useTheme();
  const [code, setCode] = useState(defaultCode);
  const [amount, setAmount] = useState("500");

  const sortedRates = useMemo(() => {
    const rank = (c: string) => {
      const i = CORRIDOR_ORDER.indexOf(c);
      return i === -1 ? CORRIDOR_ORDER.length : i;
    };
    return [...rates].sort((a, b) => rank(a.code) - rank(b.code));
  }, [rates]);

  const active = useMemo(
    () => sortedRates.find((r) => r.code === code) ?? sortedRates[0],
    [sortedRates, code],
  );

  const visible = useMemo(() => {
    const top = sortedRates.slice(0, 6);
    if (active && !top.some((r) => r.code === active.code)) {
      top.splice(5, 1, active);
    }
    return top;
  }, [sortedRates, active]);

  const npr = useMemo(() => {
    const n = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(n) || !active) return null;
    return n * perUnit(active);
  }, [amount, active]);

  const asOf = useMemo(() => {
    const stamps = rates
      .map((r) => r.updated_at)
      .filter((s): s is string => Boolean(s))
      .sort();
    const latest = stamps[stamps.length - 1];
    if (!latest) return null;
    try {
      return new Date(latest).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
    } catch {
      return null;
    }
  }, [rates]);

  const age = useMemo(() => rateAgeInDays(rates), [rates]);
  const stale = age !== null && age > STALE_AFTER_DAYS;

  if (!rates.length) return null;

  return (
    <View
      style={[
        styles.container,
        { borderTopColor: palette.ink },
        style,
      ]}
      accessibilityLabel="Remittance rates converter"
    >
      <Text style={[styles.kicker, { color: palette.ink }]}>Send home</Text>

      {stale ? (
        <View
          style={[
            styles.staleNotice,
            { borderLeftColor: palette.red },
          ]}
        >
          <Text style={[styles.staleText, { color: palette.red }]}>
            <Text style={{ color: palette.ink }}>These rates are {age} days old. </Text>
            Nepal Rastra Bank has published since. Treat the figures below as indicative only.
          </Text>
        </View>
      ) : null}

      {/* Currency chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.currencyStrip}
      >
        {sortedRates.map((r) => {
          const isSelected = r.code === active?.code;
          return (
            <Pressable
              key={r.code}
              onPress={() => setCode(r.code)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Select ${r.currency} (${r.code})`}
              style={[
                styles.currencyPill,
                {
                  borderColor: isSelected ? palette.ink : palette.rule2,
                  backgroundColor: isSelected ? palette.ink : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.currencyPillText,
                  { color: isSelected ? palette.paper : palette.ink2 },
                ]}
              >
                {r.code}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Converter */}
      <View style={styles.converterRow}>
        <View style={styles.converterCol}>
          <Text style={[styles.metaLabel, { color: palette.quiet }]}>You send</Text>
          <View
            style={[
              styles.valueRow,
              { borderBottomColor: palette.rule2 },
            ]}
          >
            <TextInput
              value={amount}
              onChangeText={(txt) => setAmount(txt.replace(/[^\d.]/g, ""))}
              keyboardType="decimal-pad"
              style={[styles.amountInput, { color: palette.ink }]}
              accessibilityLabel="Amount to send"
            />
            <Text style={[styles.codeSuffix, { color: palette.quiet }]}>
              {active?.code ?? "USD"}
            </Text>
          </View>
        </View>

        <View style={styles.converterCol}>
          <Text style={[styles.metaLabel, { color: palette.quiet }]}>
            They receive, approx.
          </Text>
          <View
            style={[
              styles.valueRow,
              { borderBottomColor: palette.rule2 },
            ]}
          >
            <Text
              style={[styles.nprOutput, { color: palette.ink }]}
              numberOfLines={1}
            >
              {npr === null
                ? "—"
                : Math.round(npr).toLocaleString("en-US")}
            </Text>
            <Text style={[styles.codeSuffix, { color: palette.quiet }]}>NPR</Text>
          </View>
        </View>
      </View>

      {/* Rate table */}
      <View style={styles.table}>
        {visible.map((r) => (
          <Pressable
            key={r.code}
            onPress={() => setCode(r.code)}
            style={[
              styles.tableRow,
              { borderBottomColor: palette.rule },
            ]}
          >
            <Text style={[styles.rowCode, { color: palette.ink2 }]}>
              {r.code}
              {r.unit > 1 ? (
                <Text style={[styles.rowUnit, { color: palette.quiet }]}>
                  {" "}
                  ×{r.unit}
                </Text>
              ) : null}
            </Text>
            <Text style={[styles.rowBuy, { color: palette.ink }]}>
              {r.buy.toFixed(2)}
            </Text>
            <Text
              style={[
                styles.rowChange,
                {
                  color: r.change >= 0 ? palette.ink2 : palette.red,
                },
              ]}
            >
              {r.change >= 0 ? "+" : ""}
              {r.change.toFixed(2)}%
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.footnote, { color: palette.quiet }]}>
        Nepal Rastra Bank indicative buying rates
        {asOf ? `, ${asOf}` : ""}. Your operator’s executable rate and fees will differ — always compare before you send.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  staleNotice: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    marginTop: 12,
  },
  staleText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
  },
  currencyStrip: {
    paddingTop: 14,
    paddingBottom: 4,
    gap: 6,
  },
  currencyPill: {
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  currencyPillText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  converterRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 14,
  },
  converterCol: {
    flex: 1,
  },
  metaLabel: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    marginBottom: 6,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingBottom: 6,
    gap: 6,
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamilies.serifRegular,
    fontSize: 24,
    paddingVertical: 0,
  },
  nprOutput: {
    flex: 1,
    fontFamily: fontFamilies.serifRegular,
    fontSize: 24,
    fontVariant: ["tabular-nums"],
  },
  codeSuffix: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
  },
  table: {
    marginTop: 16,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "baseline",
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  rowCode: {
    flex: 1,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13,
  },
  rowUnit: {
    fontSize: 11,
  },
  rowBuy: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  rowChange: {
    width: 64,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  footnote: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 12,
  },
});
