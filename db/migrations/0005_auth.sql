-- LOONO — 0005 auth：手机号 / 邮箱双通道注册与登录。
--
-- 背景
-- ----
-- 0001 里的 `users` 只有 `phone` 一列，注册页因此只能是"手机号 + 验证码"一条通道，
-- 而且登录与注册合并在同一个表单里 —— 落地页写着"免费注册"，点进来却是"欢迎回来"。
-- 这个迁移把身份模型补齐，让注册页可以做成「手机号 / 邮箱」二选一。
--
-- 设计取舍
-- --------
--   * 邮箱一律以**小写**入库。大小写不敏感是邮箱的通用约定，把规范化放在
--     应用层（lib/db/auth.ts 的 normalizeEmail）而不是 lower() 表达式索引里，
--     好处是这一层能被单元测试直接覆盖，也让"库里存的就是规范形式"这件事成立。
--   * `users.phone` 与 `users.email` **各自唯一、都允许为空**。这两条不变量由
--     数据库兜底而不是应用层自觉：
--       - 同一个手机号不可能属于两个账号（unique 约束）
--       - 同一个邮箱不可能属于两个账号（unique 约束）
--       - 但一个账号可以只有手机号（还没绑邮箱），或者只有邮箱（哈国用户常见）
--     应用层在注册前会先查一次给出友好提示，约束则负责挡住并发下的竞态。
--   * 验证码单独一张表，而不是塞进 `users`。验证码是**一次性、会过期、会重发**的
--     短期数据，与账号生命周期无关；分开才能保留"什么时候发过、有没有被消费"的
--     审计线索，也才能在用户还没成为账号时先给一个匿名访客发码。
--   * `phone_verified_at` / `email_verified_at` 与"标识本身"分开记录。有手机号
--     不等于验证过手机号；将来做"改绑"时，新标识先写入、验证通过才盖时间戳。
--
-- 幂等：全部语句都是 `if not exists` 形式，可重复执行。

/* ───────────────────────── users：补齐邮箱通道 ───────────────────────────── */

alter table public.users add column if not exists email text;
alter table public.users add column if not exists phone_verified_at timestamptz;
alter table public.users add column if not exists email_verified_at timestamptz;

-- 用唯一索引而不是 ADD CONSTRAINT：`create index if not exists` 天然幂等，
-- 而 ADD CONSTRAINT 需要先查 pg_constraint 再决定加不加，啰嗦且容易写错。
create unique index if not exists users_email_key on public.users (email);

comment on column public.users.email is
  '登录邮箱，一律小写入库。与 phone 各自唯一、都允许为空（单通道账号是合法的）。';

/* ────────────────────────── verification_codes ─────────────────────────── */

/*
  code 目前**明文存储**，因为原型阶段验证码要直接回显在页面上让人能登录
  （本机没有短信网关也没有邮件服务）。接入真实服务商时，这一列应改为
  加盐哈希并去掉回显 —— 也就是说，这是一个"上线前必须改"的地方，
  所以在这里用注释固定下来，而不是靠人记得。
*/
create table if not exists public.verification_codes (
  id          bigserial primary key,
  -- 发送通道。两条通道共享同一张表，校验时按 (channel, destination) 定位。
  channel     text not null check (channel in ('sms', 'email')),
  -- 归一化后的收件地址：手机号是去分隔符的 E.164 风格串，邮箱是小写。
  destination text not null,
  code        text not null,
  -- 注册与登录分开发码，避免"在注册页拿到的码"被拿去登录另一个账号。
  purpose     text not null default 'signup'
              check (purpose in ('signup', 'signin')),
  expires_at  timestamptz not null,
  -- 一次性凭据的核心：消费过就不能再用。置位而不是删除，保留审计痕迹。
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 取码永远是"按通道+地址+用途拿最新一条"，这个复合索引正好覆盖该访问路径，
-- 也让 60 秒重发冷却的检查不必扫表。
create index if not exists verification_codes_lookup_idx
  on public.verification_codes (channel, destination, purpose, created_at desc);

-- 清理过期码时按时间扫，单独给它一个索引。
create index if not exists verification_codes_expiry_idx
  on public.verification_codes (expires_at);

comment on table public.verification_codes is
  '一次性验证码。原型阶段 code 明文存储并回显在页面上（本机没有短信/邮件服务）；上线前必须改为加盐哈希 + 真实发送通道。';
