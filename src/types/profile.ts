import type { Gender, UserLevel } from "@/types/user";

/**
 * Module P — extended member attributes and partner preferences.
 *
 * Two halves:
 *   `PersonalProfile`    → the extra attributes a member fills in on
 *                          「完善个人信息」 (P1 field list).
 *   `PartnerPreferences` → the conditions a member puts on the person they
 *                          want to meet (P1–P4), split into free, premium
 *                          (level-gated) and individually charged conditions.
 */

export const EDUCATION_LEVELS = [
  "highschool",
  "college",
  "bachelor",
  "master",
  "doctorate",
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const LANGUAGE_CODES = [
  "zh",
  "en",
  "ru",
  "es",
  "fr",
  "de",
  "ar",
  "ja",
  "ko",
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const RELIGIONS = [
  "none",
  "christian",
  "catholic",
  "muslim",
  "buddhist",
  "hindu",
  "jewish",
  "other",
] as const;

export type Religion = (typeof RELIGIONS)[number];

/** Tattoo coverage, from clean skin to openly visible work. */
export const TATTOO_LEVELS = ["none", "small", "visible"] as const;

export type TattooLevel = (typeof TATTOO_LEVELS)[number];

/** Shared by smoking and drinking habits. */
export const FREQUENCIES = ["never", "socially", "regularly"] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const ASSET_RANGES = [
  "under100k",
  "100k_500k",
  "500k_1m",
  "1m_5m",
  "above5m",
] as const;

export type AssetRange = (typeof ASSET_RANGES)[number];

/** Childbearing intention (生育意愿). */
export const CHILDREN_STATUSES = [
  "no",
  "want",
  "have",
  "have_want",
  "undecided",
] as const;

export type ChildrenStatus = (typeof CHILDREN_STATUSES)[number];

export const MARITAL_STATUSES = [
  "single",
  "divorced",
  "widowed",
  "separated",
] as const;

export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

/**
 * 「完善个人资料」这一步要写的字段（O 模块第一步）。
 *
 * 单独成型而不是复用 `PublicUser`：`PublicUser` 是**面向展示**的形状
 * （带 age、订阅、徽章等派生成分），而这里要的是可回填、可提交的原始值。
 * 混用会让表单在提交时把 age、level 这些不该由客户端决定的字段一并回传。
 *
 * 放在 `types/` 而不是数据层，是因为它同时被客户端表单（props 形状）
 * 与服务端数据层引用，而数据层带 `server-only`，不能被客户端 import。
 *
 * 2026-10-16 调整：兴趣标签与自我介绍**移出**本类型，改由 `PersonalProfile`
 * （注册第二步「个人属性」）承载；同时**加入** `countryCode` ——
 * 居住地现在是"国家 → 城市"两级，国家必须和城市一起被提交。
 * 两个值的列都在 `profiles` 上，因此这一步仍然只写一张表。
 */
export interface ProfileBasics {
  /**
   * 真实姓名。
   *
   * 原先这里是「昵称」，现在按真实姓名采集（校验见 `lib/profile/name.ts`）。
   * 仍然存在 `profiles.display_name` 列：这一列是全站**唯一**的名字来源
   * （目录卡片、会员详情、聊天气泡都读它），再开一列 `real_name` 会让
   * 同一个人的名字有两份、且迟早不一致。法定姓名另有归属 ——
   * 实名认证步骤（`/onboarding/kyc`）单独采集，用于证件比对。
   */
  displayName: string;
  gender: Gender | null;
  /** `yyyy-mm-dd`；未填为 null。 */
  birthDate: string | null;
  /** 居住国家，`COUNTRY_CODES` 之一；未填为 `""`。 */
  countryCode: string;
  /** 居住城市。取自 `COUNTRY_CITIES[countryCode]`，拉丁专名（如 `Shanghai`）。 */
  city: string;
  photoUrls: string[];
  /**
   * 头像。通常就是 `photoUrls[0]` —— 目录卡片与聊天气泡只读这一列，
   * 不同步的话会员传了一堆照片，卡片上仍然是空白的。
   */
  avatarUrl: string | null;
}

/**
 * P1 — the attribute set behind 「完善个人信息」.
 *
 * Every field is nullable: members fill these in over time, and the profile
 * completeness meter counts what is set.
 *
 * `countryCode` / `city` 在这里是**只读回显**性质的：列在 `profiles` 上，
 * 由注册第一步写入（`saveProfileBasics`）。保留在类型里是因为
 * 「详细资料」要展示、择偶条件的地区开关要读；但 `saveProfileAttributes`
 * 不再写它们（见 `lib/db/members.ts` 的说明）。
 */
export interface PersonalProfile {
  /** Centimetres. */
  heightCm: number | null;
  /** Kilograms. */
  weightKg: number | null;
  education: EducationLevel | null;
  /** Spoken languages; multi-select. */
  languages: LanguageCode[];
  religion: Religion | null;
  tattoo: TattooLevel | null;
  smoking: Frequency | null;
  drinking: Frequency | null;
  /** Declared asset bracket — verified separately by the asset badge (R1). */
  assetRange: AssetRange | null;
  children: ChildrenStatus | null;
  maritalStatus: MaritalStatus | null;
  occupation: string;
  /**
   * 兴趣标签。取自 `INTERESTS` 词表，值本身即展示文本。
   *
   * 2026-10-16 从注册第一步挪到这里：它属于"个人属性"而不是"基本资料"，
   * 且与身高学历等一样是**可增改**的属性，而不是注册时一次定死的身份项。
   */
  interests: string[];
  /** 自我介绍，最多 500 字。同样从第一步挪来。 */
  bio: string;
  /** Residence, distinct from the passport country in `PublicUser`. */
  countryCode: string;
  city: string;
}

/**
 * P1–P4 — partner conditions.
 *
 * `countries` / `cities` come from P1's 居住国家、居住城市; the boolean
 * `noTattoo` covers "指定无纹身" from P3.
 */
export interface PartnerPreferences {
  ageMin: number | null;
  ageMax: number | null;
  heightMin: number | null;
  heightMax: number | null;
  /** P3 premium. */
  education: EducationLevel[];
  /** P3 premium. */
  languages: LanguageCode[];
  /** P3 premium. */
  religions: Religion[];
  /** P3 premium — "指定无纹身". */
  noTattoo: boolean;
  /** P3 premium. */
  children: ChildrenStatus[];
  /** P3 premium — minimum asset bracket the partner must clear. */
  assetMin: AssetRange | null;
  /** Free filter. */
  countries: string[];
  /** P3 premium — narrowing to specific cities. */
  cities: string[];
  smoking: Frequency | null;
  drinking: Frequency | null;
  /** P4 — codes of the individually charged conditions that are switched on. */
  exclusive: ExclusiveConditionCode[];
}

/** P4 — conditions billed one by one rather than unlocked by level. */
export const EXCLUSIVE_CONDITIONS = [
  "assetThreshold",
  "exactRange",
  "regionOnly",
  "virginity",
] as const;

export type ExclusiveConditionCode = (typeof EXCLUSIVE_CONDITIONS)[number];

export interface ExclusiveConditionDefinition {
  code: ExclusiveConditionCode;
  /** Price in USD; backend-configurable per country/currency (P6). */
  priceUsd: number;
  /** Level that waives the fee entirely (P6 — L4 private clients). */
  levelExempt: UserLevel;
  /**
   * P7 — sensitive conditions must respect a per-region kill switch and are
   * hidden or disabled where local law forbids them.
   */
  sensitive: boolean;
  /** Regions where the condition must not be offered at all. */
  blockedCountryCodes: string[];
}
