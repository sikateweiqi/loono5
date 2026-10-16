import "server-only";

import { query, queryOne } from "@/lib/db/pool";
import type {
  LocalizedText,
  PartnerActivity,
  PartnerActivityKind,
  PartnerDailyRecord,
  PartnerProfile,
  PartnerStatus,
  PartnerTier,
} from "@/types/partner";

/**
 * 平台侧算子台：合作方名册、逐日流水账本、活动记录。
 *
 * 与 `lib/db/agent.ts` 的分工是刻意的：那是"代理商看自己"（一份、已汇总），
 * 这是"运营看全体"（名册 + 任意区间的事实表）。库里也是分开的两组表，
 * 这里的查询只读，不承担任何分成计算 —— 分成在写入流水时就已经冻结。
 *
 * 所有 `date` 列都在 SQL 里 `to_char(..., 'YYYY-MM-DD')` 成字符串再返回：
 * node-postgres 会把 `date` 解析成**本地时区**午夜的 Date，若再 `toISOString()`
 * 会在非 UTC 机器上整整差一天，而区间比较用的正是这种"纯日期"字符串。
 * 直接在查询里定形，调用方无需再关心时区。
 */

/* ─────────────────────────── 行类型（snake_case）─────────────────────────── */

/*
  金额列是 `numeric` —— node-postgres 默认返回字符串（不丢精度），统一走 toNumber。
  日期列已由 to_char 定形成 `YYYY-MM-DD` 字符串。
*/
type PartnerRow = {
  id: string;
  name: string;
  account: string;
  tier: string;
  share: string;
  region: string;
  country_code: string;
  ref_code: string | null;
  joined_at: string;
  status: string;
};

type DailyRecordRow = {
  partner_id: string;
  date: string;
  gross: string;
  commission: string;
  signups: number;
  paying: number;
  active: number;
  conversations: number;
};

type ActivityRow = {
  id: string;
  partner_id: string;
  kind: string;
  title: unknown;
  city: string;
  start_at: string;
  end_at: string;
  signups: number;
  commission: string;
};

/** 名册与详情的公共列；日期列在此统一定形。 */
const PARTNER_COLUMNS = `
  id,
  name,
  account,
  tier,
  share,
  region,
  country_code,
  ref_code,
  to_char(joined_at, 'YYYY-MM-DD') as joined_at,
  status
`;

/* ─────────────────────────────── 映射 ─────────────────────────────── */

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function toPartner(row: PartnerRow): PartnerProfile {
  return {
    id: row.id,
    name: row.name,
    account: row.account,
    tier: row.tier as PartnerTier,
    share: toNumber(row.share),
    region: row.region,
    countryCode: row.country_code,
    refCode: row.ref_code ?? "",
    joinedAt: row.joined_at,
    status: row.status as PartnerStatus,
  };
}

/**
 * jsonb 标题列不会经过数据库的 CHECK，理论上可能缺语种；
 * 这里补成三语齐全的 LocalizedText，缺哪就用空串，避免渲染层再判空。
 */
function toLocalizedText(value: unknown): LocalizedText {
  const source = (value ?? {}) as Record<string, unknown>;

  return {
    zh: typeof source.zh === "string" ? source.zh : "",
    en: typeof source.en === "string" ? source.en : "",
    ru: typeof source.ru === "string" ? source.ru : "",
  };
}

/* ─────────────────────────────── 读取接口 ─────────────────────────────── */

/** 全量名册（按 id 排序，与运营对账时的阅读顺序一致）。 */
export async function listPartners(): Promise<PartnerProfile[]> {
  const rows = await query<PartnerRow>(
    `select ${PARTNER_COLUMNS} from public.partners order by id`,
  );

  return rows.map(toPartner);
}

/** 单个合作方；不存在时返回 null（页面据此显示"未选中/已下线"）。 */
export async function findPartner(id: string): Promise<PartnerProfile | null> {
  const row = await queryOne<PartnerRow>(
    `select ${PARTNER_COLUMNS} from public.partners where id = $1`,
    [id],
  );

  return row ? toPartner(row) : null;
}

/**
 * 窗口内的逐日流水。`partnerId` 可选：
 * 算子台看总览时一次取回**全部**合作方的窗口数据（不传 partnerId），
 * 由调用方按 partnerId 分组 —— 否则就是每个合作方各查一次，典型的 N+1。
 */
export async function listDailyRecords(input: {
  partnerId?: string;
  from: string;
  to: string;
}): Promise<PartnerDailyRecord[]> {
  const params: unknown[] = [input.from, input.to];
  let partnerFilter = "";

  if (input.partnerId) {
    params.push(input.partnerId);
    partnerFilter = `and partner_id = $${params.length}`;
  }

  const rows = await query<DailyRecordRow>(
    `select
       partner_id,
       to_char(date, 'YYYY-MM-DD') as date,
       gross,
       commission,
       signups,
       paying,
       active,
       conversations
     from public.partner_daily_records
     where date between $1::date and $2::date
       ${partnerFilter}
     order by date`,
    params,
  );

  return rows.map((row) => ({
    partnerId: row.partner_id,
    date: row.date,
    gross: toNumber(row.gross),
    commission: toNumber(row.commission),
    signups: row.signups,
    paying: row.paying,
    active: row.active,
    conversations: row.conversations,
  }));
}

/**
 * 窗口内与该合作方有交集的活动。
 *
 * 判定是**区间重叠**而不是"两端都落在窗口内"：一场横跨窗口边界的活动
 * 也算命中，条件是 `start_at <= to and end_at >= from`。
 */
export async function listActivities(input: {
  partnerId: string;
  from: string;
  to: string;
}): Promise<PartnerActivity[]> {
  const { partnerId, from, to } = input;

  const rows = await query<ActivityRow>(
    `select
       id,
       partner_id,
       kind,
       title,
       city,
       to_char(start_at, 'YYYY-MM-DD') as start_at,
       to_char(end_at, 'YYYY-MM-DD') as end_at,
       signups,
       commission
     from public.partner_activities
     where partner_id = $1
       and start_at <= $2::date
       and end_at   >= $3::date
     order by start_at desc`,
    // $2 = to、$3 = from：参数的书写顺序按 SQL 里出现的先后，避免看串。
    [partnerId, to, from],
  );

  return rows.map((row) => ({
    id: row.id,
    partnerId: row.partner_id,
    kind: row.kind as PartnerActivityKind,
    title: toLocalizedText(row.title),
    city: row.city,
    startAt: row.start_at,
    endAt: row.end_at,
    signups: row.signups,
    commission: toNumber(row.commission),
  }));
}
