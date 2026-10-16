/**
 * 出生日期 → 年龄。纯函数，零依赖。
 *
 * 为什么年龄要现算而不是存一列
 * --------------------------
 * 存 age 的话，同一个人在一年里会有两个不同的年龄 —— 取决于她的档案
 * 最后一次更新是在生日之前还是之后。而"我能接受多大年龄的伴侣"
 * 是每次查询都要用的条件，一个会静止的年龄会让匹配结果慢慢失真。
 * 所以库里只有 `birth_date`（见 db/migrations/0001_core.sql），年龄每次现算。
 *
 * 为什么不复用 `date_part('year', age(birth_date))`（数据层用的是那句）
 * --------------------------------------------------------------
 * 数据层要的是"从库里筛出来的人"，直接在 SQL 里算最省一次往返；
 * 而这里要判断的是"用户刚在表单里敲的日期"，那个值还没进库。
 * 两处的口径必须一致，所以这段逻辑单独成一个模块，便于用脚本对照验证。
 */

export const PROFILE_AGE_MIN = 18;
export const PROFILE_AGE_MAX = 80;

/**
 * `yyyy-mm-dd` → 周岁年龄；格式或日期不合法返回 null。
 *
 * 用 UTC 构造再比较：`Date.UTC` 不受运行环境时区影响，
 * 而 `new Date(y, m - 1, d)` 是本地零点 —— 后者会让"生日当天刚好满 18 岁"
 * 的用户在部分时区被拒，而拒绝的理由（年龄不足）看起来完全不合理。
 */
export function ageFromIsoDate(value: string, now = new Date()): number | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  const asUtc = new Date(Date.UTC(year, month - 1, day));

  // 反查一遍：`2023-02-31` 能通过正则，但 `Date` 会把它悄悄进到 3 月 3 日。
  // 不查这一下，用户填一个不存在的日期会被当成某个真实日期存下去。
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day
  ) {
    return null;
  }

  let age = now.getUTCFullYear() - year;

  const beforeBirthday =
    now.getUTCMonth() < month - 1 ||
    (now.getUTCMonth() === month - 1 && now.getUTCDate() < day);

  if (beforeBirthday) {
    age -= 1;
  }

  return age;
}
