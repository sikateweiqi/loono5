import { COUNTRY_CODES, type CountryCode } from "@/lib/profile-options";

/**
 * 居住地字典：国家 → 该国城市列表。
 *
 * 为什么城市值用**拉丁专名原文**而不是 i18n 键
 * ------------------------------------------
 * 三个理由，按重要性排序：
 *
 * 1. **既有数据已经是这个形状。** `scripts/seed.mjs` 里七个种子会员的
 *    `city` 就是 `Shanghai` / `Moscow` / `Tokyo` / `Shenzhen` /
 *    `Singapore` / `Saint Petersburg`。改用城市码会让这批数据变成
 *    "认不出的旧值"，得再做一次数据搬迁 —— 而这次改动并不值得动数据。
 * 2. **城市是专有名词。** `profiles.city` 会被目录卡片、会员详情、
 *    落地页地区栏直接渲染（`user-card.tsx` / `[id]/page.tsx` /
 *    `regions-section.tsx` 都在读它）。若存城市码，这五处渲染点都得
 *    再包一层翻译函数；存专名则原样可用，且任何语言下都不会显示成
 *    `shanghai`。
 * 3. **它必须语言中立。** 同一个人的 `city` 只能有一个值。若存当前
 *    界面语言的名字，中国会员把自己选成「上海」、俄罗斯会员选成
 *    「Шанхай」，同一座城市在库里变成两个字符串，按城市筛选会漏人。
 *
 * 代价是中文界面里城市名显示为 `Shanghai` 而不是「上海」。这个取舍是
 * 有意接受的：跨国场景下用户本来就更认专名，而按语言翻译城市名属于
 * 后续本地化工作，届时把本文件换成后端字典下发即可 —— 调用方不用改。
 *
 * 原型阶段是固定词表。真实部署应由后端字典接口下发（与
 * `profile-options.ts` 里其它选项列表同理），城市数量也应扩到全量。
 */

/** 国家 → 该国城市（拉丁专名）。键必须是 `COUNTRY_CODES` 的子集。 */
export const COUNTRY_CITIES: Record<CountryCode, readonly string[]> = {
  CN: [
    "Beijing",
    "Shanghai",
    "Guangzhou",
    "Shenzhen",
    "Chengdu",
    "Hangzhou",
    "Xi'an",
    "Chongqing",
  ],
  // 平台注册地。哈萨克斯坦既是对外招募的主要来源地，也是华人的热门目的地。
  KZ: ["Almaty", "Astana", "Shymkent", "Karaganda", "Aktobe", "Atyrau"],
  RU: [
    "Moscow",
    "Saint Petersburg",
    "Novosibirsk",
    "Yekaterinburg",
    "Kazan",
    "Vladivostok",
  ],
  US: [
    "New York",
    "Los Angeles",
    "San Francisco",
    "Chicago",
    "Houston",
    "Seattle",
    "Boston",
    "Miami",
  ],
  GB: ["London", "Manchester", "Birmingham", "Edinburgh", "Glasgow"],
  DE: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"],
  FR: ["Paris", "Lyon", "Marseille", "Nice", "Toulouse"],
  JP: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Fukuoka", "Sapporo"],
  KR: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon"],
  SG: ["Singapore"],
  AU: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra"],
  CA: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
  AE: ["Dubai", "Abu Dhabi", "Sharjah"],
  SE: ["Stockholm", "Gothenburg", "Malmo", "Uppsala"],
  MX: ["Mexico City", "Guadalajara", "Monterrey", "Cancun"],
};

/** 某国的城市列表。国家未知或未收录时返回空数组（而不是抛错）。 */
export function citiesOf(countryCode: string): readonly string[] {
  if (!isKnownCountry(countryCode)) {
    return [];
  }
  return COUNTRY_CITIES[countryCode];
}

export function isKnownCountry(value: string): value is CountryCode {
  return (COUNTRY_CODES as readonly string[]).includes(value);
}

/**
 * 城市是否属于该国。
 *
 * 返回 `false` 的两种情形要分开看：国家本身不认识（那城市无从判断），
 * 以及国家认识但列表里没有这个城市。调用方通常只关心"这对组合能不能
 * 直接放进下拉框"，所以合并成一个布尔就够。
 */
export function isKnownCity(countryCode: string, city: string): boolean {
  return citiesOf(countryCode).includes(city);
}

/**
 * 切换国家后该保留哪个城市。
 *
 * 返回 `null` 表示"原城市不属于新国家，必须清掉"。这一条不能省：
 * 若只是换了国家而城市字段留在原值，库里就会出现
 * 「国家 = 英国，城市 = 上海」这种自相矛盾的组合 —— 而后续按国家
 * 筛选会员时，这个人会被错误地漏掉。
 */
export function cityAfterCountryChange(
  nextCountry: string,
  currentCity: string,
): string | null {
  return isKnownCity(nextCountry, currentCity) ? currentCity : null;
}
