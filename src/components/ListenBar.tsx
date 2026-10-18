import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { NARRATION_RATES, type Narration } from "@/features/audio/useNarration";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * Listen controls for an article.
 *
 * Sits in the byline area rather than floating over the text: listening is
 * one way of reading a story, not a separate mode with its own chrome. The
 * bar only appears once there is something to read aloud, and collapses to a
 * single Listen button until the reader starts.
 */

interface ListenBarProps {
  narration: Narration;
  isNepali?: boolean;
}

const COPY = {
  en: {
    listen: "Listen",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    speed: "Speed",
    noVoice: "No Nepali voice is installed on this device. Add one in your device's text-to-speech settings.",
  },
  ne: {
    listen: "सुन्नुहोस्",
    pause: "रोक्नुहोस्",
    resume: "जारी राख्नुहोस्",
    stop: "बन्द गर्नुहोस्",
    speed: "गति",
    noVoice: "यस यन्त्रमा नेपाली भ्वाइस छैन। यन्त्रको टेक्स्ट-टु-स्पिच सेटिङमा थप्नुहोस्।",
  },
} as const;

export function ListenBar({ narration, isNepali = false }: ListenBarProps) {
  const { palette } = useTheme();
  const t = COPY[isNepali ? "ne" : "en"];

  if (!narration.available) return null;

  const playing = narration.status === "speaking";
  const paused = narration.status === "paused";
  const active = playing || paused;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={playing ? narration.pause : paused ? narration.resume : narration.play}
          accessibilityRole="button"
          accessibilityLabel={playing ? t.pause : paused ? t.resume : t.listen}
          style={({ pressed }) => [
            styles.primary,
            { borderColor: palette.ink },
            pressed && styles.pressed,
          ]}
        >
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            {playing ? (
              <>
                <Rect x={6} y={5} width={4} height={14} fill={palette.ink} />
                <Rect x={14} y={5} width={4} height={14} fill={palette.ink} />
              </>
            ) : (
              <Path d="M7 4.5v15l13-7.5-13-7.5Z" fill={palette.ink} />
            )}
          </Svg>
          <Text style={[styles.primaryText, { color: palette.ink }]}>
            {playing ? t.pause : paused ? t.resume : t.listen}
          </Text>
        </Pressable>

        {active ? (
          <>
            <View style={styles.speeds}>
              {NARRATION_RATES.map((r) => {
                const on = Math.abs(narration.rate - r) < 0.01;
                return (
                  <Pressable
                    key={r}
                    onPress={() => narration.setRate(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.speed} ${r}x`}
                    accessibilityState={{ selected: on }}
                    hitSlop={{ top: 10, bottom: 10, left: 3, right: 3 }}
                    style={styles.speed}
                  >
                    <Text
                      style={[
                        styles.speedText,
                        {
                          color: on ? palette.ink : palette.quiet,
                          textDecorationLine: on ? "underline" : "none",
                        },
                      ]}
                    >
                      {r}×
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={narration.stop}
              accessibilityRole="button"
              accessibilityLabel={t.stop}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={styles.stop}
            >
              <Text style={[styles.stopText, { color: palette.quiet }]}>{t.stop}</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {active ? (
        <View style={[styles.track, { backgroundColor: palette.rule }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: palette.ink,
                width: `${Math.round(narration.progress * 100)}%`,
              },
            ]}
          />
        </View>
      ) : null}

      {narration.voiceMissing && isNepali ? (
        <Text style={[styles.note, { color: palette.quiet }]}>{t.noVoice}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  primaryText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  speeds: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  speed: {
    minHeight: 32,
    justifyContent: "center",
  },
  speedText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  stop: {
    minHeight: 32,
    justifyContent: "center",
  },
  stopText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  track: {
    height: 2,
    marginTop: 10,
    overflow: "hidden",
  },
  fill: {
    height: 2,
  },
  note: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 8,
  },
  pressed: {
    opacity: 0.75,
  },
});
