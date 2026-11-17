import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Avatar } from "@/components/chautari/Avatar";
import { useUserSearch } from "@/features/profile/useUserSearch";
import { normalizeQuery } from "@/lib/api/readerSearch";
import type { ReaderProfile } from "@/lib/api/readerProfile";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * A reader: photo or initials, display name, @handle. The row used by the
 * @handle dropdown and by the People tab of search.
 */
export function ReaderRow({
  profile,
  onPress,
  disabled,
  accessibilityHint,
}: {
  profile: Pick<ReaderProfile, "username" | "display_name" | "avatar_url">;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${profile.display_name}, @${profile.username}`}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={profile.display_name} size="sm" imageUrl={profile.avatar_url} />
      <View style={styles.who}>
        <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
          {profile.display_name}
        </Text>
        <Text style={[styles.handle, { color: palette.quiet }]} numberOfLines={1}>
          @{profile.username}
        </Text>
      </View>
    </Pressable>
  );
}

const MAX_SUGGESTIONS = 6;

/**
 * A text field that suggests readers as you type: "@a" lists handles that
 * start with "a", longer input also matches names. Picking a suggestion is
 * the only way to choose someone, so a mistyped handle cannot get through.
 *
 * The suggestions sit in the layout below the field rather than floating
 * over it, so the field works inside scroll views and bottom sheets.
 */
export function UserSearchField({
  onPick,
  exclude = [],
  placeholder = "@username",
  disabled = false,
  accessibilityLabel,
}: {
  onPick: (profile: ReaderProfile) => void;
  /** Handles not to offer: yourself, people already picked. */
  exclude?: string[];
  placeholder?: string;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState("");
  const { results, searching, isError } = useUserSearch(draft, {
    limit: MAX_SUGGESTIONS + exclude.length,
  });

  const typed = normalizeQuery(draft);
  const offered = results.filter((p) => !exclude.includes(p.username)).slice(0, MAX_SUGGESTIONS);

  const pick = (profile: ReaderProfile) => {
    setDraft("");
    onPick(profile);
  };

  // Return picks the reader whose handle was typed in full.
  const submit = () => {
    const exact = offered.find((p) => p.username === typed);
    if (exact) pick(exact);
  };

  let status: string | null = null;
  if (typed && offered.length === 0 && !searching) {
    if (isError) status = "Could not search right now. Try again.";
    else if (results.length > 0) status = "No one else matches.";
    else status = `No reader matches “${typed}”.`;
  }

  return (
    <View>
      <View style={[styles.inputWrap, { borderColor: palette.rule2 }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={palette.quiet}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          onSubmitEditing={submit}
          returnKeyType="done"
          accessibilityLabel={accessibilityLabel}
          style={[styles.input, { color: palette.ink }]}
        />
        {searching ? <ActivityIndicator size="small" color={palette.quiet} /> : null}
      </View>

      {typed && (offered.length > 0 || status) ? (
        <View style={[styles.dropdown, { borderColor: palette.rule2, backgroundColor: palette.paper }]}>
          {offered.map((p, i) => (
            <View
              key={p.username}
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: palette.rule } : undefined}
            >
              <ReaderRow profile={p} onPress={() => pick(p)} disabled={disabled} />
            </View>
          ))}
          {status ? (
            <Text style={[styles.status, { color: isError ? palette.red : palette.quiet }]}>
              {status}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  who: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  handle: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 1 },
  pressed: { opacity: 0.7 },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 46,
    gap: 8,
  },
  input: { flex: 1, minHeight: 44, fontFamily: fontFamilies.sansRegular, fontSize: 15 },
  dropdown: { borderWidth: 1, borderTopWidth: 0 },
  status: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
});
