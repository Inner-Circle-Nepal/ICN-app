import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing } from "react-native";

/** Long enough to notice, short enough not to wait for. */
export const ENTER_MS = 420;
export const EXIT_MS = 320;

/**
 * Animates one row of a list in and out: it rises into place while fading
 * and growing slightly, and leaves by fading and shrinking. Rows that were
 * already there (`entering` false at mount) just appear.
 */
export function EnterExit({
  entering,
  leaving,
  children,
}: {
  entering: boolean;
  leaving: boolean;
  children: ReactNode;
}) {
  // Created once: a fresh Value per render would restart every animation.
  const [progress] = useState(() => new Animated.Value(entering ? 0 : 1));

  useEffect(() => {
    if (!entering) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Only on mount: a row enters once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Out when it leaves; back in if it returns before it was dropped.
  const wasLeaving = useRef(false);
  useEffect(() => {
    if (!leaving && !wasLeaving.current) return;
    wasLeaving.current = leaving;
    Animated.timing(progress, {
      toValue: leaving ? 0 : 1,
      duration: leaving ? EXIT_MS : ENTER_MS,
      easing: leaving ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [leaving, progress]);

  return (
    <Animated.View
      pointerEvents={leaving ? "none" : "auto"}
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
