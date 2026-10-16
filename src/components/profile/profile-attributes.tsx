import { Lock, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ASSET_OPTIONS,
  CHILDREN_OPTIONS,
  COUNTRY_OPTIONS,
  EDUCATION_OPTIONS,
  FREQUENCY_OPTIONS,
  LANGUAGE_OPTIONS,
  MARITAL_OPTIONS,
  RELIGION_OPTIONS,
  TATTOO_OPTIONS,
  isPremiumUnlocked,
  type Option,
  type PremiumPreferenceKey,
} from "@/lib/profile-options";
import { cn } from "@/lib/utils";
import type {
  AssetRange,
  LanguageCode,
  PartnerPreferences,
  PersonalProfile,
} from "@/types/profile";
import type { UserLevel } from "@/types/user";

/**
 * Module P — read-only views of the extended profile and the partner
 * conditions. Server-renderable (no hooks beyond `useTranslations`), so the
 * same components serve the member's own profile and other members' pages.
 *
 * Privacy: only values the member actually filled in are rendered; empty
 * attributes are omitted rather than shown as "—", which keeps the profile
 * readable and avoids leaking which fields exist.
 */

function labelOf<T extends string>(
  options: Option<T>[],
  value: T | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  return options.find((option) => option.value === value)?.labelKey ?? null;
}

interface AttributeRow {
  key: string;
  label: string;
  value: string;
}

/**
 * 「详细资料」 — a two-column grid of the filled-in P1 attributes.
 * Returns null when nothing has been set yet.
 */
export function ProfileAttributes({
  profile,
  className,
}: {
  profile: PersonalProfile | undefined;
  className?: string;
}) {
  const t = useTranslations("profileForm");

  if (!profile) {
    return null;
  }

  const rows: AttributeRow[] = [];

  if (profile.heightCm) {
    rows.push({
      key: "height",
      label: t("height.label"),
      value: t("height.value", { cm: profile.heightCm }),
    });
  }

  // 体重与身高成对出现，紧邻着排在后面。
  // 同样是敏感项（`onboarding.attributes` 的提示里写明了不公开展示），
  // 但既然会员自己填了，在「详细资料」里回看是必要的。
  if (profile.weightKg) {
    rows.push({
      key: "weight",
      label: t("weight.label"),
      value: t("weight.value", { kg: profile.weightKg }),
    });
  }

  const education = labelOf(EDUCATION_OPTIONS, profile.education);
  if (education) {
    rows.push({
      key: "education",
      label: t("education.label"),
      value: t(education),
    });
  }

  if (profile.languages.length > 0) {
    rows.push({
      key: "languages",
      label: t("language.label"),
      value: profile.languages
        .map((code) => {
          const key = labelOf(LANGUAGE_OPTIONS, code as LanguageCode);
          return key ? t(key) : code;
        })
        .join(" · "),
    });
  }

  if (profile.occupation.trim()) {
    rows.push({
      key: "occupation",
      label: t("occupation.label"),
      value: profile.occupation,
    });
  }

  const marital = labelOf(MARITAL_OPTIONS, profile.maritalStatus);
  if (marital) {
    rows.push({
      key: "maritalStatus",
      label: t("marital.label"),
      value: t(marital),
    });
  }

  const children = labelOf(CHILDREN_OPTIONS, profile.children);
  if (children) {
    rows.push({
      key: "children",
      label: t("children.label"),
      value: t(children),
    });
  }

  const religion = labelOf(RELIGION_OPTIONS, profile.religion);
  if (religion) {
    rows.push({
      key: "religion",
      label: t("religion.label"),
      value: t(religion),
    });
  }

  const tattoo = labelOf(TATTOO_OPTIONS, profile.tattoo);
  if (tattoo) {
    rows.push({ key: "tattoo", label: t("tattoo.label"), value: t(tattoo) });
  }

  const smoking = labelOf(FREQUENCY_OPTIONS, profile.smoking);
  if (smoking) {
    rows.push({
      key: "smoking",
      label: t("smoking.label"),
      value: t(smoking),
    });
  }

  const drinking = labelOf(FREQUENCY_OPTIONS, profile.drinking);
  if (drinking) {
    rows.push({
      key: "drinking",
      label: t("drinking.label"),
      value: t(drinking),
    });
  }

  const assets = labelOf(ASSET_OPTIONS, profile.assetRange);
  if (assets) {
    rows.push({ key: "assets", label: t("asset.label"), value: t(assets) });
  }

  const country = labelOf(COUNTRY_OPTIONS, profile.countryCode);
  if (country || profile.city.trim()) {
    rows.push({
      key: "residence",
      label: t("residence.label"),
      value: [country ? t(country) : null, profile.city.trim() || null]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-3 [&>div]:min-w-0",
        className,
      )}
    >
      {rows.map((row) => (
        <div key={row.key} className="min-w-0">
          <dt className="truncate text-[11px] text-muted-foreground">
            {row.label}
          </dt>
          <dd className="mt-0.5 truncate text-xs font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Partner conditions                                                         */
/* -------------------------------------------------------------------------- */

interface ConditionChip {
  key: string;
  label: string;
  /** Premium condition (P3) — rendered with a lock when not yet unlocked. */
  premium?: boolean;
  /** Locked for this member's level. */
  locked?: boolean;
  /** Individually charged condition (P4) that is switched on. */
  exclusive?: boolean;
}

/**
 * 「择偶条件」 summary. Premium conditions the member's level does not cover
 * are shown greyed with a lock so the upgrade path stays visible (P3), and
 * P4 conditions are flagged as separately charged.
 */
export function PartnerPreferenceSummary({
  preferences,
  level,
  className,
}: {
  preferences: PartnerPreferences | undefined;
  level: UserLevel;
  className?: string;
}) {
  const t = useTranslations("partnerPref");
  const tf = useTranslations("profileForm");

  if (!preferences) {
    return null;
  }

  const premium = (key: PremiumPreferenceKey, chip: ConditionChip) => ({
    ...chip,
    premium: true,
    locked: !isPremiumUnlocked(key, level),
  });

  const chips: ConditionChip[] = [];

  if (preferences.ageMin !== null || preferences.ageMax !== null) {
    chips.push({
      key: "age",
      label: t("summary.age", {
        min: preferences.ageMin ?? 18,
        max: preferences.ageMax ?? 80,
      }),
    });
  }

  if (preferences.heightMin !== null || preferences.heightMax !== null) {
    chips.push({
      key: "height",
      label: t("summary.height", {
        min: preferences.heightMin ?? 140,
        max: preferences.heightMax ?? 210,
      }),
    });
  }

  if (preferences.countries.length > 0) {
    chips.push({
      key: "countries",
      label: t("summary.countries", { count: preferences.countries.length }),
    });
  }

  if (preferences.education.length > 0) {
    chips.push(
      premium("education", {
        key: "education",
        label: t("summary.education", { count: preferences.education.length }),
      }),
    );
  }

  if (preferences.languages.length > 0) {
    chips.push(
      premium("languages", {
        key: "languages",
        label: t("summary.languages", { count: preferences.languages.length }),
      }),
    );
  }

  if (preferences.religions.length > 0) {
    chips.push(
      premium("religions", {
        key: "religions",
        label: t("summary.religions", { count: preferences.religions.length }),
      }),
    );
  }

  if (preferences.noTattoo) {
    chips.push(
      premium("noTattoo", { key: "noTattoo", label: t("summary.noTattoo") }),
    );
  }

  if (preferences.children.length > 0) {
    chips.push(
      premium("children", {
        key: "children",
        label: t("summary.children", { count: preferences.children.length }),
      }),
    );
  }

  if (preferences.assetMin !== null) {
    const key = labelOf(ASSET_OPTIONS, preferences.assetMin as AssetRange);
    chips.push(
      premium("assetMin", {
        key: "assetMin",
        label: t("summary.assetMin", {
          range: key ? tf(key) : preferences.assetMin,
        }),
      }),
    );
  }

  if (preferences.cities.length > 0) {
    chips.push(
      premium("cities", {
        key: "cities",
        label: t("summary.cities", { count: preferences.cities.length }),
      }),
    );
  }

  const smoking = labelOf(FREQUENCY_OPTIONS, preferences.smoking);
  if (smoking) {
    chips.push({
      key: "smoking",
      label: t("summary.smoking", { level: tf(smoking) }),
    });
  }

  const drinking = labelOf(FREQUENCY_OPTIONS, preferences.drinking);
  if (drinking) {
    chips.push({
      key: "drinking",
      label: t("summary.drinking", { level: tf(drinking) }),
    });
  }

  if (preferences.exclusive.length > 0) {
    chips.push({
      key: "exclusive",
      label: t("summary.exclusive", { count: preferences.exclusive.length }),
      exclusive: true,
    });
  }

  if (chips.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {t("empty")}
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset",
              chip.locked
                ? "bg-muted text-muted-foreground/70 ring-transparent"
                : chip.exclusive
                  ? "bg-violet-500/10 text-violet-600 ring-violet-500/25 dark:text-violet-400"
                  : chip.premium
                    ? "bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400"
                    : "bg-muted text-foreground/80 ring-transparent",
            )}
          >
            {chip.locked ? (
              <Lock className="size-2.5" />
            ) : chip.premium || chip.exclusive ? (
              <Sparkles className="size-2.5" />
            ) : null}
            {chip.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Convenience union used when a caller only has the loose mock shape. */
export type ProfileAttributeProps = {
  profile?: PersonalProfile;
  preferences?: PartnerPreferences;
};
