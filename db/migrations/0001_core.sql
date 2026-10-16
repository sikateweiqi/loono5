-- LOONO — 0001 core：身份、会员档案、扩展属性、征友条件、认证徽章、套餐与订阅、代理商与结算。
--
-- 这是从 `supabase/migrations/0001~0005` 移植到**纯 PostgreSQL** 的版本：
--   * 去掉 `auth.users` 外键与 `auth.uid()` 依赖 → 改用自建 `users` 表，`profiles.user_id` 指向它
--   * 去掉全部 RLS 策略与 `anon` / `authenticated` 角色授权 → 数据库只信任服务端，
--     鉴权回到应用层（Next.js 的 server actions / route handlers），这是自建 PG 的标准做法
--   * 保留原有的触发器（业务不变量），它们与 Supabase 无关
--
-- 幂等：所有语句都是 `if not exists` 形式，可重复执行。
--
-- 身份模型
-- --------
-- `users` 是登录身份（手机号），`profiles` 是会员（目录条目）。
-- 两者一对零一：目录里的 Mei、Sofia 这些展示型会员**只有 profile 没有 user**，
-- 这正是"你拉黑的那个人"能成立的前提。`profiles.user_id` 可空。

create extension if not exists pgcrypto;

/* ──────────────────────────────── users ─────────────────────────────────── */

create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  phone        text unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

/* ─────────────────────────────── profiles ───────────────────────────────── */

/*
  `handle` 是稳定的应用层标识（目录里的 `u_01` 等），种子脚本靠它做幂等 upsert。
  `age` 不存列，由 `birth_date` 现算（见 src/lib/db/members.ts），避免年龄随时间失真。
*/
create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references public.users (id) on delete cascade,
  handle         text unique not null,
  -- 这是谁：普通会员 / 机构型账号（代理商）/ 只用于推荐列表的存根。
  -- 目录页只读 kind = 'member'，B2C 界面因此天然不可能出现代理机构字样。
  kind           text not null default 'member'
                 check (kind in ('member', 'agency', 'referral_stub', 'system')),
  display_name   text not null default '',
  avatar_url     text,
  gender         text check (gender in ('male', 'female')),
  birth_date     date,
  city           text,
  country_code   text,
  bio            text,
  interests      text[] not null default '{}',
  photo_urls     text[] not null default '{}',
  level          smallint not null default 1 check (level between 1 and 4),
  kyc_status     text not null default 'unverified'
                 check (kyc_status in ('unverified', 'pending', 'approved', 'rejected')),
  is_online      boolean not null default false,
  last_active_at timestamptz,
  phone          text,
  -- 邀请归因：ref_code 是注册链接里的码，referred_by 解析出来的上级 profile。
  ref_code       text unique,
  referred_by    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.profiles.ref_code is
  '邀请链接 ?ref= 里携带的码，注册时一次性写入且不可变。';

-- 手机号是把登录身份对应到既有 profile 的键。
create index if not exists profiles_phone_idx on public.profiles (phone);
create index if not exists profiles_level_idx on public.profiles (level);
-- 目录页按 kind 过滤（只显示普通会员），这个索引是目录查询的第一道。
create index if not exists profiles_kind_idx on public.profiles (kind, level);
-- 目录按国家/城市筛，这两个索引直接服务 catalog 页。
create index if not exists profiles_country_idx on public.profiles (country_code);

/* ─────────────────── profile_attributes（P1 完善个人信息）──────────────────── */

/*
  与 profiles 一对一。独立成表而不是堆进 profiles，是因为这 13 个字段
  会持续增删（PRD 里 P 模块还在迭代），拆出来可以整表重建而不动目录主表。
*/
create table if not exists public.profile_attributes (
  profile_id     uuid primary key references public.profiles (id) on delete cascade,
  height_cm      smallint check (height_cm between 120 and 250),
  education      text,
  languages      text[] not null default '{}',
  religion       text,
  tattoo         text,
  smoking        text,
  drinking       text,
  asset_range    text,
  children       text,
  marital_status text,
  occupation     text not null default '',
  country_code   text not null default '',
  city           text not null default '',
  updated_at     timestamptz not null default now()
);

/* ─────────────────── partner_preferences（P1–P4 征友条件）────────────────── */

create table if not exists public.partner_preferences (
  profile_id   uuid primary key references public.profiles (id) on delete cascade,
  age_min      smallint,
  age_max      smallint,
  height_min   smallint,
  height_max   smallint,
  education    text[] not null default '{}',
  languages    text[] not null default '{}',
  religions    text[] not null default '{}',
  no_tattoo    boolean not null default false,
  children     text[] not null default '{}',
  asset_min    text,
  countries    text[] not null default '{}',
  cities       text[] not null default '{}',
  smoking      text,
  drinking     text,
  -- P4 单独计费的条件码。
  exclusive    text[] not null default '{}',
  updated_at   timestamptz not null default now()
);

/* ─────────────────── verification_badges（R 模块认证徽章）────────────────── */

/*
  一个会员每种徽章一行。状态机 approved/expired/revoked 在应用层驱动，
  但过期时间由 validity_months 在库里算好，便于直接筛"即将到期"。
*/
create table if not exists public.verification_badges (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  code        text not null,
  status      text not null default 'unverified'
              check (status in ('unverified', 'pending', 'approved', 'rejected', 'expired', 'revoked')),
  verified_at timestamptz,
  expires_at  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (profile_id, code)
);

create index if not exists verification_badges_code_idx
  on public.verification_badges (code, status);

/* ───────────────────────── plans / subscriptions ─────────────────────────── */

/*
  价格进库而不是写死在代码里，是 PRD P6「按国家/币种配置」的前提。
  `price_monthly` 可空 —— level 4 是邀约制，页面显示"联系顾问"。
*/
create table if not exists public.plans (
  level            smallint primary key check (level between 1 and 4),
  price_monthly    numeric(10, 2),
  price_yearly     numeric(10, 2),
  currency         text not null default 'USD',
  is_contact_sales boolean not null default false,
  sort_order       smallint not null default 0
);

create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  status          text not null check (status in ('none', 'trialing', 'active', 'expired')),
  level           smallint check (level between 1 and 4),
  started_at      timestamptz,
  expires_at      timestamptz,
  is_trial        boolean not null default false,
  scheduled_level smallint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 一个会员同时只有一条当前订阅；历史留在表里，靠这个唯一索引保证"当前"唯一。
create unique index if not exists subscriptions_current_key
  on public.subscriptions (profile_id)
  where status in ('trialing', 'active');

/* ─────────────────────── promo_codes / agents / payouts ──────────────────── */

create table if not exists public.promo_codes (
  code       text primary key,
  profile_id uuid references public.profiles (id) on delete cascade,
  level      smallint not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at    timestamptz
);

create table if not exists public.agents (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid unique not null references public.profiles (id) on delete cascade,
  level           text not null default 'base' check (level in ('base', 'pro', 'vip')),
  -- 每笔付款的分成比例，0..1。
  commission_rate numeric(4, 3) not null default 0.5
                  check (commission_rate >= 0 and commission_rate <= 1),
  joined_at       timestamptz not null default now()
);

create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  amount       numeric(12, 2) not null check (amount > 0),
  currency     text not null default 'USD',
  method       text not null check (method in ('wechat', 'alipay', 'bank')),
  account      text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'processing', 'paid', 'rejected')),
  requested_at timestamptz not null default now(),
  settled_at   timestamptz
);

create index if not exists payouts_profile_idx on public.payouts (profile_id, requested_at desc);

/* ─────────────────── ref_code 生成与不可变（移植自 0002）─────────────────── */

/*
  8 位、32 符号、去掉易混字符（无 0/O、1/I/L、5/S、8/B、2/Z）。
  码是分享链接不是密钥，所以用 random() 而非 CSPRNG 是合适的取舍。
*/
create or replace function public.generate_ref_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRTUVWXY34679';
  candidate text;
  attempt integer := 0;
begin
  loop
    candidate := '';

    for position in 1..8 loop
      candidate := candidate
        || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.profiles where ref_code = candidate);

    attempt := attempt + 1;

    if attempt > 25 then
      raise exception 'could not generate a unique ref_code after % attempts', attempt;
    end if;
  end loop;

  return candidate;
end;
$$;

create or replace function public.profiles_assign_ref_code()
returns trigger
language plpgsql
as $$
begin
  if new.ref_code is null or btrim(new.ref_code) = '' then
    new.ref_code := public.generate_ref_code();
  else
    new.ref_code := upper(btrim(new.ref_code));
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_assign_ref_code on public.profiles;

create trigger profiles_assign_ref_code
  before insert on public.profiles
  for each row
  execute function public.profiles_assign_ref_code();

-- 码一旦发出就必须永远指向同一个人，否则已散出去的链接会静默改指向。
create or replace function public.profiles_ref_code_is_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.ref_code is distinct from old.ref_code then
    raise exception 'ref_code is assigned once and cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_ref_code_immutable on public.profiles;

create trigger profiles_ref_code_immutable
  before update on public.profiles
  for each row
  execute function public.profiles_ref_code_is_immutable();

/* ─────────────────── updated_at 自动维护（小工具）───────────────────────── */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

drop trigger if exists profile_attributes_touch_updated_at on public.profile_attributes;
create trigger profile_attributes_touch_updated_at
  before update on public.profile_attributes
  for each row
  execute function public.touch_updated_at();

drop trigger if exists partner_preferences_touch_updated_at on public.partner_preferences;
create trigger partner_preferences_touch_updated_at
  before update on public.partner_preferences
  for each row
  execute function public.touch_updated_at();
