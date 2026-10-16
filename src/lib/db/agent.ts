import "server-only";

import { promoCodeExpiry } from "@/lib/agent";
import { query, queryOne } from "@/lib/db/pool";
import type {
  Agent,
  AgentLevel,
  AgentStats,
  Payout,
  PayoutMethod,
  PayoutStatus,
  PromoCode,
  Referral,
} from "@/types/agent";

/**
 * 代理商看自己那一份：档案、汇总统计、被推荐人、出款、促销码。
 *
 * 为什么这里"只查不记账"
 * ----------------------
 * 佣金账本 `member_payments` 是**只追加**的：行一旦写入就不可更新、不可删除，
 * 冲正靠再追加一条反向流水，而不是改旧行。所以累计收益、本月收益、待结算
 * 这些余额都不是存在某个字段里的数字，而是每次从流水**重放**出来的 ——
 * 累计/本月直接落到视图 `agent_earnings`，待结算再由「累计佣金 − 已打款」
 * 现算。这样调整分成比例、退款、冲正都不会让历史账对不上，也随时可审计。
 *
 * 本次查询只服务"代理商本人"这一个账户，不涉及名册；平台侧的全量视角
 * 在 `lib/db/partner.ts`，两者在库里也是分开的表。
 */

/* ─────────────────────────── 行类型（snake_case）─────────────────────────── */

/*
  `numeric` 列在 node-postgres 里默认是**字符串**（避免二进制浮点丢精度），
  所以金额字段都按 string 收，再由 toNumber 收口成 number。
  时间列（joined_at / requested_at…）是 timestamptz，按 Date 收再 toISOString。
*/
type AgentRow = {
  id: string;
  profile_id: string;
  level: string;
  commission_rate: string;
  joined_at: Date;
  ref_code: string | null;
};

type EarningsRow = {
  total_earnings: string;
  month_earnings: string;
};

type PayoutTotalsRow = {
  withdrawn: string;
};

type ReferralRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: Date;
  sub_status: string | null;
  sub_level: number | null;
  earnings: string;
};

type PayoutRow = {
  id: string;
  amount: string;
  currency: string;
  method: string;
  account: string;
  status: string;
  requested_at: Date;
  settled_at: Date | null;
};

type PromoCodeRow = {
  code: string;
  level: number;
  created_at: Date;
  expires_at: Date | null;
  used_at: Date | null;
};

/* ─────────────────────────────── 小工具 ─────────────────────────────── */

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ─────────────────────────────── 子查询 ─────────────────────────────── */

/** 被推荐人：一行一人，nickname 就是 display_name（stub 与真人都已按需脱敏）。 */
async function listReferrals(profileId: string): Promise<Referral[]> {
  const rows = await query<ReferralRow>(
    `select
       p.id,
       p.display_name,
       p.avatar_url,
       p.created_at,
       s.status as sub_status,
       s.level  as sub_level,
       coalesce((
         select sum(mp.commission_amount)
           from public.member_payments mp
          where mp.agent_profile_id = $1
            and mp.profile_id = p.id
       ), 0) as earnings
     from public.profiles p
     left join public.subscriptions s
            on s.profile_id = p.id and s.status in ('trialing', 'active')
      where p.referred_by = $1
      order by p.created_at desc`,
    [profileId],
  );

  return rows.map((row) => {
    const subscribed = row.sub_status !== null;

    return {
      id: row.id,
      nickname: row.display_name,
      avatarUrl: row.avatar_url,
      joinedAt: row.created_at.toISOString(),
      subscribed,
      // 未订阅时不该暴露档位，与原型一致（null 表示"还没买"）。
      level: subscribed ? row.sub_level : null,
      earnings: toNumber(row.earnings),
    };
  });
}

async function listPayouts(profileId: string): Promise<Payout[]> {
  const rows = await query<PayoutRow>(
    `select id, amount, currency, method, account, status, requested_at, settled_at
       from public.payouts
      where profile_id = $1
      order by requested_at desc`,
    [profileId],
  );

  return rows.map((row) => ({
    id: row.id,
    amount: toNumber(row.amount),
    currency: row.currency,
    method: row.method as PayoutMethod,
    account: row.account,
    status: row.status as PayoutStatus,
    requestedAt: row.requested_at.toISOString(),
    settledAt: row.settled_at?.toISOString() ?? null,
  }));
}

async function listPromoCodes(profileId: string): Promise<PromoCode[]> {
  const rows = await query<PromoCodeRow>(
    `select code, level, created_at, expires_at, used_at
       from public.promo_codes
      where profile_id = $1
      order by created_at desc`,
    [profileId],
  );

  return rows.map((row) => ({
    code: row.code,
    // PRD rule 3：代理商生成的码一律 1 档，不跟随库里可能被改过的 level。
    level: 1,
    createdAt: row.created_at.toISOString(),
    // 库允许 expires_at 为空；缺省时按 30 天 TTL 兜底，而不是留一个空串。
    expiresAt: row.expires_at?.toISOString() ?? promoCodeExpiry(row.created_at),
    usedAt: row.used_at?.toISOString() ?? null,
  }));
}

/* ─────────────────────────────── 读取接口 ─────────────────────────────── */

/**
 * 当前代理商看板的全部数据。
 *
 * `agent` 刻意可空：当前会员没有 `agents` 行时（不是合作方），这里不抛错，
 * 而是返回一个空看板，让页面能渲染明确的空状态 ——
 * 伪造一份零值 Agent 等于谎称对方是合作方，比空状态更糟。
 */
export interface AgentDashboard {
  agent: Agent | null;
  referrals: Referral[];
  payouts: Payout[];
  promoCodes: PromoCode[];
}

export async function getAgentDashboard(
  profileId: string,
): Promise<AgentDashboard> {
  const agentRow = await queryOne<AgentRow>(
    `select a.id, a.profile_id, a.level, a.commission_rate, a.joined_at, p.ref_code
       from public.agents a
       join public.profiles p on p.id = a.profile_id
      where a.profile_id = $1`,
    [profileId],
  );

  if (!agentRow) {
    return { agent: null, referrals: [], payouts: [], promoCodes: [] };
  }

  const [referrals, earningsRow, payoutTotalsRow, payouts, promoCodes] =
    await Promise.all([
      listReferrals(profileId),
      queryOne<EarningsRow>(
        `select total_earnings, month_earnings
           from public.agent_earnings
          where profile_id = $1`,
        [profileId],
      ),
      queryOne<PayoutTotalsRow>(
        `select withdrawn
           from public.agent_payout_totals
          where profile_id = $1`,
        [profileId],
      ),
      listPayouts(profileId),
      listPromoCodes(profileId),
    ]);

  const totalEarnings = toNumber(earningsRow?.total_earnings);
  const thisMonthEarnings = toNumber(earningsRow?.month_earnings);
  const withdrawn = toNumber(payoutTotalsRow?.withdrawn);

  const totalInvitees = referrals.length;
  const activeInvitees = referrals.filter(
    (referral) => referral.subscribed,
  ).length;

  const stats: AgentStats = {
    totalEarnings,
    thisMonthEarnings,
    // 待结算 = 账本重放出的累计佣金 − 已打款（含处理中）。
    pendingPayout: round2(totalEarnings - withdrawn),
    totalInvitees,
    activeInvitees,
    conversionRate: totalInvitees > 0 ? activeInvitees / totalInvitees : 0,
  };

  const refCode = agentRow.ref_code ?? "";

  const agent: Agent = {
    id: agentRow.id,
    // 用 profile.id 而不是 profiles.user_id：全站的身份主键是 profile，
    // 且机构型账号（user_id 可空）也要能是代理商。
    userId: agentRow.profile_id,
    level: agentRow.level as AgentLevel,
    commissionRate: toNumber(agentRow.commission_rate),
    refCode,
    refLink: `https://loono.app/auth/register?ref=${refCode}`,
    joinedAt: agentRow.joined_at.toISOString(),
    stats,
  };

  return { agent, referrals, payouts, promoCodes };
}
