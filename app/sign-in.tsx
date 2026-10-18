import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSignIn, useSignUp, useAuth } from "@clerk/clerk-expo";
import Svg, { Path } from "react-native-svg";

import { isClerkConfigured } from "@/constants/config";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { ErrorState } from "@/components/ErrorState";

/**
 * Reader sign-in, for Chautari.
 *
 * Email and a one-time code — no password to forget and none to store. The
 * same Clerk application the website uses, so an account made on icn.news
 * works here and vice versa; this screen creates no second identity.
 *
 * Styled as part of the paper rather than as a dropped-in auth widget, the
 * same decision `clerkAppearance` makes on the website.
 */
export default function SignInScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { isSignedIn } = useAuth();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  /* Clerk needs to know whether to complete a sign-in or a sign-up. */
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = signInLoaded && signUpLoaded;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/chautari");
  };

  /**
   * Clerk reports an unknown address as a sign-in failure, so a first-time
   * reader is moved to sign-up rather than shown an error they cannot act on.
   */
  const sendCode = async () => {
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      await signIn!.create({ identifier: address, strategy: "email_code" });
      setIsNewAccount(false);
      setStage("code");
    } catch {
      try {
        await signUp!.create({ emailAddress: address });
        await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
        setIsNewAccount(true);
        setStage("code");
      } catch (e) {
        setError(readableClerkError(e, "We could not send a code to that address."));
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const entered = code.trim();
    if (entered.length < 4) {
      setError("Enter the code from your email.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      if (isNewAccount) {
        const result = await signUp!.attemptEmailAddressVerification({ code: entered });
        if (result.status === "complete") {
          await setSignUpActive!({ session: result.createdSessionId });
          back();
          return;
        }
      } else {
        const result = await signIn!.attemptFirstFactor({ strategy: "email_code", code: entered });
        if (result.status === "complete") {
          await setSignInActive!({ session: result.createdSessionId });
          back();
          return;
        }
      }
      setError("That code did not work. Please try again.");
    } catch (e) {
      setError(readableClerkError(e, "That code did not work."));
    } finally {
      setBusy(false);
    }
  };

  if (!isClerkConfigured) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper }]}>
        <ErrorState
          title="Accounts are unavailable"
          message="This build has no account system configured."
        />
      </View>
    );
  }

  if (isSignedIn) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper }]}>
        <ErrorState
          title="You are signed in"
          message="Head back to Chautari to join a conversation."
          onRetry={() => router.replace("/chautari")}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: palette.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.topBar, { borderBottomColor: palette.rule }]}>
        <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backBtn}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M11 6l-6 6 6 6" stroke={palette.ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={[styles.backLabel, { color: palette.ink }]}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.kicker, { color: palette.quiet }]}>Reader account</Text>
        <Text style={[styles.title, { color: palette.ink }]}>
          {stage === "email" ? "Sign in to Inner Circle Nepal" : "Check your email"}
        </Text>
        <Text style={[styles.sub, { color: palette.quiet }]}>
          {stage === "email"
            ? "Reading is free and always will be. An account is only needed to join a Chautari conversation."
            : `We sent a code to ${email.trim().toLowerCase()}.`}
        </Text>

        {stage === "email" ? (
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={palette.quiet}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            editable={!busy}
            onSubmitEditing={() => void sendCode()}
            returnKeyType="send"
            accessibilityLabel="Email address"
            style={[styles.input, { borderColor: palette.rule2, color: palette.ink }]}
          />
        ) : (
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={palette.quiet}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            editable={!busy}
            onSubmitEditing={() => void verify()}
            returnKeyType="go"
            accessibilityLabel="Verification code"
            style={[styles.input, styles.codeInput, { borderColor: palette.rule2, color: palette.ink }]}
          />
        )}

        {error ? (
          <Text style={[styles.error, { color: palette.red }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={() => void (stage === "email" ? sendCode() : verify())}
          disabled={busy || !ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !ready }}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: busy || !ready ? palette.rule2 : palette.ink },
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={palette.paper} />
          ) : (
            <Text style={[styles.primaryText, { color: palette.paper }]}>
              {stage === "email" ? "Email me a code" : "Sign in"}
            </Text>
          )}
        </Pressable>

        {stage === "code" ? (
          <Pressable
            onPress={() => {
              setStage("email");
              setCode("");
              setError(null);
            }}
            style={styles.linkBtn}
          >
            <Text style={[styles.link, { color: palette.quiet }]}>Use a different address</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.legal, { color: palette.quiet }]}>
          We use your address to sign you in and nothing else. No password is
          stored on this device.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Clerk's errors are structured; show the first message, not a stack. */
function readableClerkError(e: unknown, fallback: string): string {
  const errs = (e as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  return errs?.[0]?.longMessage || errs?.[0]?.message || fallback;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    height: 48,
    paddingHorizontal: spacing.gutter,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 },
  backLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  body: { paddingHorizontal: spacing.gutter, paddingTop: 28, paddingBottom: 40 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.5,
    marginTop: 8,
  },
  sub: { fontFamily: fontFamilies.serifLight, fontSize: 16, lineHeight: 24, marginTop: 10 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
    marginTop: 22,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 16,
  },
  codeInput: { letterSpacing: 6, fontSize: 20 },
  error: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 19, marginTop: 12 },
  primary: {
    marginTop: 18,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  linkBtn: { marginTop: 16, minHeight: 32, justifyContent: "center" },
  link: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12.5,
    textDecorationLine: "underline",
  },
  legal: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5, lineHeight: 17, marginTop: 28 },
  pressed: { opacity: 0.8 },
});
