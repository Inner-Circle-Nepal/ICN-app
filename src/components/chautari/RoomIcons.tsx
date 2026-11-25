import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

/** Icons for the Chautari room, drawn at the 1.7 stroke the tab bar uses. */

export function MicIcon({
  size = 20,
  color,
  off = false,
}: {
  size?: number;
  color: string;
  /** Draws the slash: the microphone is muted. */
  off?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={9} y={3} width={6} height={11} rx={3} stroke={color} strokeWidth={1.7} />
      <Path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      {off ? (
        <Path d="M4 4l16 16" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}

export function InfoIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HandIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5m0-.5V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m-9-.5-1.6-1.9a1.5 1.5 0 0 0-2.3 1.9l3.2 5.2A6 6 0 0 0 12.4 21H13a5 5 0 0 0 5-5v-5a1.5 1.5 0 0 0-1-1.4"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** A padlock: shut for an invite-only room, open (shackle lifted) for a public one. */
export function LockIcon({
  size = 20,
  color,
  locked,
}: {
  size?: number;
  color: string;
  locked: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={10.5} width={14} height={10} rx={2} stroke={color} strokeWidth={1.7} />
      <Path
        d={locked ? "M8 10.5V7.5a4 4 0 0 1 8 0v3" : "M8 10.5V7.5a4 4 0 0 1 7.6-1.7"}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <Path d="M12 14.5v2.5" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}
