import type { AuthChannel } from "@/lib/auth/channels";

/**
 * 登录标识的归一化。
 *
 * 放在这里而不是 `lib/db/auth.ts` 里，是为了让**客户端表单**也能用同一套规则
 * 做即时校验：用户在输入框里打错邮箱，应该当场看到提示，而不是提交一轮才知道。
 * 两边共用同一个函数，也就不会出现"前端说没问题、后端说不合法"的分裂。
 *
 * 这一层是纯函数、零依赖 —— 不碰数据库、不读 cookie、不引 server-only。
 *
 * 为什么必须归一化
 * ----------------
 * 库里存的、查询时比的，必须是**同一个串**。如果注册时存了
 * `+86 138 0000 0000`，登录时用户输入 `+8613800000000`，
 * 两条 SQL 就会认为这是两个人 —— 于是同一个手机号能注册出两个账号。
 * 唯一约束此时帮不上忙，因为约束眼里它们确实是两个不同的值。
 */

export interface NormalizedIdentifier {
  channel: AuthChannel;
  /** 归一化后的值：手机号去掉空格/横线/括号，邮箱转小写。 */
  value: string;
}

/**
 * 手机号规范化。
 *
 * 按**数字位数**而不是原串长度校验：国际号码带空格、横线、括号，
 * 而 E.164 把数字部分封顶在 15 位。`+86 138 0000 0000` 与
 * `+8613800000000` 归一化后必须是同一个串。
 *
 * 保留前导 `+`（它表示"这是带国家码的国际号码"），其余非数字一律丢弃。
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();

  if (!/^[+\d\s()-]+$/.test(trimmed)) {
    return null;
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length < 6 || digits.length > 15) {
    return null;
  }

  return hasPlus ? `+${digits}` : digits;
}

/**
 * 邮箱规范化。
 *
 * 只做小写化与去空格，**不做** Gmail 那套"点号等价"的猜测：
 * 那些规则是特定服务商的实现细节，按它归一化会把两个合法但不同的邮箱
 * 合并成同一个账号，而用户本人无从知晓。
 *
 * 正则刻意宽松：邮箱真正的正确性只能靠发一封信来证明，
 * 拦得越严越容易把合法地址挡在门外（比如 `user+tag@sub.domain.co`）。
 */
export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/** 按通道归一化，失败返回 null（由调用方转成表单错误）。 */
export function normalizeIdentifier(
  channel: AuthChannel,
  raw: string,
): NormalizedIdentifier | null {
  const value = channel === "sms" ? normalizePhone(raw) : normalizeEmail(raw);

  return value ? { channel, value } : null;
}

/** 给界面用的轻量提示：只判断"看起来是不是这个通道的标识"。 */
export function looksValid(channel: AuthChannel, raw: string): boolean {
  return normalizeIdentifier(channel, raw) !== null;
}
