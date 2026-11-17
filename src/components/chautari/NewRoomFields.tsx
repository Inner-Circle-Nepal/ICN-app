import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

import { ChautariError, uploadBanner, type GetToken } from "@/lib/api/chautari";
import { UserSearchField } from "@/components/UserSearchField";
import { profileImageDataUri } from "@/features/profile/photo";
import { bookingDays, bookingSlots, formatBooking } from "@/features/chautari/schedule";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * The optional parts of opening a Chautari room: when, a cover photo, and
 * who helps run it. Each field owns its own little interaction and reports
 * a plain value up to the form.
 */

/* ------------------------------------------------------------------- When */

export type When = { mode: "now" } | { mode: "later"; iso: string | null };

export function WhenField({
  value,
  onChange,
  disabled,
}: {
  value: When;
  onChange: (next: When) => void;
  disabled: boolean;
}) {
  const { palette } = useTheme();
  // Captured once: the list of days does not need to roll over mid-form.
  const [now] = useState(() => Date.now());
  const days = useMemo(() => bookingDays(now), [now]);
  const [dayKey, setDayKey] = useState(days[0]?.key ?? "");
  const slots = useMemo(() => (dayKey ? bookingSlots(dayKey, now) : []), [dayKey, now]);

  const later = value.mode === "later";

  return (
    <View>
      <View style={styles.segment}>
        {(
          [
            { key: "now", label: "Start now" },
            { key: "later", label: "Schedule" },
          ] as const
        ).map((opt) => {
          const active = value.mode === opt.key;
          return (
            <Pressable
              key={opt.key}
              disabled={disabled}
              onPress={() => onChange(opt.key === "now" ? { mode: "now" } : { mode: "later", iso: null })}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={[
                styles.segmentBtn,
                {
                  borderColor: active ? palette.ink : palette.rule2,
                  backgroundColor: active ? palette.ink : "transparent",
                },
              ]}
            >
              <Text style={[styles.segmentText, { color: active ? palette.paper : palette.ink }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {later ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {days.map((d) => {
              const active = d.key === dayKey;
              return (
                <Chip
                  key={d.key}
                  label={d.label}
                  active={active}
                  disabled={disabled}
                  onPress={() => {
                    setDayKey(d.key);
                    onChange({ mode: "later", iso: null });
                  }}
                />
              );
            })}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {slots.map((s) => (
              <Chip
                key={s.iso}
                label={s.label}
                active={value.iso === s.iso}
                disabled={disabled}
                onPress={() => onChange({ mode: "later", iso: s.iso })}
              />
            ))}
          </ScrollView>
          <Text style={[styles.hint, { color: value.iso ? palette.ink : palette.quiet }]}>
            {value.iso
              ? `Goes on the schedule for ${formatBooking(value.iso)}.`
              : "Pick a day and a time. Times are Kathmandu time."}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={[
        styles.chip,
        {
          borderColor: active ? palette.ink : palette.rule2,
          backgroundColor: active ? palette.ink : "transparent",
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? palette.paper : palette.ink }]}>{label}</Text>
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Banner */

export function BannerField({
  url,
  onChange,
  getToken,
  disabled,
}: {
  url: string | null;
  onChange: (url: string | null) => void;
  getToken: GetToken;
  disabled: boolean;
}) {
  const { palette } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
      base64: true,
    });
    if (picked.canceled) return;
    const data = profileImageDataUri(picked.assets?.[0]);
    if (!data) {
      setError("That image could not be read. Please try another.");
      return;
    }
    setUploading(true);
    try {
      onChange(await uploadBanner(getToken, data));
    } catch (e) {
      setError(e instanceof ChautariError ? e.message : "Could not upload that photo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View>
      <Pressable
        onPress={() => void pick()}
        disabled={disabled || uploading}
        accessibilityRole="button"
        accessibilityLabel={url ? "Change the cover photo" : "Add a cover photo"}
        style={({ pressed }) => [
          styles.banner,
          { borderColor: url ? palette.ink : palette.rule2, backgroundColor: palette.paper2 },
          pressed && styles.pressed,
        ]}
      >
        {url ? (
          <Image source={{ uri: url }} style={styles.bannerImage} contentFit="cover" transition={150} />
        ) : uploading ? null : (
          <View style={styles.bannerEmpty}>
            <Text style={[styles.bannerPlus, { color: palette.quiet }]}>+</Text>
            <Text style={[styles.bannerEmptyText, { color: palette.quiet }]}>Add a cover photo</Text>
          </View>
        )}
        {uploading ? (
          <View style={[styles.bannerBusy, { backgroundColor: palette.paper }]}>
            <ActivityIndicator color={palette.ink} />
          </View>
        ) : null}
      </Pressable>
      {url ? (
        <View style={styles.linkRow}>
          <Pressable onPress={() => void pick()} disabled={disabled || uploading} hitSlop={8}>
            <Text style={[styles.link, { color: palette.ink }]}>Change</Text>
          </Pressable>
          <Pressable onPress={() => onChange(null)} disabled={disabled || uploading} hitSlop={8}>
            <Text style={[styles.link, { color: palette.quiet }]}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={[styles.error, { color: palette.red }]}>{error}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------- Moderators */

export type PickedModerator = { username: string; name: string };

export const MAX_MODERATORS = 3;

export function ModeratorsField({
  value,
  onChange,
  ownUsername,
  disabled,
}: {
  value: PickedModerator[];
  onChange: (next: PickedModerator[]) => void;
  ownUsername: string | null;
  disabled: boolean;
}) {
  const { palette } = useTheme();

  const full = value.length >= MAX_MODERATORS;
  // The host is never offered, nor anyone already on the list.
  const exclude = [...(ownUsername ? [ownUsername] : []), ...value.map((m) => m.username)];

  return (
    <View>
      {value.map((m) => (
        <View key={m.username} style={[styles.modRow, { borderBottomColor: palette.rule }]}>
          <View style={styles.modWho}>
            <Text style={[styles.modName, { color: palette.ink }]} numberOfLines={1}>
              {m.name}
            </Text>
            <Text style={[styles.modHandle, { color: palette.quiet }]}>@{m.username}</Text>
          </View>
          <Pressable
            onPress={() => onChange(value.filter((x) => x.username !== m.username))}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${m.name} as a moderator`}
            hitSlop={10}
          >
            <Text style={[styles.link, { color: palette.quiet }]}>Remove</Text>
          </Pressable>
        </View>
      ))}

      {!full ? (
        <View style={styles.modInputRow}>
          <UserSearchField
            onPick={(p) => onChange([...value, { username: p.username, name: p.display_name }])}
            exclude={exclude}
            disabled={disabled}
            accessibilityLabel="Find a moderator by username or name"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: "row", gap: 8 },
  segmentBtn: { flex: 1, minHeight: 44, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  segmentText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  chipRow: { gap: 8, paddingTop: 12 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderWidth: 1, justifyContent: "center" },
  chipText: { fontFamily: fontFamilies.sansMedium, fontSize: 12.5 },
  hint: { fontFamily: fontFamilies.serifRegular, fontSize: 14, lineHeight: 20, marginTop: 12 },

  banner: { aspectRatio: 16 / 9, borderWidth: 1, overflow: "hidden" },
  bannerImage: { width: "100%", height: "100%" },
  bannerEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  bannerPlus: { fontFamily: fontFamilies.serifLight, fontSize: 34, lineHeight: 38 },
  bannerEmptyText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  bannerBusy: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.8,
    alignItems: "center",
    justifyContent: "center",
  },
  linkRow: { flexDirection: "row", gap: 18, marginTop: 10 },
  link: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  error: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 19, marginTop: 10 },

  modRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  modWho: { flex: 1, minWidth: 0 },
  modName: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  modHandle: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 1 },
  modInputRow: { marginTop: 10 },
  pressed: { opacity: 0.7 },
});
