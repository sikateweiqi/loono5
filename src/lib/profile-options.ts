import {
  ASSET_RANGES,
  CHILDREN_STATUSES,
  EDUCATION_LEVELS,
  EXCLUSIVE_CONDITIONS,
  type ExclusiveConditionCode,
  type ExclusiveConditionDefinition,
  FREQUENCIES,
  LANGUAGE_CODES,
  MARITAL_STATUSES,
  RELIGIONS,
  TATTOO_LEVELS,
  type PartnerPreferences,
  type PersonalProfile,
} from "@/types/profile";
import type { UserLevel } from "@/types/user";

/**
 * Module P — option registries for the profile form and the preference form.
 *
 * Labels are i18n keys under the `profileForm` namespace, so the backend can
 * swap the dictionary without a release (module B2). Everything here is a
 * plain value list: the React layer picks the component (chips vs. input).
 */

export interface Option<T extends string> {
  value: T;
  /** Key inside the `profileForm` namespace. */
  labelKey: string;
}

const toOptions = <T extends string>(
  values: readonly T[],
  group: string,
): Option<T>[] =>
  values.map((value) => ({ value, labelKey: `${group}.${value}` }));

export const EDUCATION_OPTIONS = toOptions(EDUCATION_LEVELS, "education");
export const LANGUAGE_OPTIONS = toOptions(LANGUAGE_CODES, "language");
export const RELIGION_OPTIONS = toOptions(RELIGIONS, "religion");
export const TATTOO_OPTIONS = toOptions(TATTOO_LEVELS, "tattoo");
export const FREQUENCY_OPTIONS = toOptions(FREQUENCIES, "frequency");
export const ASSET_OPTIONS = toOptions(ASSET_RANGES, "asset");
export const CHILDREN_OPTIONS = toOptions(CHILDREN_STATUSES, "children");
export const MARITAL_OPTIONS = toOptions(MARITAL_STATUSES, "marital");

/**
 * Residence picker. Kept short on purpose — the real deployment loads the
 * country list from the backend dictionary.
 *
 * `KZ` 必须在列：平台本身注册在哈萨克斯坦，而种子数据里的代理商名册
 * 也落在 KZ / SE / MX。原先这三个码只在代理商表里出现、不在会员可选
 * 列表中，结果是"平台自己所在的国家选不到"。
 */
export const COUNTRY_CODES = [
  "CN",
  "KZ",
  "RU",
  "US",
  "GB",
  "DE",
  "FR",
  "JP",
  "KR",
  "SG",
  "AU",
  "CA",
  "AE",
  "SE",
  "MX",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export const COUNTRY_OPTIONS = toOptions(COUNTRY_CODES, "country");

/**
 * 兴趣标签词表。
 *
 * 从 `components/onboarding/profile-step.tsx` 搬到这里，因为现在有**两处**
 * 需要它：注册第二步的选择器，以及服务端校验（`lib/profile/actions.ts`）。
 * 词表只有一份，"客户端能选出来的"与"服务端肯接受的"就不会分叉。
 *
 * 与其它选项列表不同，这里的 `value` 本身就是展示文本（`Art` / `Coffee`），
 * 不走 `profileForm.*` 的 i18n 键 —— 迁移前的行为就是如此，且种子会员的
 * `profiles.interests` 里已经存着这些英文词。给它补三语标签会让存量数据
 * 变成认不出的旧值，收益不抵风险，留给后续做兴趣字典时一并处理。
 */
export const INTERESTS = [
  "Art",
  "Coffee",
  "Hiking",
  "Film",
  "Jazz",
  "Travel",
  "Cooking",
  "Photography",
  "Reading",
  "Fitness",
] as const;

export type Interest = (typeof INTERESTS)[number];

/**
 * 兴趣标签的选项形状。
 *
 * `labelKey` 与 `value` 相同，且调用方传的 `labelOf` 是恒等函数
 * （`profile-editor.tsx` 里传 `(key) => key`）—— 刻意不经过 i18n：
 * 见 `INTERESTS` 的说明，值本身就是展示文本。写成 `Option` 形状只是为了让
 * `ChipPicker` 这个泛型控件能统一处理它。
 */
export const INTEREST_OPTIONS: Option<string>[] = INTERESTS.map((value) => ({
  value,
  labelKey: value,
}));

/**
 * Height slider bounds, centimetres.
 *
 * 收紧到 140–210 而不是数据库允许的 120–250：滑块的每一格都要有实际人选，
 * 超出常识的区间只会让滑块变成"怎么滑都不对"。数据库那一侧留宽，
 * 是为了将来接入体检测量之类的数据源时不至于被约束挡住。
 */
export const HEIGHT_CM_MIN = 140;
export const HEIGHT_CM_MAX = 210;

/**
 * Weight slider bounds, kilograms.
 *
 * 步长 1kg（见 SLIDER_STEP）—— 体重填到小数没有意义，
 * 而 0.5 的步长会让滑块的可选格数翻倍，拖动时要更久才到位。
 */
export const WEIGHT_KG_MIN = 35;
export const WEIGHT_KG_MAX = 150;

/** 所有滑动条的步长。 */
export const SLIDER_STEP = 1;

/**
 * 服务端接受的身高／体重区间，与数据库 check 约束一一对应：
 *   * `height_cm`  → 0001_core.sql `between 120 and 250`
 *   * `weight_kg`  → 0007_profile_extras.sql `between 25 and 250`
 *
 * 刻意**比滑块界面对宽**。滑块的 140–210 是"每一格都要有实际人选"的
 * 产品判断，而这一组是"明显不是人体数据就丢掉"的数据边界。
 * 两者混用会把产品判断变成硬约束：想放宽滑块就得改表结构。
 */
export const HEIGHT_CM_DB_MIN = 120;
export const HEIGHT_CM_DB_MAX = 250;
export const WEIGHT_KG_DB_MIN = 25;
export const WEIGHT_KG_DB_MAX = 250;

/**
 * 「完善个人资料」最多保存几张照片。
 *
 * 产品约束，与数据库无关（`profiles.photo_urls` 是 text[]，没有长度限制）。
 * 定 6 是因为目录卡片最多展示 6 张，传更多也不会有第二处能看到。
 */
export const PROFILE_PHOTO_MAX = 6;

/**
 * 兴趣标签最多选几个。
 *
 * 放在这里而不是 `lib/profile/actions.ts`：那个模块带 `"use server"`，
 * 只能导出 async 函数，导出一个数字常量会让构建失败。
 */
export const PROFILE_INTEREST_MAX = 12;

/** Age bounds offered by the preference form. */
export const AGE_MIN = 18;
export const AGE_MAX = 80;

/* -------------------------------------------------------------------------- */
/* P3 — premium conditions                                                     */
/* -------------------------------------------------------------------------- */

/** Fields of `PartnerPreferences` that P3 unlocks behind a level. */
export const PREMIUM_PREFERENCE_KEYS = [
  "education",
  "languages",
  "religions",
  "noTattoo",
  "children",
  "assetMin",
  "cities",
] as const;

export type PremiumPreferenceKey = (typeof PREMIUM_PREFERENCE_KEYS)[number];

/**
 * Level required to use each premium condition. P6 keeps this configurable
 * in the admin console; L4 is exempt from every fee.
 */
export const PREMIUM_PREFERENCE_MIN_LEVEL: Record<
  PremiumPreferenceKey,
  UserLevel
> = {
  education: 3,
  languages: 3,
  religions: 3,
  noTattoo: 3,
  children: 3,
  assetMin: 3,
  cities: 3,
};

export const PREMIUM_LEVEL_EXEMPT: UserLevel = 4;

export function isPremiumUnlocked(
  key: PremiumPreferenceKey,
  level: UserLevel,
): boolean {
  return level >= PREMIUM_PREFERENCE_MIN_LEVEL[key];
}

/** True when every premium condition is available to this level. */
export function hasFullPremiumAccess(level: UserLevel): boolean {
  return PREMIUM_PREFERENCE_KEYS.every((key) => isPremiumUnlocked(key, level));
}

/* -------------------------------------------------------------------------- */
/* P4 — individually charged conditions                                        */
/* -------------------------------------------------------------------------- */

/**
 * The demo price list. A real deployment maps condition → fee per country and
 * currency in the admin console (P6); L4 members get them included.
 */
export const EXCLUSIVE_CONDITION_DEFS: ExclusiveConditionDefinition[] = [
  {
    code: "assetThreshold",
    priceUsd: 99,
    levelExempt: 4,
    sensitive: false,
    blockedCountryCodes: [],
  },
  {
    code: "exactRange",
    priceUsd: 59,
    levelExempt: 4,
    sensitive: false,
    blockedCountryCodes: [],
  },
  {
    code: "regionOnly",
    priceUsd: 49,
    levelExempt: 4,
    sensitive: false,
    blockedCountryCodes: [],
  },
  {
    // P4's most sensitive example. P7 requires a region kill switch, so it is
    // off by default and the UI must show a compliance notice before use.
    code: "virginity",
    priceUsd: 199,
    levelExempt: 4,
    sensitive: true,
    blockedCountryCodes: ["DE", "FR", "GB"],
  },
];

export const EXCLUSIVE_CONDITION_COUNT = EXCLUSIVE_CONDITIONS.length;

const EXCLUSIVE_BY_CODE = new Map(
  EXCLUSIVE_CONDITION_DEFS.map((definition) => [definition.code, definition]),
);

export function getExclusiveCondition(
  code: ExclusiveConditionCode,
): ExclusiveConditionDefinition | undefined {
  return EXCLUSIVE_BY_CODE.get(code);
}

export function exclusivePrice(
  code: ExclusiveConditionCode,
  level: UserLevel,
): number {
  const definition = getExclusiveCondition(code);
  if (!definition || level >= definition.levelExempt) {
    return 0;
  }
  return definition.priceUsd;
}

/**
 * P7 — whether a condition may be offered at all in the member's country.
 * Members outside the restricted list never see the option.
 */
export function isExclusiveConditionAvailable(
  code: ExclusiveConditionCode,
  countryCode: string,
): boolean {
  const definition = getExclusiveCondition(code);
  if (!definition) {
    return false;
  }
  return !definition.blockedCountryCodes.includes(countryCode);
}

/** Total of the individually charged conditions, for the cart summary (P4). */
export function exclusiveTotal(
  codes: ExclusiveConditionCode[],
  level: UserLevel,
): number {
  return codes.reduce((total, code) => total + exclusivePrice(code, level), 0);
}

/* -------------------------------------------------------------------------- */
/* Completeness                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fields counted by the completeness meter. `languages` and `interests` need
 * at least one entry; text fields need a non-empty trimmed string.
 *
 * 居住国家/城市仍然计入：它们虽然改由注册第一步（`saveProfileBasics`）写入
 * `profiles`，但仍是这份资料的一部分，也是会员自己能看到、能改的字段。
 * 兴趣与自我介绍同理 —— 位置从第一步挪到了第二步，计分口径不变。
 */
export function profileCompletion(profile: PersonalProfile): {
  filled: number;
  total: number;
  percent: number;
} {
  const checks = [
    profile.heightCm !== null,
    profile.weightKg !== null,
    profile.education !== null,
    profile.languages.length > 0,
    profile.religion !== null,
    profile.tattoo !== null,
    profile.smoking !== null,
    profile.drinking !== null,
    profile.assetRange !== null,
    profile.children !== null,
    profile.maritalStatus !== null,
    profile.occupation.trim().length > 0,
    profile.countryCode.length > 0,
    profile.city.trim().length > 0,
    profile.interests.length > 0,
    profile.bio.trim().length > 0,
  ];

  const filled = checks.filter(Boolean).length;
  const total = checks.length;

  return { filled, total, percent: Math.round((filled / total) * 100) };
}

/** True once every P1 attribute has a value. */
export function isProfileComplete(profile: PersonalProfile): boolean {
  return profileCompletion(profile).percent === 100;
}

/** True when the member has set at least one partner condition. */
export function hasPreferences(preferences: PartnerPreferences): boolean {
  return (
    preferences.ageMin !== null ||
    preferences.ageMax !== null ||
    preferences.heightMin !== null ||
    preferences.heightMax !== null ||
    preferences.education.length > 0 ||
    preferences.languages.length > 0 ||
    preferences.religions.length > 0 ||
    preferences.noTattoo ||
    preferences.children.length > 0 ||
    preferences.assetMin !== null ||
    preferences.countries.length > 0 ||
    preferences.cities.length > 0 ||
    preferences.smoking !== null ||
    preferences.drinking !== null ||
    preferences.exclusive.length > 0
  );
}
