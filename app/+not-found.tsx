import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";

/**
 * Any path no route matches: Expo Router's catch-all, in place of its
 * developer-facing "Unmatched Route" screen.
 *
 * Web links normally never get here: `+native-intent.tsx` rewrites the
 * icn.news paths the app knows and sends the rest to a browser tab. This
 * catches what slips past that: an `icn://` link to a screen that doesn't
 * exist, or one a newer app version would know.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: palette.paper, paddingTop: insets.top }}>
      <EmptyState
        kicker="Page not found"
        title="This page isn't in the app"
        description="The link may be mistyped, or it may need a newer version of the app."
        actionLabel="Front page"
        onAction={() => router.replace("/")}
      />
    </View>
  );
}
