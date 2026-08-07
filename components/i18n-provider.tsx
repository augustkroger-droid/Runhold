"use client";

import { createContext, useContext, useMemo } from "react";
import { type Language, type TranslationKey, t } from "@/lib/i18n";

type I18nContextValue = {
  language: Language;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      t: (key, values) => t(language, key, values),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
