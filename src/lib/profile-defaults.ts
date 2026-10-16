import type {
  PartnerPreferences,
  PersonalProfile,
  ProfileBasics,
} from "@/types/profile";

/**
 * 会员属性与征友条件的"空形状"。
 *
 * 原先这两个常量住在 `lib/mock-data` 里，被当作编辑器兜底值和重置模板使用。
 * 它们本身与 mock 无关（是类型的完整字面量），所以移到中性模块，
 * 让调用点不再为了拿一个空对象而依赖假数据。
 */

/** 「完善个人资料」的空值。档案行理论上一定存在，这只是读不到时的兜底。 */
export const emptyProfileBasics: ProfileBasics = {
  displayName: "",
  gender: null,
  birthDate: null,
  countryCode: "",
  city: "",
  photoUrls: [],
  avatarUrl: null,
};

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
