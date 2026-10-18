import { Platform } from "react-native";

/**
 * Inner Circle Nepal — Broadsheet Editorial Design System Tokens
 *
 * Rules of the house (mirrored from `site/src/app/globals.css`):
 *   1. Paper first. Warm off-white ground (#fbfaf7), near-black ink (#14130f).
 *      Dark mode is a considered inversion (#100f0d), not the default.
 *   2. Type carries the page. One serif (Newsreader) across 300/400/500 does
 *      the hierarchy; the sans (Archivo) only labels and meta.
 *   3. Structure with rules, not boxes. Hairlines separate stories.
 *   4. One red (#db0a12), sampled from the logo dot. Reserved for the wordmark,
 *      live/breaking markers, and active states. Never decoration.
 *   5. No gradients, glows, shadows or motion for their own sake.
 */

export const brandColors = {
  icn50: "#fff2f2",
  icn100: "#ffe1e2",
  icn200: "#ffc8ca",
  icn300: "#ffa0a3",
  icn400: "#fb6669",
  icn500: "#f03439",
  icn600: "#dd1219",
  icn700: "#db0a12", // The mark
  icn800: "#ab0a10",
  icn900: "#8c0f13",
  icn950: "#4d0407",
  marketUp: "#0aa06e",
  marketDown: "#db0a12",
} as const;

export interface ThemePalette {
  mode: "light" | "dark";
  paper: string;
  paper2: string;
  ink: string;
  ink2: string;
  quiet: string;
  rule: string;
  rule2: string;
  red: string;
  marketUp: string;
  data: string;
}

export const lightPalette: ThemePalette = {
  mode: "light",
  paper: "#fbfaf7",
  paper2: "#f4f2ed",
  ink: "#14130f",
  ink2: "#35332c",
  quiet: "#6f6b60",
  rule: "#e0ddd4",
  rule2: "#c8c4b8",
  red: brandColors.icn700,
  marketUp: brandColors.marketUp,
  data: "#1f5fa8",
};

export const darkPalette: ThemePalette = {
  mode: "dark",
  paper: "#100f0d",
  paper2: "#191814",
  ink: "#f7f5f0",
  ink2: "#d3cfc5",
  quiet: "#918c80",
  rule: "#2a2823",
  rule2: "#413e37",
  red: brandColors.icn700,
  marketUp: brandColors.marketUp,
  data: "#4a8fd8",
};

const fallbackSerif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia, serif",
});

const fallbackSans = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "system-ui, sans-serif",
});

export const fontFamilies = {
  serifLight: "Newsreader_300Light",
  serifRegular: "Newsreader_400Regular",
  serifItalic: "Newsreader_400Regular_Italic",
  serifMedium: "Newsreader_500Medium",
  sansRegular: "Archivo_400Regular",
  sansMedium: "Archivo_500Medium",
  devaRegular: "Mukta_400Regular",
  devaMedium: "Mukta_500Medium",
  fallbackSerif,
  fallbackSans,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  section: 36,
  gutter: 20,
} as const;
