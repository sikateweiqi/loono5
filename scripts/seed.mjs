/**
 * 开发种子：把原先写死在 `src/lib/mock-data.ts` / `src/lib/partner/mock-agents.ts`
 * 里的数据集灌进 PostgreSQL，让页面切到真实数据后观感与原型一致。
 *
 *   node scripts/seed.mjs            # 幂等 upsert，可反复执行
 *   node scripts/seed.mjs --reset    # 先清空业务表再灌（开发库专用）
 *
 * 幂等策略
 * --------
 * * 会员 / 代理商 / 活动 / 日流水：按自然键 upsert（handle、id、(partner_id, date)）
 * * 付款流水：**只追加**表，非 --reset 时若有数据就跳过（历史账不该被脚本改写）
 * * 订阅 / 出款：先删该会员的旧行再插，保证"当前状态"唯一
 *
 * 代理商日流水用与 mock 相同的确定性算法（mulberry32 + FNV 哈希）生成，
 * 所以每次跑出来的账本完全一样，趋势图不会跳。
 */
import pg from "pg";

import { databaseUrl } from "./load-env.mjs";

const args = new Set(process.argv.slice(2));
const shouldReset = args.has("--reset");

/* ───────────────────────────── 工具函数 ───────────────────────────── */

const AVATAR = (seed) => `https://images.unsplash.com/photo-${seed}?w=400&q=80`;

/** FNV-1a 字符串哈希，用来给每个代理的随机数发生器播种。 */
function hash(value) {
  let h = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

/** 确定性 PRNG：同一个种子永远给出同一串数。 */
function mulberry32(seed) {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (date) => date.toISOString().slice(0, 10);

function shiftDays(dateIso, days) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return iso(date);
}

const round2 = (value) => Math.round(value * 100) / 100;

/** 生日 → 年龄（避免把年龄存成死值）。 */
const bornYearsAgo = (years, month, day) => {
  const now = new Date();
  const year = now.getUTCFullYear() - years;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const today = iso(new Date());
const LEDGER_START = "2026-04-01";

/* ───────────────────────────── 数据定义 ───────────────────────────── */

/*
  徽章有效期：prd R5 由各徽章类型决定，这里统一按月给出近似值。
  `expired` 的徽章把到期时间放到过去，用来演示"已过期"样式。
*/
const BADGE_MONTHS = {
  realname: 24,
  education: 60,
  marriage: 12,
  asset: 12,
  criminal: 12,
  job: 24,
  income: 12,
  property: 24,
};

const VERIFIED_AT = "2026-06-01T00:00:00.000Z";

function badges(spec) {
  return Object.entries(spec).map(([code, status]) => {
    const passed = status === "approved" || status === "expired";
    const months = BADGE_MONTHS[code] ?? 12;
    const base = new Date(VERIFIED_AT);
    const expiry = new Date(base);
    expiry.setMonth(
      expiry.getMonth() + (status === "expired" ? -months : months),
    );

    return {
      code,
      status,
      verifiedAt: passed ? VERIFIED_AT : null,
      expiresAt: passed ? expiry.toISOString() : null,
    };
  });
}

const plans = [
  { level: 1, monthly: 30, yearly: 300, contact: false, order: 1 },
  { level: 2, monthly: 200, yearly: 2000, contact: false, order: 2 },
  { level: 3, monthly: 400, yearly: 4000, contact: false, order: 3 },
  { level: 4, monthly: null, yearly: null, contact: true, order: 4 },
];

/** 目录会员（原 catalogUsers + currentUser）。 */
const members = [
  {
    handle: "u_current",
    name: "Alex",
    gender: "male",
    birthDate: bornYearsAgo(29, 3, 14),
    city: "Shanghai",
    country: "CN",
    avatar: AVATAR("1500648767791-00dcc994a43e"),
    bio: "Coffee, climbing and slow travel.",
    interests: ["Climbing", "Coffee", "Photography"],
    level: 2,
    kyc: "approved",
    online: true,
    refCode: "ALEX60",
    login: { phone: "+8613800000000" },
    badges: badges({
      realname: "approved",
      education: "approved",
      job: "approved",
      income: "pending",
      marriage: "approved",
    }),
    attributes: {
      heightCm: 182,
      weightKg: 78,
      education: "master",
      languages: ["zh", "en", "ru"],
      religion: "none",
      tattoo: "none",
      smoking: "never",
      drinking: "socially",
      assetRange: "500k_1m",
      children: "want",
      maritalStatus: "single",
      occupation: "Product designer",
    },
    preferences: {
      ageMin: 24,
      ageMax: 34,
      heightMin: 158,
      heightMax: 176,
      education: ["bachelor", "master"],
      languages: ["zh", "en"],
      noTattoo: true,
      children: ["want", "undecided"],
      assetMin: "100k_500k",
      countries: ["CN", "SG", "JP"],
      cities: ["Shanghai", "Singapore"],
      smoking: "never",
    },
    subscription: {
      status: "active",
      level: 2,
      startedAt: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-11-01T00:00:00.000Z",
      isTrial: false,
    },
  },
  {
    handle: "u_01",
    name: "Mei",
    gender: "female",
    birthDate: bornYearsAgo(26, 2, 10),
    city: "Shanghai",
    country: "CN",
    avatar: AVATAR("1494790108377-be9c29b29330"),
    bio: "Art director. Weekends are for galleries and long walks.",
    interests: ["Art", "Running", "Film"],
    level: 1,
    kyc: "approved",
    online: true,
    badges: badges({
      realname: "approved",
      education: "pending",
      job: "approved",
    }),
    attributes: {
      heightCm: 166,
      weightKg: 55,
      education: "bachelor",
      languages: ["zh", "en"],
      religion: "none",
      tattoo: "none",
      smoking: "never",
      drinking: "socially",
      assetRange: "100k_500k",
      children: "want",
      maritalStatus: "single",
      occupation: "Art director",
    },
    subscription: {
      status: "trialing",
      level: 1,
      startedAt: "2026-09-20T00:00:00.000Z",
      expiresAt: "2026-10-20T00:00:00.000Z",
      isTrial: true,
    },
  },
  {
    handle: "u_02",
    name: "Sofia",
    gender: "female",
    birthDate: bornYearsAgo(31, 5, 2),
    city: "Moscow",
    country: "RU",
    avatar: AVATAR("1517841905240-472988babdf9"),
    bio: "Architect. I collect books I never finish.",
    interests: ["Architecture", "Books", "Skiing"],
    level: 2,
    kyc: "approved",
    online: false,
    badges: badges({
      realname: "approved",
      education: "approved",
      job: "approved",
      income: "approved",
      asset: "approved",
      marriage: "approved",
    }),
    attributes: {
      heightCm: 172,
      weightKg: 62,
      education: "master",
      languages: ["ru", "en", "fr"],
      religion: "christian",
      tattoo: "small",
      smoking: "never",
      drinking: "socially",
      assetRange: "500k_1m",
      children: "have",
      maritalStatus: "divorced",
      occupation: "Architect",
    },
    subscription: {
      status: "active",
      level: 2,
      startedAt: "2026-05-11T00:00:00.000Z",
      expiresAt: "2026-11-11T00:00:00.000Z",
      isTrial: false,
    },
  },
  {
    handle: "u_03",
    name: "Yuki",
    gender: "female",
    birthDate: bornYearsAgo(34, 1, 20),
    city: "Tokyo",
    country: "JP",
    avatar: AVATAR("1438761681033-6461ffad8d80"),
    bio: "Product designer, terrible at cooking, good at ramen.",
    interests: ["Design", "Ramen", "Hiking"],
    level: 3,
    kyc: "approved",
    online: true,
    badges: badges({
      realname: "approved",
      education: "approved",
      job: "approved",
      income: "approved",
      asset: "approved",
      property: "approved",
      marriage: "approved",
      criminal: "approved",
    }),
    attributes: {
      heightCm: 161,
      weightKg: 51,
      education: "bachelor",
      languages: ["ja", "en"],
      religion: "buddhist",
      tattoo: "none",
      smoking: "never",
      drinking: "socially",
      assetRange: "1m_5m",
      children: "no",
      maritalStatus: "single",
      occupation: "Product designer",
    },
    subscription: {
      status: "active",
      level: 3,
      startedAt: "2026-03-02T00:00:00.000Z",
      expiresAt: "2027-03-02T00:00:00.000Z",
      isTrial: false,
    },
  },
  {
    handle: "u_04",
    name: "Anna",
    gender: "female",
    birthDate: bornYearsAgo(24, 4, 5),
    city: "Shenzhen",
    country: "CN",
    avatar: AVATAR("1534528741775-53994a69daeb"),
    bio: "Marine biologist. Ask me about jellyfish.",
    interests: ["Diving", "Science", "Jazz"],
    level: 1,
    kyc: "pending",
    online: false,
    badges: badges({ realname: "pending" }),
    attributes: {
      heightCm: 168,
      weightKg: 58,
      education: "college",
      languages: ["zh"],
    },
    subscription: {
      status: "active",
      level: 1,
      startedAt: "2026-08-15T00:00:00.000Z",
      expiresAt: "2026-10-15T00:00:00.000Z",
      isTrial: false,
    },
  },
  {
    handle: "u_06",
    name: "Isabella",
    gender: "female",
    birthDate: bornYearsAgo(30, 6, 18),
    city: "Singapore",
    country: "SG",
    avatar: AVATAR("1524503387942"),
    bio: "Art dealer. Private by nature — I take things slowly.",
    interests: ["Art", "Travel", "Wine"],
    level: 4,
    kyc: "approved",
    online: false,
    badges: badges({
      realname: "approved",
      education: "approved",
      asset: "approved",
      property: "approved",
      marriage: "approved",
      criminal: "expired",
    }),
    attributes: {
      heightCm: 170,
      weightKg: 64,
      education: "master",
      languages: ["en", "zh", "fr"],
      religion: "catholic",
      tattoo: "none",
      smoking: "never",
      drinking: "socially",
      assetRange: "above5m",
      children: "have_want",
      maritalStatus: "divorced",
      occupation: "Art dealer",
    },
    subscription: {
      status: "active",
      level: 4,
      startedAt: "2026-01-15T00:00:00.000Z",
      expiresAt: "2027-01-15T00:00:00.000Z",
      isTrial: false,
    },
  },
  {
    handle: "u_05",
    name: "Elena",
    gender: "female",
    birthDate: bornYearsAgo(28, 2, 27),
    city: "Saint Petersburg",
    country: "RU",
    avatar: AVATAR("1544005313-94ddf0286df2"),
    bio: "Ballet teacher. Cat person, two of them.",
    interests: ["Ballet", "Cats", "Theatre"],
    level: 2,
    kyc: "approved",
    online: true,
    badges: badges({
      realname: "approved",
      education: "approved",
      job: "approved",
      asset: "expired",
    }),
    attributes: {
      heightCm: 165,
      weightKg: 54,
      education: "bachelor",
      languages: ["ru", "en"],
      religion: "christian",
      tattoo: "none",
      smoking: "never",
      drinking: "socially",
      assetRange: "100k_500k",
      children: "want",
      maritalStatus: "single",
      occupation: "Ballet teacher",
    },
    subscription: {
      status: "active",
      level: 2,
      startedAt: "2026-04-18T00:00:00.000Z",
      expiresAt: "2027-04-18T00:00:00.000Z",
      isTrial: false,
    },
  },
  /* 展示型"被推荐人"：姓名脱敏，用于代理商后台的邀请列表。 */
  {
    handle: "r_01",
    name: "M•••a",
    kind: "referral_stub",
    level: 2,
    referredBy: "u_current",
    subscription: {
      status: "active",
      level: 2,
      startedAt: "2026-10-03T00:00:00.000Z",
      expiresAt: "2027-10-03T00:00:00.000Z",
      isTrial: false,
    },
  },
  {
    handle: "r_02",
    name: "K•••d",
    kind: "referral_stub",
    level: 1,
    referredBy: "u_current",
    subscription: { status: "none", level: null },
  },
  {
    handle: "r_03",
    name: "L•••n",
    kind: "referral_stub",
    level: 1,
    referredBy: "u_current",
    subscription: {
      status: "active",
      level: 1,
      startedAt: "2026-09-30T00:00:00.000Z",
      expiresAt: "2026-10-30T00:00:00.000Z",
      isTrial: false,
    },
  },
  /* 机构型账号：只有 profile，没有登录。 */
  {
    handle: "agency_nordic",
    name: "Nordic Match Group",
    kind: "agency",
    level: 2,
    refCode: "NORDIC60",
  },
  {
    handle: "agency_atlas",
    name: "Atlas Union",
    kind: "agency",
    level: 3,
    refCode: "ATLAS70",
  },
];

/** 会话与消息（原 chatThreads / messagesByThread），owner 都是 u_current。 */
const threads = [
  {
    slug: "c_01",
    peer: "u_01",
    updatedAt: "2026-10-04T10:12:00.000Z",
    messages: [
      {
        id: "m_01",
        from: "u_current",
        body: "Hi Mei! I saw your profile — the gallery posts are great.",
        locale: "en",
        isRead: true,
        at: "2026-10-04T09:58:00.000Z",
      },
      {
        id: "m_02",
        from: "u_01",
        body: "谢谢！你是做设计的吗？",
        locale: "zh",
        translation: { body: "Thanks! Do you work in design?", locale: "en" },
        isRead: false,
        at: "2026-10-04T10:05:00.000Z",
      },
      {
        id: "m_03",
        from: "u_01",
        body: "周末去看展吗？",
        locale: "zh",
        translation: {
          body: "Want to go to the exhibition this weekend?",
          locale: "en",
        },
        isRead: false,
        at: "2026-10-04T10:12:00.000Z",
      },
    ],
  },
  {
    slug: "c_02",
    peer: "u_02",
    updatedAt: "2026-10-03T18:40:00.000Z",
    messages: [
      {
        id: "m_05",
        from: "u_02",
        body: "Привет! Ты тоже из Петербурга?",
        locale: "ru",
        translation: {
          body: "Hi! Are you from Saint Petersburg too?",
          locale: "en",
        },
        isRead: true,
        at: "2026-10-03T17:55:00.000Z",
      },
      {
        id: "m_06",
        from: "u_current",
        body: "Not yet, but visiting in November.",
        locale: "en",
        isRead: true,
        at: "2026-10-03T18:40:00.000Z",
      },
      {
        id: "m_07",
        from: "u_current",
        body: "See you on Thursday",
        locale: "en",
        isRead: true,
        at: "2026-10-03T18:40:00.000Z",
      },
    ],
  },
  {
    slug: "c_03",
    peer: "u_05",
    updatedAt: "2026-10-01T09:05:00.000Z",
    messages: [],
  },
];

/** 代理商名册（原 partnerProfiles）。 */
const partners = [
  {
    id: "pt_01",
    name: "Nordic Match Group",
    account: "nordic-match",
    tier: "city",
    share: 0.6,
    region: "Stockholm, Sweden",
    countryCode: "SE",
    refCode: "NORDIC60",
    joinedAt: "2025-11-04",
    status: "active",
    scale: 4.4,
  },
  {
    id: "pt_02",
    name: "Sakura Bridge",
    account: "sakura-bridge",
    tier: "city",
    share: 0.6,
    region: "Tokyo, Japan",
    countryCode: "JP",
    refCode: "SAKURA60",
    joinedAt: "2026-01-19",
    status: "active",
    scale: 2.6,
  },
  {
    id: "pt_03",
    name: "Atlas Union",
    account: "atlas-union",
    tier: "country",
    share: 0.7,
    region: "Kazakhstan",
    countryCode: "KZ",
    refCode: "ATLAS70",
    joinedAt: "2025-08-22",
    status: "active",
    scale: 5.8,
  },
  {
    id: "pt_04",
    name: "Moskva Svyaz",
    account: "moskva-svyaz",
    tier: "country",
    share: 0.7,
    region: "Moscow, Russia",
    countryCode: "RU",
    refCode: "MOSKVA70",
    joinedAt: "2025-06-30",
    status: "active",
    scale: 7.1,
  },
  {
    id: "pt_05",
    name: "Estrella Latina",
    account: "estrella-latina",
    tier: "city",
    share: 0.6,
    region: "Mexico City, Mexico",
    countryCode: "MX",
    refCode: "ESTRELLA60",
    joinedAt: "2026-03-12",
    status: "paused",
    scale: 2.1,
    until: "2026-08-14",
  },
  {
    id: "pt_06",
    name: "Global Hearts Fund",
    account: "global-hearts",
    tier: "shareholder",
    share: 0.75,
    region: "Singapore",
    countryCode: "SG",
    refCode: "GHF75",
    joinedAt: "2025-04-02",
    status: "active",
    scale: 8.2,
  },
  {
    id: "pt_07",
    name: "Dubai Match Lab",
    account: "dubai-match-lab",
    tier: "online",
    share: 0.5,
    region: "Dubai, United Arab Emirates",
    countryCode: "AE",
    refCode: "DUBAI50",
    joinedAt: "2026-05-27",
    status: "onboarding",
    scale: 1.1,
  },
  {
    id: "pt_08",
    name: "Rhein Liebe",
    account: "rhein-liebe",
    tier: "city",
    share: 0.6,
    region: "Frankfurt, Germany",
    countryCode: "DE",
    refCode: "RHEIN60",
    joinedAt: "2026-02-08",
    status: "active",
    scale: 3.9,
  },
];

/** 活动（原 partnerActivities 的 17 条，三语标题随身携带）。 */
const activitySeeds = [
  [
    "pt_01",
    "offline",
    "斯德哥尔摩春季相亲会",
    "Stockholm spring matchmaking evening",
    "Стокгольм: весенний вечер знакомств",
    "Stockholm",
    96,
    2,
  ],
  [
    "pt_01",
    "webinar",
    "北欧会员线上答疑",
    "Nordic members online Q&A",
    "Северный вебинар для участников",
    "Stockholm",
    24,
    1,
  ],
  [
    "pt_02",
    "content",
    "东京专栏：跨文化约会礼仪",
    "Tokyo column: cross-cultural dating etiquette",
    "Токио: этикет межкультурных свиданий",
    "Tokyo",
    63,
    5,
  ],
  [
    "pt_02",
    "offline",
    "银座小型见面会",
    "Ginza small-group meetup",
    "Гиндза: мини-встреча",
    "Tokyo",
    18,
    1,
  ],
  [
    "pt_03",
    "campaign",
    "阿拉木图城市推广季",
    "Almaty city season campaign",
    "Алматы: городская кампания",
    "Almaty",
    74,
    30,
  ],
  [
    "pt_03",
    "webinar",
    "哈萨克会员见面会说明",
    "Kazakh member meetup briefing",
    "Брифинг для участников из Казахстана",
    "Astana",
    41,
    1,
  ],
  [
    "pt_04",
    "referral",
    "莫斯科老会员推荐奖励",
    "Moscow member referral rewards",
    "Москва: бонусы за рекомендации",
    "Moscow",
    29,
    21,
  ],
  [
    "pt_04",
    "offline",
    "圣彼得堡联谊晚宴",
    "Saint Petersburg networking dinner",
    "Санкт-Петербург: ужин-знакомство",
    "Saint Petersburg",
    118,
    1,
  ],
  [
    "pt_05",
    "offline",
    "墨西哥城线下茶歇",
    "Mexico City afternoon tea",
    "Мехико: дневное чаепитие",
    "Mexico City",
    132,
    1,
  ],
  [
    "pt_05",
    "content",
    "拉美会员故事专栏",
    "Latin America member stories",
    "Истории участников из Латинской Америки",
    "Mexico City",
    78,
    4,
  ],
  [
    "pt_06",
    "campaign",
    "新加坡股东专场宣讲",
    "Singapore shareholder briefing",
    "Сингапур: брифинг для акционеров",
    "Singapore",
    87,
    2,
  ],
  [
    "pt_06",
    "webinar",
    "高净值会员配对说明",
    "High-net-worth matching briefing",
    "Программа подбора для состоятельных участников",
    "Singapore",
    33,
    1,
  ],
  [
    "pt_07",
    "referral",
    "迪拜线上招募启动",
    "Dubai online recruitment launch",
    "Дубай: запуск онлайн-набора",
    "Dubai",
    12,
    14,
  ],
  [
    "pt_07",
    "campaign",
    "中东市场预热投放",
    "Middle East pre-launch push",
    "Ближний Восток: предстартовая кампания",
    "Dubai",
    37,
    10,
  ],
  [
    "pt_08",
    "offline",
    "法兰克福咖啡品鉴会",
    "Frankfurt coffee tasting",
    "Франкфурт: дегустация кофе",
    "Frankfurt",
    55,
    1,
  ],
  [
    "pt_08",
    "content",
    "德语区专栏：跨国家庭",
    "DACH column: cross-border families",
    "Колонка DACH: международные семьи",
    "Frankfurt",
    20,
    3,
  ],
  [
    "pt_01",
    "campaign",
    "北欧推荐码推广",
    "Nordic referral code promotion",
    "Продвижение реферального кода в Северной Европе",
    "Stockholm",
    9,
    14,
  ],
];

/* ────────────────────────────── 写库 ────────────────────────────── */

const client = new pg.Client({ connectionString: databaseUrl() });
await client.connect();
await client.query("begin");

try {
  if (shouldReset) {
    // TRUNCATE 不触发行级触发器，所以能清掉 append-only 的付款流水。
    await client.query(
      "truncate public.partner_daily_records, public.partner_activities, public.partners, " +
        "public.member_payments, public.payouts, public.promo_codes, public.subscriptions, " +
        "public.verification_badges, public.partner_preferences, public.profile_attributes, " +
        "public.messages, public.chat_visibility, public.user_blocks, public.user_reports, " +
        "public.chats, public.agents, public.profiles, public.users, public.plans cascade",
    );
    console.log("已清空业务表（--reset）");
  }

  for (const plan of plans) {
    await client.query(
      `insert into public.plans (level, price_monthly, price_yearly, currency, is_contact_sales, sort_order)
       values ($1, $2, $3, 'USD', $4, $5)
       on conflict (level) do update
         set price_monthly = excluded.price_monthly,
             price_yearly = excluded.price_yearly,
             is_contact_sales = excluded.is_contact_sales,
             sort_order = excluded.sort_order`,
      [plan.level, plan.monthly, plan.yearly, plan.contact, plan.order],
    );
  }

  /* 会员 + 关联登录账号 */
  const profileIds = new Map();

  for (const member of members) {
    const { rows } = await client.query(
      `insert into public.profiles
         (handle, kind, display_name, avatar_url, gender, birth_date, city, country_code, bio,
          interests, level, kyc_status, is_online, last_active_at, ref_code)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14)
       on conflict (handle) do update
         set kind = excluded.kind,
             display_name = excluded.display_name,
             avatar_url = excluded.avatar_url,
             gender = excluded.gender,
             birth_date = excluded.birth_date,
             city = excluded.city,
             country_code = excluded.country_code,
             bio = excluded.bio,
             interests = excluded.interests,
             level = excluded.level,
             kyc_status = excluded.kyc_status,
             is_online = excluded.is_online
       returning id`,
      [
        member.handle,
        member.kind ?? "member",
        member.name,
        member.avatar ?? null,
        member.gender ?? null,
        member.birthDate ?? null,
        member.city ?? null,
        member.country ?? null,
        member.bio ?? null,
        member.interests ?? [],
        member.level,
        member.kyc ?? "unverified",
        member.online ?? false,
        // ref_code 不可变：只在首次插入时给值，冲突时不更新。
        member.refCode ?? null,
      ],
    );

    profileIds.set(member.handle, rows[0].id);
  }

  /* 登录账号：仅 u_current 有，用于演示手机号登录 */
  const loginMember = members.find((member) => member.login);

  if (loginMember) {
    const { rows } = await client.query(
      `insert into public.users (phone, last_seen_at)
       values ($1, now())
       on conflict (phone) do update set last_seen_at = now()
       returning id`,
      [loginMember.login.phone],
    );

    await client.query(
      "update public.profiles set user_id = $1, phone = $2 where handle = $3",
      [rows[0].id, loginMember.login.phone, loginMember.handle],
    );
  }

  /* 邀请归因（referred_by） */
  for (const member of members) {
    if (!member.referredBy) {
      continue;
    }

    await client.query(
      "update public.profiles set referred_by = $1 where handle = $2",
      [profileIds.get(member.referredBy), member.handle],
    );
  }

  /* 扩展属性 / 征友条件 */
  for (const member of members) {
    const profileId = profileIds.get(member.handle);

    if (member.attributes) {
      const a = member.attributes;
      /*
        居住国家/城市**不在这里写**：它们是 `profiles` 上的列，上面那段
        会员 upsert 已经写入。属性表里曾经也有同名的两列，两处都写就会
        出现"谁说话"的歧义（旧的读取逻辑因此把主表的值盖成过空串），
        已在 0008_attributes_move.sql 里删掉。
      */
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
               occupation = excluded.occupation`,
        [
          profileId,
          a.heightCm ?? null,
          a.weightKg ?? null,
          a.education ?? null,
          a.languages ?? [],
          a.religion ?? null,
          a.tattoo ?? null,
          a.smoking ?? null,
          a.drinking ?? null,
          a.assetRange ?? null,
          a.children ?? null,
          a.maritalStatus ?? null,
          a.occupation ?? "",
        ],
      );
    }

    if (member.preferences) {
      const p = member.preferences;
      await client.query(
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
               exclusive = excluded.exclusive`,
        [
          profileId,
          p.ageMin ?? null,
          p.ageMax ?? null,
          p.heightMin ?? null,
          p.heightMax ?? null,
          p.education ?? [],
          p.languages ?? [],
          p.religions ?? [],
          p.noTattoo ?? false,
          p.children ?? [],
          p.assetMin ?? null,
          p.countries ?? [],
          p.cities ?? [],
          p.smoking ?? null,
          p.drinking ?? null,
          p.exclusive ?? [],
        ],
      );
    }
  }

  /* 认证徽章 */
  for (const member of members) {
    if (!member.badges) {
      continue;
    }

    for (const badge of member.badges) {
      await client.query(
        `insert into public.verification_badges (profile_id, code, status, verified_at, expires_at)
         values ($1,$2,$3,$4,$5)
         on conflict (profile_id, code) do update
           set status = excluded.status,
               verified_at = excluded.verified_at,
               expires_at = excluded.expires_at`,
        [
          profileIds.get(member.handle),
          badge.code,
          badge.status,
          badge.verifiedAt,
          badge.expiresAt,
        ],
      );
    }
  }

  /* 订阅：先删当前行再插，保证唯一 */
  for (const member of members) {
    const profileId = profileIds.get(member.handle);
    const sub = member.subscription;

    if (!sub) {
      continue;
    }

    await client.query(
      "delete from public.subscriptions where profile_id = $1 and status in ('trialing','active')",
      [profileId],
    );

    await client.query(
      `insert into public.subscriptions
         (profile_id, status, level, started_at, expires_at, is_trial, scheduled_level)
       values ($1,$2,$3,$4,$5,$6,null)`,
      [
        profileId,
        sub.status,
        sub.level ?? null,
        sub.startedAt ?? null,
        sub.expiresAt ?? null,
        sub.isTrial ?? false,
      ],
    );
  }

  /* 会话与消息 */
  const currentProfileId = profileIds.get("u_current");

  for (const thread of threads) {
    const peerId = profileIds.get(thread.peer);
    const { rows } = await client.query(
      `insert into public.chats
         (slug, owner_id, member_ids, peer_id, peer_name, peer_avatar_url, peer_level, peer_is_online, created_at)
       select $1, $2, array[$2, $3]::uuid[], $3, p.display_name, p.avatar_url, p.level, p.is_online, $4
         from public.profiles p
        where p.id = $3
       on conflict (slug, owner_id) do update
         set member_ids = excluded.member_ids,
             peer_id = excluded.peer_id,
             peer_name = excluded.peer_name,
             peer_avatar_url = excluded.peer_avatar_url,
             peer_level = excluded.peer_level,
             peer_is_online = excluded.peer_is_online
       returning id`,
      [thread.slug, currentProfileId, peerId, thread.updatedAt],
    );

    const chatId = rows[0].id;

    await client.query("delete from public.messages where chat_id = $1", [
      chatId,
    ]);

    for (const message of thread.messages) {
      await client.query(
        `insert into public.messages
           (id, chat_id, sender_id, body, original_locale, translated_body, translated_locale,
            is_translating, is_read, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,false,$8,$9)`,
        [
          // 固定 uuid：mock 用的是 m_01 这样的字符串，这里用 uuid v5 风格派生会过于绕，
          // 直接用确定性 uuid（把 m_01 的序号编码进最后一段）。
          `00000000-0000-4000-8000-${message.id.slice(2).padStart(12, "0")}`,
          chatId,
          profileIds.get(message.from),
          message.body,
          message.locale,
          message.translation?.body ?? null,
          message.translation?.locale ?? null,
          message.isRead ?? false,
          message.at,
        ],
      );
    }
  }

  /* 会话汇总字段对齐（触发器维护的是增量，这里做一次总账） */
  await client.query(`
    update public.chats c
       set last_message_text = (
             select m.body from public.messages m
              where m.chat_id = c.id order by m.created_at desc limit 1
           ),
           last_message_at = (
             select m.created_at from public.messages m
              where m.chat_id = c.id order by m.created_at desc limit 1
           ),
           unread_count = (
             select count(*) from public.messages m
              where m.chat_id = c.id and m.is_read = false
           )
  `);

  /* 代理商档案 + 分成 */
  await client.query(
    `insert into public.agents (profile_id, level, commission_rate, joined_at)
     values ($1, 'pro', 0.6, '2026-02-11T00:00:00.000Z')
     on conflict (profile_id) do update
       set level = excluded.level,
           commission_rate = excluded.commission_rate`,
    [currentProfileId],
  );

  /* 促销码 */
  for (const promo of [
    {
      code: "ALEX60-TRIAL-7K2M",
      expiresAt: "2026-10-31T00:00:00.000Z",
      usedAt: null,
    },
    {
      code: "ALEX60-TRIAL-3P9X",
      expiresAt: "2026-10-01T00:00:00.000Z",
      usedAt: "2026-09-14T10:00:00.000Z",
    },
  ]) {
    await client.query(
      `insert into public.promo_codes (code, profile_id, level, expires_at, used_at)
       values ($1, $2, 1, $3, $4)
       on conflict (code) do update
         set profile_id = excluded.profile_id,
             expires_at = excluded.expires_at,
             used_at = excluded.used_at`,
      [promo.code, currentProfileId, promo.expiresAt, promo.usedAt],
    );
  }

  /* 出款记录 */
  await client.query("delete from public.payouts where profile_id = $1", [
    currentProfileId,
  ]);

  await client.query(
    `insert into public.payouts
       (profile_id, amount, currency, method, account, status, requested_at, settled_at)
     values
       ($1, 500, 'USD', 'alipay', 'a•••@alipay.com', 'paid',        '2026-09-20T00:00:00.000Z', '2026-09-22T00:00:00.000Z'),
       ($1, 350, 'USD', 'wechat', 'wx_••••9281',    'processing',  '2026-10-03T00:00:00.000Z', null)`,
    [currentProfileId],
  );

  /* 付款流水（只追加）：已有数据则跳过 */
  const { rows: paymentCount } = await client.query(
    "select count(*)::int as n from public.member_payments",
  );

  if (paymentCount[0].n > 0) {
    console.log(
      `付款流水已有 ${paymentCount[0].n} 条，跳过（只追加表；要重灌请加 --reset）`,
    );
  } else {
    const rng = mulberry32(hash("loono-seed-payments"));
    const payers = ["r_01", "r_03", "u_01", "u_02"];
    const monthStart = `${today.slice(0, 7)}-01`;
    // 两段目标：本月佣金 612.40、历史累计 4820.55（与原型观感一致）。
    const monthTarget = 612.4;
    const lifetimeTarget = 4820.55;

    const buckets = [
      { count: 14, from: monthStart, to: today, target: monthTarget },
      {
        count: 40,
        from: shiftDays(monthStart, -180),
        to: shiftDays(monthStart, -1),
        target: round2(lifetimeTarget - monthTarget),
      },
    ];

    for (const bucket of buckets) {
      const weights = Array.from({ length: bucket.count }, () => 0.4 + rng());
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const span = Math.max(
        1,
        Math.round(
          (new Date(`${bucket.to}T00:00:00Z`) -
            new Date(`${bucket.from}T00:00:00Z`)) /
            86400000,
        ),
      );

      let assigned = 0;

      for (let index = 0; index < weights.length; index += 1) {
        const isLast = index === weights.length - 1;
        const commission = isLast
          ? round2(bucket.target - assigned)
          : round2((weights[index] / total) * bucket.target);
        assigned = round2(assigned + commission);

        const daysAgo = Math.floor(
          (span * (weights.length - index)) / weights.length,
        );
        const paidAt = `${shiftDays(bucket.to, -daysAgo)}T12:00:00.000Z`;
        const rate = 0.6;

        await client.query(
          `insert into public.member_payments
             (profile_id, amount, currency, plan_level, channel, agent_profile_id,
              commission_rate, commission_amount, paid_at)
           values ($1, $2, 'USD', $3, $4, $5, $6, $7, $8)`,
          [
            profileIds.get(payers[index % payers.length]),
            round2(commission / rate),
            [1, 2, 2, 3][index % 4],
            ["card", "alipay", "wechat"][index % 3],
            currentProfileId,
            rate,
            commission,
            paidAt,
          ],
        );
      }
    }

    console.log("已写入付款流水 54 条");
  }

  /* 合作方名册 */
  for (const partner of partners) {
    await client.query(
      `insert into public.partners
         (id, name, account, tier, share, region, country_code, ref_code, joined_at, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (id) do update
         set name = excluded.name,
             account = excluded.account,
             tier = excluded.tier,
             share = excluded.share,
             region = excluded.region,
             country_code = excluded.country_code,
             ref_code = excluded.ref_code,
             joined_at = excluded.joined_at,
             status = excluded.status`,
      [
        partner.id,
        partner.name,
        partner.account,
        partner.tier,
        partner.share,
        partner.region,
        partner.countryCode,
        partner.refCode,
        partner.joinedAt,
        partner.status,
      ],
    );

    /* 日流水：与 mock 同款确定性算法 */
    await client.query(
      "delete from public.partner_daily_records where partner_id = $1",
      [partner.id],
    );

    const rng = mulberry32(hash(partner.id));
    const endDate = partner.until ?? today;
    let cursor = LEDGER_START;

    while (cursor <= endDate) {
      const date = new Date(`${cursor}T00:00:00Z`);
      const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
      const noise = 0.55 + rng() * 0.9;
      const weekendFactor = isWeekend ? 0.72 : 1;

      const gross = round2(partner.scale * 92 * noise * weekendFactor);
      const commission = round2(gross * partner.share);
      const signups = Math.max(
        0,
        Math.round(partner.scale * noise * weekendFactor * 1.1),
      );
      const paying = Math.max(0, Math.round(signups * 0.55));
      const active = Math.max(
        0,
        Math.round(partner.scale * 36 * noise * weekendFactor),
      );
      const conversations = Math.max(0, Math.round(active * 0.35));

      await client.query(
        `insert into public.partner_daily_records
           (partner_id, date, gross, commission, signups, paying, active, conversations)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (partner_id, date) do update
           set gross = excluded.gross,
               commission = excluded.commission,
               signups = excluded.signups,
               paying = excluded.paying,
               active = excluded.active,
               conversations = excluded.conversations`,
        [
          partner.id,
          cursor,
          gross,
          commission,
          signups,
          paying,
          active,
          conversations,
        ],
      );

      cursor = shiftDays(cursor, 1);
    }

    /* 活动 */
    await client.query(
      "delete from public.partner_activities where partner_id = $1",
      [partner.id],
    );

    const partnerActivities = activitySeeds.filter(([id]) => id === partner.id);
    let activityIndex = 0;

    for (const [, kind, zh, en, ru, city, daysAgo, span] of partnerActivities) {
      activityIndex += 1;
      const end = shiftDays(today, -daysAgo);
      const start = shiftDays(end, -span);
      const rngActivity = mulberry32(hash(`${partner.id}-${activityIndex}`));

      await client.query(
        `insert into public.partner_activities
           (id, partner_id, kind, title, city, start_at, end_at, signups, commission)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (id) do update
           set kind = excluded.kind,
               title = excluded.title,
               city = excluded.city,
               start_at = excluded.start_at,
               end_at = excluded.end_at,
               signups = excluded.signups,
               commission = excluded.commission`,
        [
          `act_${partner.id.slice(3)}_${String(activityIndex).padStart(2, "0")}`,
          partner.id,
          kind,
          JSON.stringify({ zh, en, ru }),
          city,
          start,
          end,
          Math.round(partner.scale * (4 + rngActivity() * 14)),
          round2(partner.scale * (180 + rngActivity() * 900) * partner.share),
        ],
      );
    }
  }

  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  console.error(`种子写入失败：${error.message}`);
  await client.end();
  process.exit(1);
}

const summary = await client.query(`
  select
    (select count(*) from public.profiles)               as profiles,
    (select count(*) from public.messages)               as messages,
    (select count(*) from public.member_payments)        as payments,
    (select count(*) from public.partners)               as partners,
    (select count(*) from public.partner_daily_records)  as ledger_days,
    (select count(*) from public.partner_activities)     as activities
`);

console.log("\n完成，当前数据量：", summary.rows[0]);

await client.end();
