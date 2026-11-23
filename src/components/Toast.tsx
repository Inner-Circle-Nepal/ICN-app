import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";

/**
 * Toasts: a short confirmation that slides in at the top, keeps its full
 * sentence (the context matters), and leaves by itself. Tap to dismiss early.
 *
 *   const toast = useToast();
 *   toast.show({ icon: "check", message: "Your profile has been updated." });
 *
 * For confirmations only: errors that need acting on stay where they happened.
 *
 * A React Native <Modal> draws above everything, so a toast shown from inside
 * one (the room chat) would be hidden behind it. Any modal can render a
 * <ToastHost />; the most recently mounted host shows the toast. The root one
 * is mounted by <ToastProvider>.
 */

export type ToastIcon = "check" | "info" | "bell";

export interface ToastInput {
  message: string;
  icon?: ToastIcon;
}

interface ShownToast extends Required<ToastInput> {
  id: number;
}

interface Snapshot {
  toast: ShownToast | null;
  topHost: number | null;
}

/** State kept outside React so hosts can register from effects. */
function createToastStore() {
  let snapshot: Snapshot = { toast: null, topHost: null };
  let hosts: number[] = [];
  let nextToast = 1;
  const listeners = new Set<() => void>();
  const emit = (next: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((l) => l());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => snapshot,
    show(input: ToastInput) {
      emit({ toast: { id: nextToast++, icon: input.icon ?? "check", message: input.message } });
    },
    hide(id: number) {
      if (snapshot.toast?.id === id) emit({ toast: null });
    },
    addHost(id: number) {
      hosts = [...hosts, id];
      emit({ topHost: id });
    },
    removeHost(id: number) {
      hosts = hosts.filter((h) => h !== id);
      emit({ topHost: hosts[hosts.length - 1] ?? null });
    },
  };
}

type ToastStore = ReturnType<typeof createToastStore>;
const ToastContext = createContext<ToastStore | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createToastStore);
  return (
    <ToastContext.Provider value={store}>
      {children}
      <ToastHost />
    </ToastContext.Provider>
  );
}

/** `show` a toast. A no-op outside <ToastProvider> (tests, storybook). */
export function useToast(): { show: (input: ToastInput) => void } {
  const store = useContext(ToastContext);
  // Stable per store, so it can sit in a hook's dependency list.
  return useMemo(() => ({ show: store ? store.show : () => undefined }), [store]);
}

let nextHost = 1;

/** Where toasts are drawn. Render one inside any <Modal> that shows them. */
export function ToastHost() {
  const store = useContext(ToastContext);
  const [id] = useState(() => nextHost++);
  useEffect(() => {
    if (!store) return;
    store.addHost(id);
    return () => store.removeHost(id);
  }, [store, id]);

  const empty: Snapshot = { toast: null, topHost: null };
  const snap = useSyncExternalStore(
    store ? store.subscribe : () => () => undefined,
    store ? store.get : () => empty,
  );
  if (!store || !snap.toast || snap.topHost !== id) return null;
  return <ToastCard key={snap.toast.id} toast={snap.toast} onGone={() => store.hide(snap.toast!.id)} />;
}

/** Long enough to read the sentence: about 3 s, longer for longer text. */
function visibleMs(message: string): number {
  return Math.min(7000, Math.max(3000, 1800 + message.length * 45));
}

function ToastCard({ toast, onGone }: { toast: ShownToast; onGone: () => void }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [shown] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(shown, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => {
      Animated.timing(shown, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => finished && onGone());
    }, visibleMs(toast.message));
    return () => clearTimeout(t);
    // One card per toast id (the host keys it), so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + 8 }]}>
      <Animated.View
        style={{
          opacity: shown,
          transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        }}
      >
        <Pressable
          onPress={onGone}
          accessibilityRole="alert"
          accessibilityLabel={toast.message}
          accessibilityHint="Tap to dismiss"
          style={[styles.card, { backgroundColor: palette.paper, borderColor: palette.ink }]}
        >
          <View style={[styles.iconCircle, { backgroundColor: palette.ink }]}>
            <ToastGlyph icon={toast.icon} color={palette.paper} />
          </View>
          <Text style={[styles.message, { color: palette.ink }]}>{toast.message}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ToastGlyph({ icon, color }: { icon: ToastIcon; color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      {icon === "check" ? (
        <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      ) : icon === "bell" ? (
        <Path
          d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <>
          <Path d="M12 11v6" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          <Circle cx={12} cy={7} r={1.4} fill={color} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: spacing.gutter, right: spacing.gutter, zIndex: 1000, elevation: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  message: { flex: 1, fontFamily: fontFamilies.sansRegular, fontSize: 14, lineHeight: 20 },
});
