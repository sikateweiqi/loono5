-- LOONO — 0003 partner：B2B 合作方（代理商）名册、日流水账本、活动记录。
--
-- 这三张表是 `src/types/partner.ts` 的落地。它们是**平台侧视角**：
-- 名册是全量代理商的目录，账本是可回答"某代理在 A~B 期间做了什么"的事实表。
-- 与 `agents`（代理商看自己的那一份汇总）刻意分开：那张表是视图，这张是原始账。
--
-- 设计要点
-- --------
-- * 主键用可读的 text（`pt_01`），与既有前端路由/文案里的 id 保持一致，也便于运营对账。
-- * 日账本主键 `(partner_id, date)` —— 同一天同一代理只有一行，天然幂等，重跑不会重复计数。
-- * 金额用 numeric 而不是 float：这是钱，浮点误差会在聚合对账时变成事故。
-- * 活动标题是三语 jsonb：活动由合作伙伴用自己的语言撰写，不能放进 UI 消息包（PRD 要求随身携带）。

create table if not exists public.partners (
  id           text primary key,
  name         text not null,
  account      text unique not null,
  tier         text not null check (tier in ('online', 'city', 'country', 'shareholder')),
  -- 分成比例 0..1，对应合作方案的线上 50% / 城市省级 60% / 国家 70% / 股东 75%。
  share        numeric(4, 3) not null check (share >= 0 and share <= 1),
  region       text not null default '',
  country_code text not null default '',
  ref_code     text,
  joined_at    date not null,
  status       text not null default 'active'
               check (status in ('active', 'onboarding', 'paused')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists partners_status_idx on public.partners (status);
create index if not exists partners_tier_idx on public.partners (tier);

/* ─────────────────────────────── 日流水账本 ─────────────────────────────── */

create table if not exists public.partner_daily_records (
  partner_id    text not null references public.partners (id) on delete cascade,
  date          date not null,
  gross         numeric(12, 2) not null default 0,
  commission    numeric(12, 2) not null default 0,
  signups       integer not null default 0,
  paying        integer not null default 0,
  active        integer not null default 0,
  conversations integer not null default 0,
  primary key (partner_id, date)
);

-- 趋势图与区间汇总都是"某代理按时间取一段"，这个索引直接服务。
create index if not exists partner_daily_records_date_idx
  on public.partner_daily_records (date);

/* ──────────────────────────────── 活动记录 ─────────────────────────────── */

create table if not exists public.partner_activities (
  id         text primary key,
  partner_id text not null references public.partners (id) on delete cascade,
  kind       text not null
             check (kind in ('campaign', 'offline', 'webinar', 'content', 'referral')),
  title      jsonb not null,
  city       text not null default '',
  start_at   date not null,
  end_at     date not null,
  signups    integer not null default 0,
  commission numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  check (end_at >= start_at)
);

-- 区间重叠判定：活动窗口与查询窗口相交。
create index if not exists partner_activities_window_idx
  on public.partner_activities (partner_id, start_at, end_at);

create index if not exists partner_activities_title_idx
  on public.partner_activities using gin (title);

drop trigger if exists partners_touch_updated_at on public.partners;
create trigger partners_touch_updated_at
  before update on public.partners
  for each row
  execute function public.touch_updated_at();

/* ───────────────────────── 名册汇总视图（运营台用）──────────────────────── */

/*
  把"每个代理的累计口径"固化成视图。算子台原来在应用层用 mock 现算，
  现在直接一条 SQL 拿到；区间查询仍然走 `partner_daily_records` 的按日聚合。
*/
create or replace view public.partner_roster as
select
  p.id,
  p.name,
  p.account,
  p.tier,
  p.share,
  p.region,
  p.country_code,
  p.ref_code,
  p.joined_at,
  p.status,
  coalesce(sum(r.gross), 0)::numeric(14, 2)      as lifetime_gross,
  coalesce(sum(r.commission), 0)::numeric(14, 2) as lifetime_commission,
  coalesce(sum(r.signups), 0)::integer           as lifetime_signups,
  count(r.date)::integer                         as days_on_book
from public.partners p
left join public.partner_daily_records r on r.partner_id = p.id
group by p.id;
