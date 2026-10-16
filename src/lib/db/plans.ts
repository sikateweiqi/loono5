import "server-only";

import { query } from "@/lib/db/pool";
import type { Plan, UserLevel } from "@/types/user";

/**
 * 订阅套餐。
 *
 * 价格进库而不是写死在代码里，是 PRD P6「按国家/币种配置」的前提：
 * 运营调价应当是一次 UPDATE，而不是一次发版。`plans.currency` 目前统一 USD，
 * 未来按国家铺开时这张表就是新增行而不是改代码。
 */

type PlanRow = {
  level: number;
  price_monthly: string | null;
  price_yearly: string | null;
  currency: string;
  is_contact_sales: boolean;
};

export async function listPlans(): Promise<Plan[]> {
  const rows = await query<PlanRow>(
    `select level, price_monthly, price_yearly, currency, is_contact_sales
       from public.plans
      order by sort_order, level`,
  );

  return rows.map((row) => ({
    level: row.level as UserLevel,
    // numeric 在 node-postgres 里回来是字符串（避免大数精度丢失），这里显式转数字。
    priceMonthly: row.price_monthly === null ? null : Number(row.price_monthly),
    priceYearly: row.price_yearly === null ? null : Number(row.price_yearly),
    currency: row.currency,
    isContactSales: row.is_contact_sales || undefined,
  }));
}
