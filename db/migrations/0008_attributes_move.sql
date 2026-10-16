-- LOONO — 0008 attributes move：居住地收敛到 profiles，兴趣与自我介绍改由第二步写入。
--
-- 两件事，都是 2026-10-16 那次表单重排的配套改动：
--
-- 1. 删除 `profile_attributes.country_code` / `city`
-- ------------------------------------------------
-- 这两列与 `profiles.country_code` / `profiles.city` **完全重复**，
-- 而且已经造成过真实故障：读取时写的是
-- `attr_country_code ?? country_code ?? ""`（属性表优先、主表兜底），
-- 但属性表的列是 `not null default ''` —— 会员只要保存过一次第二步而没填
-- 居住地，属性表里躺的就是**空串**。空串不是 null，`??` 不会回退，
-- 于是主表里填好的居住地在页面上变成空白。
--
-- 现在居住地只有一个来源：`profiles`，由注册第一步（`saveProfileBasics`）
-- 写入。属性表那两列的读者已全部改掉（`src/lib/db/members.ts` 的
-- `MEMBER_COLUMNS` / `toProfile` / `saveProfileAttributes`），所以可以删。
--
-- 数据不丢：这次迁移前，两处要么同值、要么属性表是空串，
-- `profiles` 上的值始终是更可信的一份。
--
-- 2. 给 `profiles.interests` / `bio` 补注释
-- ---------------------------------------
-- 两列本来就有（0001 就建好了），只是本轮把它们的**填写位置**从第一步
-- 挪到了第二步。列不动，只补上说明，免得后来人以为第二步有独立存储。
--
-- 幂等：`drop column if exists`；comment 重复执行结果相同。

alter table public.profile_attributes
  drop column if exists country_code,
  drop column if exists city;

comment on column public.profiles.interests is
  '兴趣标签。注册第二步「个人属性」采集（saveProfileAttributes），值取自 lib/profile-options.ts 的 INTERESTS 词表。';

comment on column public.profiles.bio is
  '自我介绍，最多 500 字。注册第二步「个人属性」采集，与 interests 同一次提交写入。';

comment on column public.profiles.country_code is
  '居住国家（ISO 3166-1 alpha-2）。由注册第一步「完善个人资料」写入，是全站唯一的居住地来源。';

comment on column public.profiles.city is
  '居住城市。取值来自 lib/geo.ts 的 COUNTRY_CITIES，为语言中立的拉丁专名（如 Shanghai）。';

comment on column public.profiles.display_name is
  '真实姓名。2026-10-16 起该字段由「昵称」改为采集真实姓名（校验见 lib/profile/name.ts）；法定姓名另在实名认证步骤采集。';
