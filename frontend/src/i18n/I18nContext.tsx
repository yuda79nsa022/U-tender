import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { ar, en, type Dictionary } from "@/i18n/translations";

export type Language = "en" | "ar";

const dictionaries: Record<Language, Dictionary> = { en, ar };
const RTL_LANGUAGES: Language[] = ["ar"];
const STORAGE_KEY = "utender.language";

function lookup(dict: Dictionary, key: string): string {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : key;
}

function detectInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ar") return stored;
  } catch {
    // localStorage unavailable (private browsing, disabled storage) — fall
    // back to the default rather than letting the page crash.
  }
  return "en";
}

interface I18nContextValue {
  language: Language;
  dir: "ltr" | "rtl";
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  // A signed-in user's saved preference (set previously, possibly on
  // another device) wins over whatever this tab guessed at load — but
  // only when the user object first appears, so it doesn't fight a
  // switch made mid-session on this tab.
  useEffect(() => {
    if (user && (user.language === "en" || user.language === "ar") && user.language !== language) {
      setLanguageState(user.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const dir = RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore — persistence is a convenience, not a requirement
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (user) {
      // Best-effort: the UI has already switched regardless of whether
      // this call succeeds.
      apiFetch("/auth/language", { method: "PATCH", body: { language: lang } }).catch(() => {});
    }
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      dir: RTL_LANGUAGES.includes(language) ? "rtl" : "ltr",
      setLanguage,
      t: (key: string) => lookup(dictionaries[language], key),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, user]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
