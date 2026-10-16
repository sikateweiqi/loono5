import { defineRouting } from "next-intl/routing";

export const locales = ["zh", "ru", "en"] as const;

export type Locale = (typeof locales)[number];

/**
 * Chinese is the primary market for the H5 app (WeChat browser),
 * so it is the default locale.
 *
 * `as-needed` keeps the default locale unprefixed so that URLs match
 * the PRD sitemap exactly: `/`, `/auth/register`, `/catalog`, ...
 * Other locales are prefixed: `/ru/catalog`, `/en/catalog`.
 */
export const routing = defineRouting({
  locales,
  defaultLocale: "zh",
  localePrefix: "as-needed",
  localeDetection: true,
});

export const localeLabels: Record<Locale, string> = {
  zh: "中文",
  ru: "Русский",
  en: "English",
};
