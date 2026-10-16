-- LOONO — 0006 password：给登录身份加密码。
--
-- 背景
-- ----
-- 0005 把注册做成了「手机号 / 邮箱 + 验证码」，没有密码。跨国场景下这是个问题：
-- 中国会员的境外号码常常收不到短信，哈萨克斯坦/欧洲会员更习惯用密码登录，
-- 而验证码通道一旦抖动，用户就完全进不来。所以密码是**必要退路**，不是可选项。
--
-- 设计取舍
-- --------
-- 1. `password_hash` 可空。已经用验证码注册过的账号（含种子数据）没有密码，
--    改成 not null 会让它们全部无法登录。代码里把「没有密码」当作一种合法状态：
--    密码登录时明确提示「该账号未设置密码，请用验证码登录」，而不是含糊地说密码错误。
-- 2. 不存盐列。scrypt 的盐是**写在哈希串里**的（`scrypt$N$r$p$salt$hash`），
--    单列即可自描述；拆成两列反而会出现「盐在、哈希丢了」这种拦不住的坏状态。
-- 3. 不存算法版本 —— 也写在同一串里（前缀）。将来换算法时，老串照样能验，
--    验过一次再用新算法重写一遍即可，不需要停机迁移。
--
-- 幂等：`add column if not exists`，可重复执行。

alter table public.users
  add column if not exists password_hash text;

comment on column public.users.password_hash is
  'scrypt 哈希串（scrypt$N$r$p$salt$hash）。为空表示该账号尚未设置密码，只能用验证码登录。';

alter table public.users
  add column if not exists password_updated_at timestamptz;

comment on column public.users.password_updated_at is
  '密码最后一次设置/修改的时间。用于将来做「改密后踢掉其它会话」与安全审计。';

-- 密码登录要按标识找到人，再验哈希。两条唯一约束（0005 建的 phone / email）
-- 已经是这个查询的索引，这里不需要再加。
