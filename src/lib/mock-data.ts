// 说明：`weightKg` 是为 0007 迁移新增的字段，这里统一补 null。
import type { Plan } from "@/types/user";
import type { Agent, PromoCode, Payout, Referral } from "@/types/agent";
import type { ChatThread, Message } from "@/types/chat";
import type { PartnerPreferences, PersonalProfile } from "@/types/profile";
import type { PublicUser } from "@/types/user";
import type {
  VerificationCode,
  VerificationStatus,
  VerificationTag,
} from "@/types/verification";
import { getTagDefinition } from "@/lib/verification";

/**
 * Placeholder data for the starter project.
 * Replace these reads with real API/database calls as features are built.
 */

const AVATAR = (seed: string) =>
  `https://images.unsplash.com/photo-${seed}?w=400&q=80`;

const BADGE_VERIFIED_AT = "2026-06-01T00:00:00.000Z";

function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

/**
 * Builds a badge list from a compact spec (Module R).
 *
 * Anything left out of the spec stays `unverified` and renders grey, which is
 * what most mock members show. Approved badges with a validity window get an
 * expiry date so R5 can be demoed.
 */
function badges(
  spec: Partial<Record<VerificationCode, VerificationStatus>>,
): VerificationTag[] {
  return (Object.entries(spec) as [VerificationCode, VerificationStatus][]).map(
    ([code, status]) => {
      const passed = status === "approved" || status === "expired";
      const months = getTagDefinition(code)?.validityMonths ?? null;

      let expiresAt: string | null = null;
      if (passed && months) {
        expiresAt = addMonths(BADGE_VERIFIED_AT, months);
      }
      if (status === "expired") {
        expiresAt = addMonths(BADGE_VERIFIED_AT, months ?? 3);
      }

      return {
        code,
        status,
        verifiedAt: passed ? BADGE_VERIFIED_AT : null,
        expiresAt,
      };
    },
  );
}

/**
 * Subscription tiers. Yearly is billed as 10 months for 12 (~17% off), so the
 * saving badge stays consistent across tiers.
 *
 * Level 4 is invite-only and carries no public price (PRD tiers 1-4).
 */
export const plans: Plan[] = [
  { level: 1, priceMonthly: 30, priceYearly: 300, currency: "USD" },
  { level: 2, priceMonthly: 200, priceYearly: 2000, currency: "USD" },
  { level: 3, priceMonthly: 400, priceYearly: 4000, currency: "USD" },
  {
    level: 4,
    priceMonthly: null,
    priceYearly: null,
    currency: "USD",
    isContactSales: true,
  },
];

/**
 * Module P — profile / preference helpers.
 *
 * `emptyProfile` doubles as the "reset" shape and as the fallback the editor
 * receives for a member who has never opened the form.
 */
export const emptyProfile: PersonalProfile = {
  heightCm: null,
  weightKg: null,
  education: null,
  languages: [],
  religion: null,
  tattoo: null,
  smoking: null,
  drinking: null,
  assetRange: null,
  children: null,
  maritalStatus: null,
  occupation: "",
  // 兴趣与自我介绍于 2026-10-16 从 ProfileBasics 挪进 PersonalProfile。
  // 这个文件已零引用（真正的空形状在 lib/profile-defaults.ts），
  // 补齐只是为了让废弃模块继续通过类型检查。
  interests: [],
  bio: "",
  countryCode: "",
  city: "",
};

export const emptyPreferences: PartnerPreferences = {
  ageMin: null,
  ageMax: null,
  heightMin: null,
  heightMax: null,
  education: [],
  languages: [],
  religions: [],
  noTattoo: false,
  children: [],
  assetMin: null,
  countries: [],
  cities: [],
  smoking: null,
  drinking: null,
  exclusive: [],
};

/** Sparse object literal → full `PersonalProfile`. */
function profileOf(spec: Partial<PersonalProfile>): PersonalProfile {
  return { ...emptyProfile, ...spec };
}

/** Sparse object literal → full `PartnerPreferences`. */
function prefsOf(spec: Partial<PartnerPreferences>): PartnerPreferences {
  return { ...emptyPreferences, ...spec };
}

/** The signed-in member. Level 2 so that L1/L2 are visible and L3 is blurred. */
export const currentUser: PublicUser = {
  id: "u_current",
  name: "Alex",
  gender: "male",
  age: 29,
  city: "Shanghai",
  countryCode: "CN",
  avatarUrl: AVATAR("1500648767791-00dcc994a43e"),
  photoUrls: [],
  bio: "Coffee, climbing and slow travel.",
  interests: ["Climbing", "Coffee", "Photography"],
  level: 2,
  kycStatus: "approved",
  isOnline: true,
  verifications: badges({
    realname: "approved",
    education: "approved",
    job: "approved",
    income: "pending",
    marriage: "approved",
  }),
  profile: profileOf({
    heightCm: 182,
    weightKg: null,
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
    countryCode: "CN",
    city: "Shanghai",
  }),
  preferences: prefsOf({
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
  }),
  lastActiveAt: new Date().toISOString(),
  subscription: {
    status: "active",
    level: 2,
    startedAt: "2026-06-01T00:00:00.000Z",
    expiresAt: "2026-11-01T00:00:00.000Z",
    isTrial: false,
    scheduledLevel: null,
  },
};

export const catalogUsers: PublicUser[] = [
  {
    id: "u_01",
    name: "Mei",
    gender: "female",
    age: 26,
    city: "Shanghai",
    countryCode: "CN",
    avatarUrl: AVATAR("1494790108377-be9c29b29330"),
    photoUrls: [AVATAR("1494790108377-be9c29b29330")],
    bio: "Art director. Weekends are for galleries and long walks.",
    interests: ["Art", "Running", "Film"],
    level: 1,
    kycStatus: "approved",
    isOnline: true,
    lastActiveAt: new Date().toISOString(),
    verifications: badges({
      realname: "approved",
      education: "pending",
      job: "approved",
    }),
    profile: profileOf({
      heightCm: 166,
      weightKg: null,
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
      countryCode: "CN",
      city: "Shanghai",
    }),
    subscription: {
      status: "trialing",
      level: 1,
      startedAt: "2026-09-20T00:00:00.000Z",
      expiresAt: "2026-10-20T00:00:00.000Z",
      isTrial: true,
      scheduledLevel: null,
    },
  },
  {
    id: "u_02",
    name: "Sofia",
    gender: "female",
    age: 31,
    city: "Moscow",
    countryCode: "RU",
    avatarUrl: AVATAR("1517841905240-472988babdf9"),
    photoUrls: [AVATAR("1517841905240-472988babdf9")],
    bio: "Architect. I collect books I never finish.",
    interests: ["Architecture", "Books", "Skiing"],
    level: 2,
    kycStatus: "approved",
    isOnline: false,
    lastActiveAt: "2026-10-02T18:00:00.000Z",
    verifications: badges({
      realname: "approved",
      education: "approved",
      job: "approved",
      income: "approved",
      asset: "approved",
      marriage: "approved",
    }),
    profile: profileOf({
      heightCm: 172,
      weightKg: null,
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
      countryCode: "RU",
      city: "Moscow",
    }),
    subscription: {
      status: "active",
      level: 2,
      startedAt: "2026-05-11T00:00:00.000Z",
      expiresAt: "2026-11-11T00:00:00.000Z",
      isTrial: false,
      scheduledLevel: null,
    },
  },
  {
    id: "u_03",
    name: "Yuki",
    gender: "female",
    age: 34,
    city: "Tokyo",
    countryCode: "JP",
    avatarUrl: AVATAR("1438761681033-6461ffad8d80"),
    photoUrls: [AVATAR("1438761681033-6461ffad8d80")],
    bio: "Product designer, terrible at cooking, good at ramen.",
    interests: ["Design", "Ramen", "Hiking"],
    level: 3,
    kycStatus: "approved",
    isOnline: true,
    lastActiveAt: new Date().toISOString(),
    verifications: badges({
      realname: "approved",
      education: "approved",
      job: "approved",
      income: "approved",
      asset: "approved",
      property: "approved",
      marriage: "approved",
      criminal: "approved",
    }),
    profile: profileOf({
      heightCm: 161,
      weightKg: null,
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
      countryCode: "JP",
      city: "Tokyo",
    }),
    subscription: {
      status: "active",
      level: 3,
      startedAt: "2026-03-02T00:00:00.000Z",
      expiresAt: "2027-03-02T00:00:00.000Z",
      isTrial: false,
      scheduledLevel: null,
    },
  },
  {
    id: "u_04",
    name: "Anna",
    gender: "female",
    age: 24,
    city: "Shenzhen",
    countryCode: "CN",
    avatarUrl: AVATAR("1534528741775-53994a69daeb"),
    photoUrls: [AVATAR("1534528741775-53994a69daeb")],
    bio: "Marine biologist. Ask me about jellyfish.",
    interests: ["Diving", "Science", "Jazz"],
    level: 1,
    kycStatus: "pending",
    isOnline: false,
    verifications: badges({ realname: "pending" }),
    lastActiveAt: "2026-09-28T09:00:00.000Z",
    profile: profileOf({
      heightCm: 168,
      weightKg: null,
      education: "college",
      languages: ["zh"],
      countryCode: "CN",
      city: "Shenzhen",
    }),
    subscription: {
      status: "active",
      level: 1,
      startedAt: "2026-08-15T00:00:00.000Z",
      expiresAt: "2026-10-15T00:00:00.000Z",
      isTrial: false,
      scheduledLevel: null,
    },
  },
  {
    id: "u_06",
    name: "Isabella",
    gender: "female",
    age: 30,
    city: "Singapore",
    countryCode: "SG",
    avatarUrl: AVATAR("1524503387942"),
    photoUrls: [AVATAR("1524503387942")],
    bio: "Art dealer. Private by nature — I take things slowly.",
    interests: ["Art", "Travel", "Wine"],
    level: 4,
    kycStatus: "approved",
    isOnline: false,
    lastActiveAt: "2026-09-30T12:00:00.000Z",
    verifications: badges({
      realname: "approved",
      education: "approved",
      asset: "approved",
      property: "approved",
      marriage: "approved",
      criminal: "expired",
    }),
    profile: profileOf({
      heightCm: 170,
      weightKg: null,
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
      countryCode: "SG",
      city: "Singapore",
    }),
    subscription: {
      status: "active",
      level: 4,
      startedAt: "2026-01-15T00:00:00.000Z",
      expiresAt: "2027-01-15T00:00:00.000Z",
      isTrial: false,
      scheduledLevel: null,
    },
  },
  {
    id: "u_05",
    name: "Elena",
    gender: "female",
    age: 28,
    city: "Saint Petersburg",
    countryCode: "RU",
    avatarUrl: AVATAR("1544005313-94ddf0286df2"),
    photoUrls: [AVATAR("1544005313-94ddf0286df2")],
    bio: "Ballet teacher. Cat person, two of them.",
    interests: ["Ballet", "Cats", "Theatre"],
    level: 2,
    kycStatus: "approved",
    isOnline: true,
    lastActiveAt: new Date().toISOString(),
    verifications: badges({
      realname: "approved",
      education: "approved",
      job: "approved",
      asset: "expired",
    }),
    profile: profileOf({
      heightCm: 165,
      weightKg: null,
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
      countryCode: "RU",
      city: "Saint Petersburg",
    }),
    subscription: {
      status: "active",
      level: 2,
      startedAt: "2026-04-18T00:00:00.000Z",
      expiresAt: "2027-04-18T00:00:00.000Z",
      isTrial: false,
      scheduledLevel: null,
    },
  },
];

export const chatThreads: ChatThread[] = [
  {
    id: "c_01",
    peer: {
      id: "u_01",
      name: "Mei",
      avatarUrl: AVATAR("1494790108377-be9c29b29330"),
      level: 1,
      isOnline: true,
    },
    lastMessage: {
      id: "m_03",
      threadId: "c_01",
      senderId: "u_01",
      originalText: "周末去看展吗？",
      originalLocale: "zh",
      translatedText: "Want to go to the exhibition this weekend?",
      translatedLocale: "en",
      status: "read",
      createdAt: "2026-10-04T10:12:00.000Z",
    },
    unreadCount: 2,
    updatedAt: "2026-10-04T10:12:00.000Z",
  },
  {
    id: "c_02",
    peer: {
      id: "u_02",
      name: "Sofia",
      avatarUrl: AVATAR("1517841905240-472988babdf9"),
      level: 2,
      isOnline: false,
    },
    lastMessage: {
      id: "m_07",
      threadId: "c_02",
      senderId: "u_current",
      originalText: "See you on Thursday",
      originalLocale: "en",
      status: "delivered",
      createdAt: "2026-10-03T18:40:00.000Z",
    },
    unreadCount: 0,
    updatedAt: "2026-10-03T18:40:00.000Z",
  },
  {
    id: "c_03",
    peer: {
      id: "u_05",
      name: "Elena",
      avatarUrl: AVATAR("1544005313-94ddf0286df2"),
      level: 2,
      isOnline: true,
    },
    lastMessage: null,
    unreadCount: 0,
    updatedAt: "2026-10-01T09:05:00.000Z",
  },
];

export const messagesByThread: Record<string, Message[]> = {
  c_01: [
    {
      id: "m_01",
      threadId: "c_01",
      senderId: "u_current",
      originalText: "Hi Mei! I saw your profile — the gallery posts are great.",
      originalLocale: "en",
      status: "read",
      createdAt: "2026-10-04T09:58:00.000Z",
    },
    {
      id: "m_02",
      threadId: "c_01",
      senderId: "u_01",
      originalText: "谢谢！你是做设计的吗？",
      originalLocale: "zh",
      translatedText: "Thanks! Do you work in design?",
      translatedLocale: "en",
      status: "read",
      createdAt: "2026-10-04T10:05:00.000Z",
    },
    {
      id: "m_03",
      threadId: "c_01",
      senderId: "u_01",
      originalText: "周末去看展吗？",
      originalLocale: "zh",
      translatedText: "Want to go to the exhibition this weekend?",
      translatedLocale: "en",
      status: "delivered",
      createdAt: "2026-10-04T10:12:00.000Z",
    },
  ],
  c_02: [
    {
      id: "m_05",
      threadId: "c_02",
      senderId: "u_02",
      originalText: "Привет! Ты тоже из Петербурга?",
      originalLocale: "ru",
      translatedText: "Hi! Are you from Saint Petersburg too?",
      translatedLocale: "en",
      status: "read",
      createdAt: "2026-10-03T17:55:00.000Z",
    },
    {
      id: "m_06",
      threadId: "c_02",
      senderId: "u_current",
      originalText: "Not yet, but visiting in November.",
      originalLocale: "en",
      status: "delivered",
      createdAt: "2026-10-03T18:40:00.000Z",
    },
    {
      id: "m_07",
      threadId: "c_02",
      senderId: "u_current",
      originalText: "See you on Thursday",
      originalLocale: "en",
      status: "delivered",
      createdAt: "2026-10-03T18:40:00.000Z",
    },
  ],
  c_03: [],
};

export const currentAgent: Agent = {
  id: "a_01",
  userId: "u_current",
  level: "pro",
  commissionRate: 0.6,
  refCode: "ALEX60",
  refLink: "https://loono.app/auth?ref=ALEX60",
  joinedAt: "2026-02-11T00:00:00.000Z",
  stats: {
    totalEarnings: 4820.55,
    thisMonthEarnings: 612.4,
    pendingPayout: 350,
    totalInvitees: 148,
    activeInvitees: 96,
    conversionRate: 96 / 148,
  },
};

export const referrals: Referral[] = [
  {
    id: "r_01",
    nickname: "M•••a",
    avatarUrl: null,
    joinedAt: "2026-10-03T12:00:00.000Z",
    subscribed: true,
    level: 2,
    earnings: 18,
  },
  {
    id: "r_02",
    nickname: "K•••d",
    avatarUrl: null,
    joinedAt: "2026-10-02T08:30:00.000Z",
    subscribed: false,
    level: null,
    earnings: 0,
  },
  {
    id: "r_03",
    nickname: "L•••n",
    avatarUrl: null,
    joinedAt: "2026-09-30T21:10:00.000Z",
    subscribed: true,
    level: 1,
    earnings: 7.79,
  },
];

export const promoCodes: PromoCode[] = [
  {
    code: "ALEX60-TRIAL-7K2M",
    level: 1,
    createdAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2026-10-31T00:00:00.000Z",
    usedAt: null,
  },
  {
    code: "ALEX60-TRIAL-3P9X",
    level: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-10-01T00:00:00.000Z",
    usedAt: "2026-09-14T10:00:00.000Z",
  },
];

export const payouts: Payout[] = [
  {
    id: "p_01",
    amount: 500,
    currency: "USD",
    method: "alipay",
    account: "a•••@alipay.com",
    status: "paid",
    requestedAt: "2026-09-20T00:00:00.000Z",
    settledAt: "2026-09-22T00:00:00.000Z",
  },
  {
    id: "p_02",
    amount: 350,
    currency: "USD",
    method: "wechat",
    account: "wx_••••9281",
    status: "processing",
    requestedAt: "2026-10-03T00:00:00.000Z",
    settledAt: null,
  },
];

export function findUser(id: string): PublicUser | undefined {
  if (id === currentUser.id) {
    return currentUser;
  }
  return catalogUsers.find((user) => user.id === id);
}

export function findThread(id: string): ChatThread | undefined {
  return chatThreads.find((thread) => thread.id === id);
}
