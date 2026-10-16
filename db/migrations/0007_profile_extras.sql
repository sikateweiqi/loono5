-- LOONO — 0007 profile extras：档案属性补齐体重。
--
-- 0001 里 `profile_attributes` 有 `height_cm`，但漏了体重 —— 而体重是
-- 择偶条件里与身高成对出现的一项（P1 属性表里本来就有）。
--
-- 区间为什么给到 25–250 而不是界面上滑动的 35–150：
-- 数据库的约束负责挡住**明显不是体重**的值（比如 1 或 9999），
-- 界面负责给出合理的可选范围。把界面的边界抄进 check 里，
-- 以后想放宽滑块就得改表结构，而改表比改一个常量贵得多。
--
-- 幂等：`add column if not exists`。check 约束由 Postgres 自动命名，
-- 被 `if not exists` 保护后重复执行不会叠加出第二条同名约束。

alter table public.profile_attributes
  add column if not exists weight_kg smallint
  check (weight_kg is null or weight_kg between 25 and 250);

comment on column public.profile_attributes.weight_kg is
  '体重（公斤）。与身高一样属于敏感信息，只参与匹配计算，不公开展示。';
