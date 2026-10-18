import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LanguagePreference, ThemePreference } from "@/types/domain";

/**
 * Non-sensitive user preferences persisted in AsyncStorage.
 *
 * Uses the same key naming convention as the website (`icn-theme`, `icn-lang`,
 * `icn-edition`).
 */

const KEYS = {
  theme: "icn-theme",
  language: "icn-lang",
  edition: "icn-edition",
  recentSearches: "icn-recent-searches",
  notificationsEnabled: "icn-notifications-enabled",
} as const;

export async function getStoredTheme(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.theme);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Ignore storage errors
  }
  return "system";
}

export async function setStoredTheme(theme: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.theme, theme);
  } catch {
    // Ignore storage errors
  }
}

export async function getStoredLanguage(): Promise<LanguagePreference> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.language);
    if (raw === "en" || raw === "ne") return raw;
  } catch {
    // Ignore storage errors
  }
  return "en";
}

export async function setStoredLanguage(lang: LanguagePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.language, lang);
  } catch {
    // Ignore storage errors
  }
}

export async function getStoredEdition(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.edition);
    if (raw) return raw;
  } catch {
    // Ignore storage errors
  }
  return "usa";
}

export async function setStoredEdition(editionSlug: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.edition, editionSlug);
  } catch {
    // Ignore storage errors
  }
}

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.recentSearches);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string").slice(0, 8);
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

export async function addRecentSearch(query: string): Promise<string[]> {
  const cleaned = query.trim();
  if (cleaned.length < 2) return getRecentSearches();

  const existing = await getRecentSearches();
  const next = [
    cleaned,
    ...existing.filter((item) => item.toLowerCase() !== cleaned.toLowerCase()),
  ].slice(0, 8);

  try {
    await AsyncStorage.setItem(KEYS.recentSearches, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.recentSearches);
  } catch {
    // Ignore storage errors
  }
}

export async function getStoredNotificationsPref(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.notificationsEnabled);
    return raw === "true";
  } catch {
    return false;
  }
}

export async function setStoredNotificationsPref(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.notificationsEnabled, enabled ? "true" : "false");
  } catch {
    // Ignore storage errors
  }
}
