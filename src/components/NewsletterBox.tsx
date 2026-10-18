import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { subscribeToNewsletter } from "@/lib/api/newsletter";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";

/**
 * Editorial newsletter subscription band ("Six continents. One newsroom.").
 *
 * Validated with React Hook Form + Zod, submitting to `/api/newsletter`
 * with automatic fallback to the Supabase `subscribers` RLS insert policy.
 */

const newsletterSchema = z.object({
  email: z
    .string()
    .trim()
    .min(5, "Enter your email address.")
    .email("That doesn’t look like a valid email address."),
});

type NewsletterFormValues = z.infer<typeof newsletterSchema>;

interface NewsletterBoxProps {
  source?: string;
  heading?: string;
  description?: string;
  compact?: boolean;
  style?: ViewStyle;
}

export function NewsletterBox({
  source = "mobile-home",
  heading = "Six continents.\nOne newsroom.",
  description = "The paper is free to read, and always will be. Subscribers get what moved in Kathmandu overnight and what changed in your visa rules, in one weekday email before your commute.",
  compact = false,
  style,
}: NewsletterBoxProps) {
  const { palette, editionSlug } = useTheme();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewsletterFormValues>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: NewsletterFormValues) => {
    setStatusMessage(null);
    const result = await subscribeToNewsletter({
      email: values.email,
      edition: editionSlug,
      source,
    });
    setIsSuccess(result.ok);
    setStatusMessage(result.message);
    if (result.ok) {
      reset();
    }
  };

  return (
    <View
      style={[
        compact ? styles.compactContainer : styles.bandContainer,
        !compact && {
          backgroundColor: palette.paper2,
          borderTopColor: palette.rule,
          borderBottomColor: palette.rule,
        },
        style,
      ]}
    >
      <Text style={[styles.kicker, { color: palette.ink }]}>
        The Morning Briefing
      </Text>
      <Text
        style={[
          compact ? styles.compactHeading : styles.heading,
          { color: palette.ink },
        ]}
      >
        {heading}
      </Text>
      <Text style={[styles.description, { color: palette.quiet }]}>
        {description}
      </Text>

      <View style={styles.formRow}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder="you@example.com"
              placeholderTextColor={palette.quiet}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              style={[
                styles.input,
                {
                  color: palette.ink,
                  backgroundColor: palette.paper,
                  borderColor: errors.email ? palette.red : palette.rule2,
                },
              ]}
              accessibilityLabel="Email address for the morning briefing"
            />
          )}
        />

        <Pressable
          onPress={() => void handleSubmit(onSubmit)()}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Subscribe to morning briefing"
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: palette.ink },
            (pressed || isSubmitting) && styles.pressed,
          ]}
        >
          <Text style={[styles.submitText, { color: palette.paper }]}>
            {isSubmitting ? "Saving…" : "Subscribe"}
          </Text>
        </Pressable>
      </View>

      {errors.email?.message ? (
        <Text style={[styles.feedbackText, { color: palette.red }]}>
          {errors.email.message}
        </Text>
      ) : null}

      {statusMessage ? (
        <Text
          style={[
            styles.feedbackText,
            { color: isSuccess ? palette.ink : palette.red },
          ]}
        >
          {statusMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bandContainer: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.gutter,
    paddingVertical: 28,
  },
  compactContainer: {
    paddingVertical: 8,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  heading: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.5,
    marginTop: 10,
  },
  compactHeading: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    marginTop: 8,
  },
  description: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
    lineHeight: 23,
    marginTop: 10,
  },
  formRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginTop: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 14,
  },
  submitBtn: {
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  submitText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  feedbackText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  pressed: {
    opacity: 0.75,
  },
});
