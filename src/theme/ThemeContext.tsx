import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import type {
  LanguagePreference,
  ResolvedTheme,
  ThemePreference,
} from "@/types/domain";
import {
  darkPalette,
  lightPalette,
  type ThemePalette,
} from "@/theme/tokens";
import {
  getStoredEdition,
  getStoredLanguage,
  getStoredTheme,
  setStoredEdition,
  setStoredLanguage,
  setStoredTheme,
} from "@/lib/storage/preferences";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedMode: ResolvedTheme;
  palette: ThemePalette;
  language: LanguagePreference;
  editionSlug: string;
  hydrated: boolean;
  setThemePreference: (next: ThemePreference) => void;
  setLanguage: (next: LanguagePreference) => void;
  setEditionSlug: (next: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolvedMode: "light",
  palette: lightPalette,
  language: "en",
  editionSlug: "usa",
  hydrated: false,
  setThemePreference: () => {},
  setLanguage: () => {},
  setEditionSlug: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [language, setLanguageState] = useState<LanguagePreference>("en");
  const [editionSlug, setEditionSlugState] = useState<string>("usa");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getStoredTheme(), getStoredLanguage(), getStoredEdition()])
      .then(([storedTheme, storedLang, storedEdition]) => {
        if (!active) return;
        setPreferenceState(storedTheme);
        setLanguageState(storedLang);
        setEditionSlugState(storedEdition);
        setHydrated(true);
      })
      .catch(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void setStoredTheme(next);
  }, []);

  const setLanguage = useCallback((next: LanguagePreference) => {
    setLanguageState(next);
    void setStoredLanguage(next);
  }, []);

  const setEditionSlug = useCallback((next: string) => {
    setEditionSlugState(next);
    void setStoredEdition(next);
  }, []);

  const resolvedMode: ResolvedTheme = useMemo(() => {
    if (preference === "light") return "light";
    if (preference === "dark") return "dark";
    return systemScheme === "dark" ? "dark" : "light";
  }, [preference, systemScheme]);

  const palette = resolvedMode === "dark" ? darkPalette : lightPalette;

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedMode,
      palette,
      language,
      editionSlug,
      hydrated,
      setThemePreference,
      setLanguage,
      setEditionSlug,
    }),
    [
      preference,
      resolvedMode,
      palette,
      language,
      editionSlug,
      hydrated,
      setThemePreference,
      setLanguage,
      setEditionSlug,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
