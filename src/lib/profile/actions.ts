"use server";

import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { saveProfileAttributes, saveProfileBasics } from "@/lib/db/members";
import { getViewerProfile } from "@/lib/db/viewer";
import { isKnownCity, isKnownCountry } from "@/lib/geo";
import {
  ageFromIsoDate,
  PROFILE_AGE_MAX,
  PROFILE_AGE_MIN,
} from "@/lib/profile/age";
import {
  checkRealName,
  normalizeRealName,
  type RealNameProblem,
} from "@/lib/profile/name";
import {
  HEIGHT_CM_DB_MAX,
  HEIGHT_CM_DB_MIN,
  INTERESTS,
  PROFILE_INTEREST_MAX,
  PROFILE_PHOTO_MAX,
  WEIGHT_KG_DB_MAX,
  WEIGHT_KG_DB_MIN,
} from "@/lib/profile-options";
import {
  readChoice,
  readChoiceList,
  readInteger,
  readPhotoUrls,
  readText,
} from "@/lib/profile/form";
import {
  ASSET_RANGES,
  CHILDREN_STATUSES,
  EDUCATION_LEVELS,
  FREQUENCIES,
  LANGUAGE_CODES,
  MARITAL_STATUSES,
  RELIGIONS,
  TATTOO_LEVELS,
  type PersonalProfile,
} from "@/types/profile";
import type { Gender } from "@/types/user";

/**
 * 注册引导里两个会写库的步骤。
 *
 * 第一步「完善个人资料」→ `saveProfileBasicsAction`（写 `profiles`）
 * 第二步「个人属性」     → `saveProfileAttributesAction`（写
 *                          `profile_attributes` + `profiles` 的兴趣/自我介绍）
 *
 * 之前只有第一步是真的，第二步是个静态表单：填完点"继续"只是跳到下一页，
 * 一个字段都没落库。本轮把兴趣标签与自我介绍从第一步挪到第二步，
 * 这一步就**必须**真的会写 —— 否则挪过去的字段会直接丢掉。
 *
 * 这个文件带 `"use server"`，所以**只能导出 async 函数**。
 * 常量与纯函数因此住在别处：
 *   * `PROFILE_PHOTO_MAX` / `PROFILE_INTEREST_MAX` → `lib/profile-options.ts`
 *   * `ageFromIsoDate`                             → `lib/profile/age.ts`
 *   * `checkRealName` / `normalizeRealName`        → `lib/profile/name.ts`
 *   * `isKnownCountry` / `isKnownCity`             → `lib/geo.ts`
 * 这不是洁癖：`"use server"` 模块的每个导出都会被当成一个可被客户端
 * 远程调用的端点，导出一个常量会让构建直接失败。
 */

const MAX_BIO_LENGTH = 500;
const MAX_OCCUPATION_LENGTH = 60;

/** 与 `auth.errors.*` 同样的一一对应式错误键，落在 `onboarding.profile.errors.*` 下。 */
export type ProfileBasicsErrorKey =
  | "unauthorized"
  | RealNameProblem
  | "birthDateRequired"
  | "birthDateInvalid"
  | "birthDateRange"
  | "countryRequired"
  | "cityRequired"
  | "photosRequired"
  | "photoInvalid"
  | "unknown";

export interface ProfileBasicsState {
  error?: ProfileBasicsErrorKey;
}

/**
 * 写操作的身份判据，两步共用。
 *
 * 未登录时会回落到浏览态的种子账号 `u_current`，那种身份只能看不能写 ——
 * 否则任何人都能以展示会员的名义改掉它的资料。
 */
async function requireWritableViewer(): Promise<
  { ok: true; id: string } | { ok: false }
> {
  const viewer = await getViewerProfile();

  if (!viewer || viewer.handle === "u_current") {
    return { ok: false };
  }

  return { ok: true, id: viewer.id };
}

/* -------------------------------------------------------------------------- */
/* 第一步 — 完善个人资料                                                       */
/* -------------------------------------------------------------------------- */

export async function saveProfileBasicsAction(
  _prev: ProfileBasicsState,
  formData: FormData,
): Promise<ProfileBasicsState> {
  const viewer = await requireWritableViewer();

  if (!viewer.ok) {
    return { error: "unauthorized" };
  }

  const rawName = String(formData.get("name") ?? "");

  /*
    姓名校验交给纯函数（`lib/profile/name.ts`），客户端用的是同一个函数。
    `checkRealName` 内部会先做归一化，所以"从网页复制粘贴带上零宽字符"
    不会因为多了个看不见的字符而被判成非法；写库前再归一化一次，
    保证库里存的是规范形态（否则 `Li  Wei` 与 `Li Wei` 会变成两条记录）。
  */
  const nameProblem = checkRealName(rawName);

  if (nameProblem) {
    return { error: nameProblem };
  }

  const displayName = normalizeRealName(rawName);

  const rawGender = String(formData.get("gender") ?? "");
  const gender: Gender | null =
    rawGender === "male" || rawGender === "female" ? rawGender : null;

  const birthDate = String(formData.get("birthDate") ?? "").trim();

  if (birthDate === "") {
    return { error: "birthDateRequired" };
  }

  const age = ageFromIsoDate(birthDate);

  if (age === null) {
    return { error: "birthDateInvalid" };
  }

  if (age < PROFILE_AGE_MIN || age > PROFILE_AGE_MAX) {
    return { error: "birthDateRange" };
  }

  /*
    国家与城市必须成对且自洽。

    只校验"国家在列表里"是不够的：城市是自由文本形式的隐藏字段，
    任何人都能提交 `countryCode=GB&city=Shanghai`。这种组合一旦入库，
    按国家筛选会员时这条记录会以"在英国、城市上海"的形态出现，
    既错又难查。所以两者一起验，且城市必须属于所选国家。
  */
  const countryCode = String(formData.get("countryCode") ?? "").trim();

  if (!isKnownCountry(countryCode)) {
    return { error: "countryRequired" };
  }

  const city = String(formData.get("city") ?? "").trim();

  if (!isKnownCity(countryCode, city)) {
    return { error: "cityRequired" };
  }

  const { urls: photoUrls, invalid: photosInvalid } = readPhotoUrls(
    formData,
    "photoUrls",
    PROFILE_PHOTO_MAX,
  );

  if (photoUrls.length === 0) {
    return { error: "photosRequired" };
  }

  if (photosInvalid) {
    return { error: "photoInvalid" };
  }

  const locale = await getLocale();

  await saveProfileBasics(viewer.id, {
    displayName,
    gender,
    birthDate,
    countryCode,
    city,
    photoUrls,
    // 第一张即头像。目录卡片只读 `avatar_url`，不在这里同步的话，
    // 会员传了六张照片，卡片上仍然是空白的。
    avatarUrl: photoUrls[0],
  });

  return redirect({ href: "/onboarding/attributes", locale });
}

/* -------------------------------------------------------------------------- */
/* 第二步 — 个人属性                                                           */
/* -------------------------------------------------------------------------- */

export type ProfileAttributesErrorKey =
  "unauthorized" | "interestsTooMany" | "bioTooLong" | "unknown";

export interface ProfileAttributesState {
  error?: ProfileAttributesErrorKey;
}

/**
 * 保存个人属性。
 *
 * 与第一步的一处关键差异：这里**没有必填项**。
 * 身高体重、学历乃至兴趣都可以留空，用户可以分多次补齐 ——
 * 资料完整度是一个提示条，不是一道门。硬性必填只会让人在注册流程里
 * 被十几项属性拦下来，然后放弃。
 *
 * 另一个差异是**白名单**：所有枚举值都对着 `types/profile.ts` 里的字面量
 * 列表校验，不认识的值直接丢弃而不是原样入库。属性表里那些列是裸
 * `text`（没有 check 约束），若不在这里把住，任何人都能塞进任意字符串，
 * 而展示层拿到不认识的值会渲染成空白或 key 原文。
 */
export async function saveProfileAttributesAction(
  _prev: ProfileAttributesState,
  formData: FormData,
): Promise<ProfileAttributesState> {
  const viewer = await requireWritableViewer();

  if (!viewer.ok) {
    return { error: "unauthorized" };
  }

  const interests = readChoiceList(formData, "interests", INTERESTS);

  if (interests.length > PROFILE_INTEREST_MAX) {
    return { error: "interestsTooMany" };
  }

  const rawBio = String(formData.get("bio") ?? "").trim();

  if (rawBio.length > MAX_BIO_LENGTH) {
    return { error: "bioTooLong" };
  }

  const locale = await getLocale();

  const attributes: PersonalProfile = {
    heightCm: readInteger(
      formData,
      "heightCm",
      HEIGHT_CM_DB_MIN,
      HEIGHT_CM_DB_MAX,
    ),
    weightKg: readInteger(
      formData,
      "weightKg",
      WEIGHT_KG_DB_MIN,
      WEIGHT_KG_DB_MAX,
    ),
    education: readChoice(formData, "education", EDUCATION_LEVELS),
    languages: readChoiceList(formData, "languages", LANGUAGE_CODES),
    religion: readChoice(formData, "religion", RELIGIONS),
    tattoo: readChoice(formData, "tattoo", TATTOO_LEVELS),
    smoking: readChoice(formData, "smoking", FREQUENCIES),
    drinking: readChoice(formData, "drinking", FREQUENCIES),
    assetRange: readChoice(formData, "assetRange", ASSET_RANGES),
    children: readChoice(formData, "children", CHILDREN_STATUSES),
    maritalStatus: readChoice(formData, "maritalStatus", MARITAL_STATUSES),
    occupation: readText(formData, "occupation", MAX_OCCUPATION_LENGTH),
    interests,
    bio: rawBio,
    /*
      居住地在本步**不写**：列在 `profiles` 上，归注册第一步管。
      这两个值只用于满足类型，`saveProfileAttributes` 不会读它们。
    */
    countryCode: "",
    city: "",
  };

  await saveProfileAttributes(viewer.id, attributes);

  return redirect({ href: "/onboarding/partner", locale });
}
