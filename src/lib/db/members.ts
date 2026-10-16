import "server-only";

import type { AuthChannel } from "@/lib/auth/channels";
import { query, queryOne, transaction } from "@/lib/db/pool";
import { emptyPreferences, emptyProfile } from "@/lib/profile-defaults";
import type {
  PartnerPreferences,
  PersonalProfile,
  ProfileBasics,
} from "@/types/profile";
import type {
  Gender,
  KycStatus,
  PublicUser,
  Subscription,
  UserLevel,
} from "@/types/user";
import type { VerificationTag } from "@/types/verification";

/**
 * 会员读取：把 `profiles` 与其卫星表（属性 / 条件 / 徽章 / 订阅）拼成一个
 * `PublicUser`，形状与原先 `lib/mock-data` 的 `currentUser` / `catalogUsers` 完全一致，
 * 因此调用点只需换 import 来源，不需要改渲染逻辑。
 *
 * 为什么用一条带 left join 的 SQL 而不是分几次查：目录页一次要渲染十几张卡片，
 * N+1 查询在本地库上看不出问题，上了远程库就是肉眼可见的卡顿。
 */

type MemberRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  gender: string | null;
  age: number | null;
  city: string | null;
  country_code: string | null;
  bio: string | null;
  interests: string[];
  photo_urls: string[];
  level: number;
  kyc_status: string;
  is_online: boolean;
  last_active_at: Date | null;
  height_cm: number | null;
  weight_kg: number | null;
  education: string | null;
  languages: string[] | null;
  religion: string | null;
  tattoo: string | null;
  smoking: string | null;
  drinking: string | null;
  asset_range: string | null;
  children: string | null;
  marital_status: string | null;
  occupation: string | null;
  pref_age_min: number | null;
  pref_age_max: number | null;
  pref_height_min: number | null;
  pref_height_max: number | null;
  pref_education: string[] | null;
  pref_languages: string[] | null;
  pref_religions: string[] | null;
  pref_no_tattoo: boolean | null;
  pref_children: string[] | null;
  pref_asset_min: string | null;
  pref_countries: string[] | null;
  pref_cities: string[] | null;
  pref_smoking: string | null;
  pref_drinking: string | null;
  pref_exclusive: string[] | null;
  sub_status: string | null;
  sub_level: number | null;
  sub_started_at: Date | null;
  sub_expires_at: Date | null;
  sub_is_trial: boolean | null;
  sub_scheduled_level: number | null;
  badges: VerificationTag[] | null;
};

const MEMBER_COLUMNS = `
  p.id,
  p.handle,
  p.display_name,
  p.avatar_url,
  p.gender,
  case when p.birth_date is null then null
       else date_part('year', age(p.birth_date))::int end as age,
  p.city,
  p.country_code,
  p.bio,
  p.interests,
  p.photo_urls,
  p.level,
  p.kyc_status,
  p.is_online,
  p.last_active_at,
  a.height_cm,
  a.weight_kg,
  a.education,
  a.languages,
  a.religion,
  a.tattoo,
  a.smoking,
  a.drinking,
  a.asset_range,
  a.children,
  a.marital_status,
  a.occupation,
  pr.age_min    as pref_age_min,
  pr.age_max    as pref_age_max,
  pr.height_min as pref_height_min,
  pr.height_max as pref_height_max,
  pr.education  as pref_education,
  pr.languages  as pref_languages,
  pr.religions  as pref_religions,
  pr.no_tattoo  as pref_no_tattoo,
  pr.children   as pref_children,
  pr.asset_min  as pref_asset_min,
  pr.countries  as pref_countries,
  pr.cities     as pref_cities,
  pr.smoking    as pref_smoking,
  pr.drinking   as pref_drinking,
  pr.exclusive  as pref_exclusive,
  s.status          as sub_status,
  s.level           as sub_level,
  s.started_at      as sub_started_at,
  s.expires_at      as sub_expires_at,
  s.is_trial        as sub_is_trial,
  s.scheduled_level as sub_scheduled_level,
  b.badges
`;

const MEMBER_FROM = `
  from public.profiles p
  left join public.profile_attributes  a  on a.profile_id = p.id
  left join public.partner_preferences pr on pr.profile_id = p.id
  left join public.subscriptions s
         on s.profile_id = p.id and s.status in ('trialing', 'active')
  left join lateral (
    select json_agg(
             json_build_object(
               'code', vb.code,
               'status', vb.status,
               'verifiedAt', vb.verified_at,
               'expiresAt', vb.expires_at
             )
             order by vb.code
           ) as badges
      from public.verification_badges vb
     where vb.profile_id = p.id
  ) b on true
`;

function toSubscription(row: MemberRow): Subscription {
  if (!row.sub_status) {
    return {
      status: "none",
      level: null,
      startedAt: null,
      expiresAt: null,
      isTrial: false,
      scheduledLevel: null,
    };
  }

  return {
    status: row.sub_status as Subscription["status"],
    level: (row.sub_level as UserLevel | null) ?? null,
    startedAt: row.sub_started_at?.toISOString() ?? null,
    expiresAt: row.sub_expires_at?.toISOString() ?? null,
    isTrial: row.sub_is_trial ?? false,
    scheduledLevel: (row.sub_scheduled_level as UserLevel | null) ?? null,
  };
}

function toProfile(row: MemberRow): PersonalProfile {
  return {
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    education: (row.education as PersonalProfile["education"]) ?? null,
    languages: (row.languages as PersonalProfile["languages"]) ?? [],
    religion: (row.religion as PersonalProfile["religion"]) ?? null,
    tattoo: (row.tattoo as PersonalProfile["tattoo"]) ?? null,
    smoking: (row.smoking as PersonalProfile["smoking"]) ?? null,
    drinking: (row.drinking as PersonalProfile["drinking"]) ?? null,
    assetRange: (row.asset_range as PersonalProfile["assetRange"]) ?? null,
    children: (row.children as PersonalProfile["children"]) ?? null,
    maritalStatus:
      (row.marital_status as PersonalProfile["maritalStatus"]) ?? null,
    occupation: row.occupation ?? "",
    interests: row.interests ?? [],
    bio: row.bio ?? "",
    /*
      居住地只有**一个**来源：`profiles`。

      原先这里是 `row.attr_country_code ?? row.country_code ?? ""`，
      即"属性表优先、主表兜底"。那是个隐患：属性表的列是
      `not null default ''`，一旦会员保存过第二步而没填居住地，
      属性表里躺的是空串 —— 空串不是 null，`??` 不会回退，
      于是主表里填好的居住地被一个空串盖掉。
      现在两列都只认主表（属性表的同名列已由 0008 迁移删除）。
    */
    countryCode: row.country_code ?? "",
    city: row.city ?? "",
  };
}

function toPreferences(row: MemberRow): PartnerPreferences | undefined {
  // 没有任何条件行时不返回对象：与原型一致（目录里的会员没有 preferences）。
  if (
    row.pref_age_min === null &&
    row.pref_age_max === null &&
    !row.pref_no_tattoo
  ) {
    return undefined;
  }

  return {
    ...emptyPreferences,
    ageMin: row.pref_age_min,
    ageMax: row.pref_age_max,
    heightMin: row.pref_height_min,
    heightMax: row.pref_height_max,
    education: (row.pref_education as PartnerPreferences["education"]) ?? [],
    languages: (row.pref_languages as PartnerPreferences["languages"]) ?? [],
    religions: (row.pref_religions as PartnerPreferences["religions"]) ?? [],
    noTattoo: row.pref_no_tattoo ?? false,
    children: (row.pref_children as PartnerPreferences["children"]) ?? [],
    assetMin: (row.pref_asset_min as PartnerPreferences["assetMin"]) ?? null,
    countries: row.pref_countries ?? [],
    cities: row.pref_cities ?? [],
    smoking: (row.pref_smoking as PartnerPreferences["smoking"]) ?? null,
    drinking: (row.pref_drinking as PartnerPreferences["drinking"]) ?? null,
    exclusive: (row.pref_exclusive as PartnerPreferences["exclusive"]) ?? [],
  };
}

export function toPublicUser(row: MemberRow): PublicUser {
  return {
    id: row.id,
    name: row.display_name,
    // 数据库允许 gender 为空（存档型账号），但 PublicUser 要求有值。
    gender: (row.gender as Gender | null) ?? "female",
    age: row.age ?? 0,
    city: row.city ?? "",
    countryCode: row.country_code ?? "",
    avatarUrl: row.avatar_url ?? "",
    photoUrls: row.photo_urls ?? [],
    bio: row.bio ?? "",
    interests: row.interests ?? [],
    level: row.level as UserLevel,
    kycStatus: row.kyc_status as KycStatus,
    verifications: row.badges ?? [],
    profile: toProfile(row),
    preferences: toPreferences(row),
    isOnline: row.is_online,
    lastActiveAt: row.last_active_at?.toISOString() ?? new Date().toISOString(),
    subscription: toSubscription(row),
  };
}

/* ─────────────────────────────── 读取接口 ─────────────────────────────── */

/**
 * 目录会员：只取普通会员。
 *
 * `kind = 'member'` 是 B2C 的产品约束落地——机构账号与推荐位存根永远不进目录，
 * 所以"主站界面不得出现代理机构"这条不靠组件自觉，而是查询层面就取不到。
 */
export async function listCatalogMembers(): Promise<PublicUser[]> {
  const rows = await query<MemberRow>(
    `select ${MEMBER_COLUMNS} ${MEMBER_FROM}
      where p.kind = 'member' and p.handle <> 'u_current'
      order by p.handle`,
  );

  return rows.map(toPublicUser);
}

/** 按 uuid 或 handle 查会员（`findUser(id)` 的替代：两种 id 都能接受）。 */
export async function getMember(
  idOrHandle: string,
): Promise<PublicUser | null> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrHandle,
    );

  const row = await queryOne<MemberRow>(
    `select ${MEMBER_COLUMNS} ${MEMBER_FROM}
      where ${isUuid ? "p.id = $1" : "p.handle = $1"}`,
    [idOrHandle],
  );

  return row ? toPublicUser(row) : null;
}

/** 仅取 profile id（会话、拉黑、举报等写操作只需要 id）。 */
export async function getProfileIdByHandle(
  handle: string,
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    "select id from public.profiles where handle = $1",
    [handle],
  );

  return row?.id ?? null;
}

/**
 * 未登录时的展示身份。
 *
 * 原型允许"不注册也能逛"，并把 `u_current` 当作浏览者；切到真实库后保留这一行为，
 * 但它是**只读展示**身份 —— 任何写操作仍然要求真实会话（见 lib/auth/session.ts）。
 */
export async function getDefaultViewer(): Promise<PublicUser | null> {
  return getMember("u_current");
}

/**
 * 登录标识 → 会员（注册后的每次请求都要走这里解析身份）。
 *
 * 分两步查而不是把 `users` 塞进 `MEMBER_FROM` 的 join 链：
 * 那条链已经挂了属性、条件、订阅、徽章四张卫星表，
 * 再插一个 join 会让"哪个 join 属于哪条查询"变得难以理清；
 * 且这条路径每个请求最多走一次，多一条索引查找不值一提。
 */
export async function getMemberByIdentifier(
  channel: AuthChannel,
  value: string,
): Promise<PublicUser | null> {
  const row = await queryOne<{ id: string }>(
    `select p.id from public.profiles p
       join public.users u on u.id = p.user_id
      where ${channel === "sms" ? "u.phone = $1" : "u.email = $1"}`,
    [value],
  );

  return row ? getMember(row.id) : null;
}

/* ─────────────────────────────── 写入接口 ─────────────────────────────── */

/**
 * 保存 P1 扩展属性。
 *
 * 两张表、一个事务
 * ---------------
 * 属性本体（身高、学历、语言……）在 `profile_attributes`，
 * 而**兴趣与自我介绍在 `profiles`** —— 这两列是主表上的展示字段，
 * 目录卡片要读，不能搬走。一次提交要写两处，所以必须同进同退：
 * 否则一次失败会留下"身高存了、自我介绍没存"的半截资料，
 * 而用户看到的是一句笼统的错误，根本不知道哪一半生效了。
 *
 * 为什么不再写 `country_code` / `city`
 * ----------------------------------
 * 居住地现在只有 `profiles` 一个来源（由注册第一步写入，见 `saveProfileBasics`）。
 * 属性表里原先那两列已经没有任何读者，留下只会再次引发
 * "两列谁说话"的歧义 —— 旧的 `??` 回退就因此把主表里填好的居住地
 * 用一个空串盖掉过。那两列已由 `0008_attributes_move.sql` 删除。
 */
export async function saveProfileAttributes(
  profileId: string,
  attributes: PersonalProfile,
): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `insert into public.profile_attributes
         (profile_id, height_cm, weight_kg, education, languages, religion, tattoo, smoking, drinking,
          asset_range, children, marital_status, occupation)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (profile_id) do update
         set height_cm = excluded.height_cm,
             weight_kg = excluded.weight_kg,
             education = excluded.education,
             languages = excluded.languages,
             religion = excluded.religion,
             tattoo = excluded.tattoo,
             smoking = excluded.smoking,
             drinking = excluded.drinking,
             asset_range = excluded.asset_range,
             children = excluded.children,
             marital_status = excluded.marital_status,
             occupation = excluded.occupation,
             updated_at = now()`,
      [
        profileId,
        attributes.heightCm,
        attributes.weightKg,
        attributes.education,
        attributes.languages,
        attributes.religion,
        attributes.tattoo,
        attributes.smoking,
        attributes.drinking,
        attributes.assetRange,
        attributes.children,
        attributes.maritalStatus,
        attributes.occupation,
      ],
    );

    await client.query(
      `update public.profiles
          set interests  = $2,
              bio        = $3,
              updated_at = now()
        where id = $1`,
      [profileId, attributes.interests, attributes.bio],
    );
  });
}

/**
 * 「完善个人资料」第一步要写的字段。
 *
 * 形状定义在 `types/profile.ts`（客户端表单也要用它做 props 类型，
 * 而本模块带 `server-only`）；这里只做再导出，让调用点统一从数据层取。
 */
export type { ProfileBasics };

/**
 * 读取档案基础信息，用于回填表单。
 *
 * `birth_date` 用 `to_char` 转成字符串再返回，而不是让驱动把 `date` 解析成
 * JS `Date`：驱动按**本地时区**把日期放到当天零点，再用 `toISOString()`
 * 取出来，东八区会整体往前退一天 —— 用户的生日会莫名其妙少一天。
 * 让数据库直接给出 `yyyy-mm-dd` 文本，这类时区陷阱就彻底不存在了。
 */
export async function getProfileBasics(
  profileId: string,
): Promise<ProfileBasics | null> {
  const row = await queryOne<{
    display_name: string;
    gender: string | null;
    birth_date: string | null;
    country_code: string | null;
    city: string | null;
    photo_urls: string[];
    avatar_url: string | null;
  }>(
    `select display_name,
            gender,
            to_char(birth_date, 'YYYY-MM-DD') as birth_date,
            country_code,
            city,
            photo_urls,
            avatar_url
       from public.profiles
      where id = $1`,
    [profileId],
  );

  if (!row) {
    return null;
  }

  return {
    displayName: row.display_name,
    gender: (row.gender as Gender | null) ?? null,
    birthDate: row.birth_date,
    countryCode: row.country_code ?? "",
    city: row.city ?? "",
    photoUrls: row.photo_urls ?? [],
    avatarUrl: row.avatar_url,
  };
}

/**
 * 档案基础信息（O 模块「完善个人资料」的第一步）。
 *
 * 与 `profile_attributes` 分开写，是因为它们本来就住在两张表里：
 * 这里改的是 `profiles` 上的展示字段，而身高/学历那些在卫星表。
 * 合成一个函数会让"只改了真实姓名"也要把十几个属性整体重写一遍。
 *
 * 只更新、不插入：能走到这一步的前提是注册时已经建好了 profiles 行，
 * 而这里拿到的 profileId 正是那一行。
 *
 * 兴趣与自我介绍**不在这里**：它们已经挪到第二步（`saveProfileAttributes`）。
 * 这个函数若还写这两列，第一步的提交就会把会员在第二步填的内容清空 ——
 * 因为第一步的表单里已经没有这两个字段，`formData` 里取到的只会是空。
 */
export async function saveProfileBasics(
  profileId: string,
  basics: ProfileBasics,
): Promise<void> {
  await query(
    `update public.profiles
        set display_name = $2,
            gender       = $3,
            birth_date   = $4,
            country_code = $5,
            city         = $6,
            photo_urls   = $7,
            -- 为空时保留原头像：可能出现"只改了自我介绍、没传照片"的调用，
            -- 那时把头像一并清掉是调用方没有表达的意图。
            avatar_url   = coalesce($8, avatar_url),
            updated_at   = now()
      where id = $1`,
    [
      profileId,
      basics.displayName,
      basics.gender,
      basics.birthDate,
      basics.countryCode,
      basics.city,
      basics.photoUrls,
      basics.avatarUrl,
    ],
  );
}

/** 保存征友条件（P1–P4）。 */
export async function savePartnerPreferences(
  profileId: string,
  preferences: PartnerPreferences,
): Promise<void> {
  await query(
    `insert into public.partner_preferences
       (profile_id, age_min, age_max, height_min, height_max, education, languages, religions,
        no_tattoo, children, asset_min, countries, cities, smoking, drinking, exclusive)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict (profile_id) do update
       set age_min = excluded.age_min,
           age_max = excluded.age_max,
           height_min = excluded.height_min,
           height_max = excluded.height_max,
           education = excluded.education,
           languages = excluded.languages,
           religions = excluded.religions,
           no_tattoo = excluded.no_tattoo,
           children = excluded.children,
           asset_min = excluded.asset_min,
           countries = excluded.countries,
           cities = excluded.cities,
           smoking = excluded.smoking,
           drinking = excluded.drinking,
           exclusive = excluded.exclusive,
           updated_at = now()`,
    [
      profileId,
      preferences.ageMin,
      preferences.ageMax,
      preferences.heightMin,
      preferences.heightMax,
      preferences.education,
      preferences.languages,
      preferences.religions,
      preferences.noTattoo,
      preferences.children,
      preferences.assetMin,
      preferences.countries,
      preferences.cities,
      preferences.smoking,
      preferences.drinking,
      preferences.exclusive,
    ],
  );
}

export { emptyPreferences, emptyProfile };
