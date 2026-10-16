-- LOONO — 0004 ledger：会员付款流水（只追加账本）。
--
-- 为什么单独一张表而不是在 profiles 上挂几个汇总字段
-- --------------------------------------------------
-- 分成、返佣、代理收益全都从"谁在什么时候付了多少钱"推导。
-- 一旦把这些数字就地累加到某个字段上，任何一次重算、退款或回滚都会让账对不上，
-- 而且无法审计。正确形态是：账本只追加，余额靠重放流水得出（视图/查询即时算）。
--
-- `commission_amount` 是**付款当时**按当时比例算出来并冻结的，
-- 不是查询时用当前比例重算 —— 否则运营调整分成比例会改写历史账。

create table if not exists public.member_payments (
  id                uuid primary key default gen_random_uuid(),
  -- 付款的会员。
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  amount            numeric(12, 2) not null check (amount > 0),
  currency          text not null default 'USD',
  plan_level        smallint check (plan_level between 1 and 4),
  channel           text not null default 'card'
                    check (channel in ('card', 'alipay', 'wechat', 'bank', 'promo')),
  -- 归因上级（代理商或普通推荐人）；无归因时为 null。
  agent_profile_id  uuid references public.profiles (id) on delete set null,
  -- 付款当时的分成比例与金额，冻结入账。
  commission_rate   numeric(4, 3) check (commission_rate >= 0 and commission_rate <= 1),
  commission_amount numeric(12, 2),
  paid_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists member_payments_agent_idx
  on public.member_payments (agent_profile_id, paid_at desc);

create index if not exists member_payments_profile_idx
  on public.member_payments (profile_id, paid_at desc);

/* ─────────────────────── 只追加：禁止改写历史 ───────────────────────────── */

/*
  账本一旦写入就不能更新或删除。冲正靠追加一条反向流水，而不是改旧行。
  这条约束由数据库强制，应用层写错也改不动。
*/
create or replace function public.member_payments_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'member_payments is append-only: write a reversing entry instead'
    using errcode = '42501';
end;
$$;

drop trigger if exists member_payments_immutable on public.member_payments;

create trigger member_payments_immutable
  before update or delete on public.member_payments
  for each row
  execute function public.member_payments_append_only();

/* ─────────────────── 代理收益汇总（从账本重放，不落表）────────────────────── */

/*
  代理商看自己的那份汇总：累计、本月、待结算。
  `pending` 由"已计提未打款"得出 —— 未结算佣金 = 累计佣金 - 已打款（含处理中）。
*/
create or replace view public.agent_earnings as
select
  a.profile_id,
  count(mp.id)::integer                                   as payment_count,
  coalesce(sum(mp.commission_amount), 0)::numeric(14, 2)  as total_earnings,
  coalesce(sum(mp.commission_amount)
           filter (where mp.paid_at >= date_trunc('month', now())), 0)::numeric(14, 2)
                                                          as month_earnings,
  max(mp.paid_at)                                         as last_payment_at
from public.agents a
left join public.member_payments mp on mp.agent_profile_id = a.profile_id
group by a.profile_id;

create or replace view public.agent_payout_totals as
select
  p.profile_id,
  coalesce(sum(p.amount) filter (where p.status in ('processing', 'paid')), 0)::numeric(14, 2)
    as withdrawn,
  coalesce(sum(p.amount) filter (where p.status = 'processing'), 0)::numeric(14, 2)
    as in_flight
from public.payouts p
group by p.profile_id;
