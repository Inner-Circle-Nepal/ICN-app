import React, { useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Constants from "expo-constants";

import { isClerkConfigured } from "@/constants/config";
import { Avatar } from "@/components/chautari/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { useCategories } from "@/features/categories/useCategories";
import {
  getStoredEdition,
  setStoredEdition,
} from "@/lib/storage/preferences";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState,
} from "@/lib/notifications/push";
import { queryClient } from "@/lib/query/queryClient";
import { editions, site } from "@/constants/site";
import { fontFamilies, spacing } from "@/theme/tokens";
import { clockIn } from "@/utils/format";
import { AppHeader } from "@/components/AppHeader";
import { SectionRule } from "@/components/SectionRule";
import { NewsletterBox } from "@/components/NewsletterBox";
import { Logo } from "@/components/Logo";
import type { LanguagePreference, ThemePreference } from "@/types/domain";

/**
 * The way into the reader account, from the screen people look for it on.
 *
 * Renders nothing when this build has no account system — the same rule the
 * rest of the app follows, so an unconfigured build looks exactly as it did
 * before accounts existed.
 */
function AccountRow() {
  const router = useRouter();
  const { palette } = useTheme();
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();

  if (!isClerkConfigured || !isLoaded) return null;

  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const name = user?.fullName?.trim() || user?.firstName?.trim() || email?.split("@")[0] || null;

  return (
    <View style={styles.section}>
      <SectionRule title="Your account" />
      <Pressable
        onPress={() => router.push(isSignedIn ? "/profile" : "/sign-in")}
        accessibilityRole="button"
        accessibilityLabel={
          isSignedIn ? `Open your profile, signed in as ${name ?? "you"}` : "Sign in"
        }
        style={({ pressed }) => [
          accountStyles.row,
          { borderBottomColor: palette.rule },
          pressed && accountStyles.pressed,
        ]}
      >
        {/*
          Signed out there is no picture to show, and `hasImage` keeps Clerk's
          generated placeholder from standing in for one the reader never set.
        */}
        <Avatar
          name={name ?? "?"}
          size="md"
          imageUrl={isSignedIn && user?.hasImage ? user.imageUrl : null}
        />
        <View style={accountStyles.text}>
          <Text style={[accountStyles.name, { color: palette.ink }]} numberOfLines={1}>
            {isSignedIn ? (name ?? "Your profile") : "Sign in"}
          </Text>
          <Text style={[accountStyles.meta, { color: palette.quiet }]} numberOfLines={1}>
            {isSignedIn
              ? (email ?? "Edit your name and briefing")
              : "Reading is free. An account is only for Chautari."}
          </Text>
        </View>
        <Text style={[accountStyles.chevron, { color: palette.quiet }]}>›</Text>
      </Pressable>
    </View>
  );
}

const accountStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  text: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 17 },
  meta: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 2 },
  chevron: { fontFamily: fontFamilies.serifRegular, fontSize: 22 },
  pressed: { opacity: 0.75 },
});

const tipFormSchema = z.object({
  desk: z.enum(["tips", "corrections", "editor"]),
  email: z
    .string()
    .trim()
    .email("Please enter a valid return email address")
    .or(z.literal("")),
  subject: z
    .string()
    .trim()
    .min(4, "Subject must be at least 4 characters")
    .max(120, "Subject must be under 120 characters"),
  message: z
    .string()
    .trim()
    .min(15, "Please include at least 15 characters of detail"),
});

type TipFormValues = z.infer<typeof tipFormSchema>;

/**
 * Settings, Editorial Standards & Newsroom Desk Screen (`app/settings.tsx`).
 *
 * Includes:
 *   - Theme preference (`System` / `Light` / `Dark`)
 *   - Reading language (`English` / `नेपाली`)
 *   - Diaspora Edition & live Kathmandu / hub world clocks
 *   - Push Notification permission & SecureStore token management
 *   - Newsletter subscription (`NewsletterBox`)
 *   - Contact the Newsroom / Send a Tip form (`react-hook-form` + `zod`)
 *   - Editorial standards, corrections policy, and cache controls
 */
export default function SettingsScreen() {
  const {
    palette,
    preference: themePreference,
    setThemePreference,
    language,
    setLanguage,
  } = useTheme();
  const categoriesQuery = useCategories();

  const [selectedEdition, setSelectedEdition] = useState<string>("usa");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifStatusMessage, setNotifStatusMessage] = useState<string | null>(
    null,
  );
  const [cacheCleared, setCacheCleared] = useState(false);
  const [tipSubmitted, setTipSubmitted] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);

  useEffect(() => {
    void getStoredEdition().then(setSelectedEdition);
    void (async () => {
      const state = await getPushNotificationState();
      setNotificationsEnabled(state.enabled);
      if (state.statusNote) {
        setNotifStatusMessage(state.statusNote);
      }
    })();
  }, []);

  const handleSelectEdition = (slug: string) => {
    setSelectedEdition(slug);
    void setStoredEdition(slug);
  };

  const handleToggleNotifications = async (nextValue: boolean) => {
    setNotifStatusMessage(null);
    if (nextValue) {
      const res = await enablePushNotifications();
      setNotificationsEnabled(res.enabled);
      if (res.enabled) {
        setNotifStatusMessage(
          res.statusNote ?? "Breaking-news alerts enabled for this device.",
        );
      } else {
        setNotifStatusMessage(
          res.statusNote ?? "Notification permission was not granted.",
        );
      }
    } else {
      await disablePushNotifications();
      setNotificationsEnabled(false);
      setNotifStatusMessage("Breaking-news alerts paused.");
    }
  };

  const clearedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clearedTimer.current) clearTimeout(clearedTimer.current);
    },
    [],
  );

  const handleClearCache = () => {
    queryClient.clear();
    setCacheCleared(true);
    if (clearedTimer.current) clearTimeout(clearedTimer.current);
    clearedTimer.current = setTimeout(() => setCacheCleared(false), 2500);
  };

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TipFormValues>({
    resolver: zodResolver(tipFormSchema),
    defaultValues: {
      desk: "tips",
      email: "",
      subject: "",
      message: "",
    },
  });

  const onSubmitTip = async (values: TipFormValues) => {
    const targetEmail =
      values.desk === "tips"
        ? site.tipsEmail
        : values.desk === "corrections"
          ? site.correctionsEmail
          : site.contactEmail;

    const bodyLines = [
      values.message,
      "",
      "---",
      values.email ? `Reply-To: ${values.email}` : "Sent via Inner Circle Nepal mobile app",
    ];
    const mailtoUrl = `mailto:${targetEmail}?subject=${encodeURIComponent(
      `[ICN ${values.desk.toUpperCase()}] ${values.subject}`,
    )}&body=${encodeURIComponent(bodyLines.join("\n"))}`;

    try {
      await Linking.openURL(mailtoUrl);
      setTipError(null);
      setTipSubmitted(true);
      reset();
    } catch {
      /*
       * Nothing was sent. This used to report success anyway, which on a
       * device with no mail account configured meant a reader watched their
       * tip vanish and believed the newsroom had it. Give them the address
       * instead so they can still reach the desk.
       */
      setTipSubmitted(false);
      setTipError(
        `We couldn’t open your mail app. Please write to ${targetEmail} directly.`,
      );
    }
  };

  const activeEditionObj =
    editions.find((e) => e.slug === selectedEdition) ?? editions[0];

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <AppHeader
        categories={categoriesQuery.data ?? []}
        showSectionBar={false}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View
          style={[
            styles.heroHeader,
            { borderBottomColor: palette.ink },
          ]}
        >
          <Text style={[styles.kicker, { color: palette.quiet }]}>
            Preferences & Masthead
          </Text>
          <Text style={[styles.title, { color: palette.ink }]}>
            Edition & Settings
          </Text>
          <Text style={[styles.subtitle, { color: palette.quiet }]}>
            Configure your reading experience, language, diaspora edition clock,
            and newsroom dispatches.
          </Text>
        </View>

        {/* 0. Your account — only when accounts exist in this build. */}
        <AccountRow />

        {/* 1. Reading & Appearance */}
        <View style={styles.section}>
          <SectionRule title="Reading & appearance" />

          {/* Theme Selector */}
          <View
            style={[
              styles.settingBlock,
              { borderBottomColor: palette.rule },
            ]}
          >
            <Text style={[styles.settingTitle, { color: palette.ink }]}>
              Paper & Ink Theme
            </Text>
            <Text style={[styles.settingDesc, { color: palette.quiet }]}>
              Warm newsprint for daylight reading or low-glare broadsheet dark
              mode at night.
            </Text>
            <View style={styles.segmentedRow}>
              {(
                [
                  { key: "system", label: "System" },
                  { key: "light", label: "Newsprint" },
                  { key: "dark", label: "Night Ink" },
                ] as { key: ThemePreference; label: string }[]
              ).map((opt) => {
                const active = themePreference === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setThemePreference(opt.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={[
                      styles.segmentBtn,
                      {
                        borderColor: active ? palette.ink : palette.rule2,
                        backgroundColor: active
                          ? palette.ink
                          : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: active ? palette.paper : palette.ink,
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Language Selector */}
          <View
            style={[
              styles.settingBlock,
              { borderBottomColor: palette.rule },
            ]}
          >
            <Text style={[styles.settingTitle, { color: palette.ink }]}>
              Primary Reading Language
            </Text>
            <Text style={[styles.settingDesc, { color: palette.quiet }]}>
              Displays Nepali (देवनागरी) headlines, section labels, and body copy
              whenever a bilingual translation is filed.
            </Text>
            <View style={styles.segmentedRow}>
              {(
                [
                  { key: "en", label: "English (EN)" },
                  { key: "ne", label: "नेपाली (NE)" },
                ] as { key: LanguagePreference; label: string }[]
              ).map((opt) => {
                const active = language === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setLanguage(opt.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={[
                      styles.segmentBtn,
                      {
                        borderColor: active ? palette.ink : palette.rule2,
                        backgroundColor: active
                          ? palette.ink
                          : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: active ? palette.paper : palette.ink,
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Diaspora Edition & World Clocks */}
          <View style={styles.settingBlockNoBorder}>
            <View style={styles.clockHeaderRow}>
              <Text style={[styles.settingTitle, { color: palette.ink }]}>
                Diaspora Edition & Desk Clocks
              </Text>
              <Text style={[styles.clockReadout, { color: palette.quiet }]}>
                KTM {clockIn("Asia/Kathmandu")} ·{" "}
                {activeEditionObj.code}{" "}
                {clockIn(activeEditionObj.timezone)}
              </Text>
            </View>
            <Text style={[styles.settingDesc, { color: palette.quiet }]}>
              Select your primary diaspora hub for local time reference and
              regional dispatches.
            </Text>
            <View style={styles.editionChipsRow}>
              {editions.map((ed) => {
                const active = selectedEdition === ed.slug;
                return (
                  <Pressable
                    key={ed.slug}
                    onPress={() => handleSelectEdition(ed.slug)}
                    style={[
                      styles.editionChip,
                      {
                        borderColor: active ? palette.ink : palette.rule2,
                        backgroundColor: active
                          ? palette.paper2
                          : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.editionChipName,
                        {
                          color: palette.ink,
                          textDecorationLine: active ? "underline" : "none",
                        },
                      ]}
                    >
                      {ed.name}
                    </Text>
                    <Text
                      style={[
                        styles.editionChipHub,
                        { color: palette.quiet },
                      ]}
                    >
                      {ed.currency} · {ed.zones.length} timezones
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* 2. Dispatches & Alerts */}
        <View style={styles.section}>
          <SectionRule title="Dispatches & alerts" />

          <View
            style={[
              styles.switchRow,
              { borderBottomColor: palette.rule },
            ]}
          >
            <View style={styles.switchTextCol}>
              <Text style={[styles.settingTitle, { color: palette.ink }]}>
                Breaking News Push Alerts
              </Text>
              <Text style={[styles.settingDesc, { color: palette.quiet }]}>
                Receive major breaking dispatches and investigative releases. We
                never send promotional notifications.
              </Text>
              {notifStatusMessage ? (
                <Text
                  style={[styles.notifFeedback, { color: palette.ink2 }]}
                >
                  {notifStatusMessage}
                </Text>
              ) : null}
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={(val) => void handleToggleNotifications(val)}
              trackColor={{ false: palette.rule2, true: palette.ink }}
              thumbColor={palette.paper}
            />
          </View>

          <View style={styles.newsletterWrap}>
            <NewsletterBox />
          </View>
        </View>

        {/* 3. Contact the Newsroom / Send a Tip (React Hook Form + Zod) */}
        <View style={styles.section}>
          <SectionRule
            title="Contact the newsroom"
            cta={site.tipsEmail}
          />
          <View
            style={[
              styles.formCard,
              {
                borderColor: palette.ink,
                backgroundColor: palette.paper2,
              },
            ]}
          >
            <Text style={[styles.kicker, { color: palette.ink }]}>
              Confidential tips · Corrections · Letters
            </Text>
            <Text style={[styles.formHeadline, { color: palette.ink }]}>
              Write to the Desk
            </Text>
            <Text style={[styles.settingDesc, { color: palette.quiet }]}>
              Send a story lead, request a factual correction, or reach the
              editors in Kathmandu.
            </Text>

            {/* Desk selector */}
            <Controller
              control={control}
              name="desk"
              render={({ field: { value, onChange } }) => (
                <View style={styles.segmentedRow}>
                  {(
                    [
                      { key: "tips", label: "News Tip" },
                      { key: "corrections", label: "Correction" },
                      { key: "editor", label: "Editorial" },
                    ] as const
                  ).map((item) => {
                    const active = value === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => onChange(item.key)}
                        style={[
                          styles.segmentBtn,
                          {
                            borderColor: active ? palette.ink : palette.rule2,
                            backgroundColor: active
                              ? palette.ink
                              : "transparent",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            { color: active ? palette.paper : palette.ink },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            />

            {/* Subject */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: palette.quiet }]}>
                Subject
              </Text>
              <Controller
                control={control}
                name="subject"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Brief summary of your tip or note"
                    placeholderTextColor={palette.quiet}
                    style={[
                      styles.textInput,
                      {
                        color: palette.ink,
                        borderColor: errors.subject
                          ? palette.red
                          : palette.rule2,
                        backgroundColor: palette.paper,
                      },
                    ]}
                  />
                )}
              />
              {errors.subject ? (
                <Text style={[styles.errorText, { color: palette.red }]}>
                  {errors.subject.message}
                </Text>
              ) : null}
            </View>

            {/* Return email (optional) */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: palette.quiet }]}>
                Your email (optional, for reporter follow-up)
              </Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="you@example.com"
                    placeholderTextColor={palette.quiet}
                    style={[
                      styles.textInput,
                      {
                        color: palette.ink,
                        borderColor: errors.email
                          ? palette.red
                          : palette.rule2,
                        backgroundColor: palette.paper,
                      },
                    ]}
                  />
                )}
              />
              {errors.email ? (
                <Text style={[styles.errorText, { color: palette.red }]}>
                  {errors.email.message}
                </Text>
              ) : null}
            </View>

            {/* Message */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: palette.quiet }]}>
                Message or dispatch details
              </Text>
              <Controller
                control={control}
                name="message"
                render={({ field: { value, onChange, onBlur } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    multiline
                    numberOfLines={4}
                    placeholder="Include relevant dates, documents, or article headline…"
                    placeholderTextColor={palette.quiet}
                    style={[
                      styles.textArea,
                      {
                        color: palette.ink,
                        borderColor: errors.message
                          ? palette.red
                          : palette.rule2,
                        backgroundColor: palette.paper,
                      },
                    ]}
                  />
                )}
              />
              {errors.message ? (
                <Text style={[styles.errorText, { color: palette.red }]}>
                  {errors.message.message}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => void handleSubmit((vals) => void onSubmitTip(vals))()}
              style={[
                styles.submitBtn,
                {
                  backgroundColor: palette.ink,
                  borderColor: palette.ink,
                },
              ]}
            >
              <Text style={[styles.submitBtnText, { color: palette.paper }]}>
                Compose Dispatch to Desk
              </Text>
            </Pressable>

            {tipSubmitted ? (
              <Text
                style={[styles.notifFeedback, { color: palette.ink }]}
                accessibilityLiveRegion="polite"
              >
                Opened in your mail client. Thank you for writing to the desk.
              </Text>
            ) : null}

            {tipError ? (
              <Text
                style={[styles.notifFeedback, { color: palette.red }]}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {tipError}
              </Text>
            ) : null}
          </View>
        </View>

        {/* 4. About & Editorial Standards */}
        <View style={styles.section}>
          <SectionRule title="Masthead & standards" />

          <View
            style={[
              styles.aboutBlock,
              { borderBottomColor: palette.rule },
            ]}
          >
            <Logo size="lg" />
            <Text style={[styles.aboutText, { color: palette.ink2 }]}>
              {site.description}
            </Text>
            <Text style={[styles.aboutMeta, { color: palette.quiet }]}>
              {site.location} · {site.issn} · Version {appVersion}
            </Text>

            <View style={styles.linksRow}>
              <Pressable
                onPress={() => void Linking.openURL(site.url).catch(() => {})}
              >
                <Text style={[styles.extLink, { color: palette.ink }]}>
                  icn.news ↗
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  void Linking.openURL(`mailto:${site.contactEmail}`).catch(
                    () => {},
                  )
                }
              >
                <Text style={[styles.extLink, { color: palette.ink }]}>
                  {site.contactEmail}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  void Linking.openURL(`mailto:${site.correctionsEmail}`).catch(
                    () => {},
                  )
                }
              >
                <Text style={[styles.extLink, { color: palette.ink }]}>
                  {site.correctionsEmail}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Cache Maintenance */}
          <View style={styles.cacheRow}>
            <View style={styles.cacheTextCol}>
              <Text style={[styles.settingTitle, { color: palette.ink }]}>
                Network Cache
              </Text>
              <Text style={[styles.settingDesc, { color: palette.quiet }]}>
                Clear in-memory article and market data cache to force fresh
                fetches.
              </Text>
            </View>
            <Pressable
              onPress={handleClearCache}
              style={[styles.clearCacheBtn, { borderColor: palette.ink }]}
            >
              <Text style={[styles.clearCacheText, { color: palette.ink }]}>
                {cacheCleared ? "Cleared" : "Clear Cache"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: 48,
  },
  heroHeader: {
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.6,
    marginTop: 6,
  },
  subtitle: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  section: {
    marginTop: 28,
  },
  settingBlock: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingBlockNoBorder: {
    paddingTop: 16,
  },
  settingTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 18,
    fontWeight: "500",
  },
  settingDesc: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 4,
  },
  segmentedRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  segmentBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: "center",
  },
  segmentText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  clockHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  clockReadout: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  editionChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  editionChip: {
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minWidth: 96,
  },
  editionChipName: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  editionChipHub: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    marginTop: 2,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 18,
    borderBottomWidth: 1,
    gap: 14,
  },
  switchTextCol: {
    flex: 1,
  },
  notifFeedback: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    marginTop: 8,
  },
  newsletterWrap: {
    marginTop: 20,
  },
  formCard: {
    borderTopWidth: 2,
    borderBottomWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  formHeadline: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 25,
    lineHeight: 30,
    marginTop: 6,
  },
  fieldGroup: {
    marginTop: 14,
  },
  fieldLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    minHeight: 92,
    textAlignVertical: "top",
  },
  errorText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    marginTop: 4,
  },
  submitBtn: {
    marginTop: 16,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: "center",
  },
  submitBtnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  aboutBlock: {
    paddingBottom: 20,
    borderBottomWidth: 1,
    gap: 10,
  },
  aboutText: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
    lineHeight: 23,
    marginTop: 6,
  },
  aboutMeta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    letterSpacing: 0.6,
  },
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 6,
  },
  extLink: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    textDecorationLine: "underline",
  },
  cacheRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  cacheTextCol: {
    flex: 1,
  },
  clearCacheBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearCacheText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
