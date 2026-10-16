/**
 * 密码规则。
 *
 * 与 `identifier.ts` 一样是**纯函数、零依赖**：注册表单要在用户打字时当场
 * 给出提示，而真正的校验发生在服务端。两边用同一个函数，就不会出现
 * "前端说没问题、服务端说太弱"的分裂。
 *
 * 规则为什么是这几条
 * ------------------
 *   * 8 位起 —— 低于这个长度的口令在离线爆破面前没有意义。
 *     不设更严的复杂度要求（大小写+符号+数字），因为那只会把用户推向
 *     `Abc123!@#` 这种既难记又毫无强度的写法。
 *   * 必须同时含字母与数字 —— 挡住 `12345678` 和 `password` 这两类真实世界里
 *     占比最高的弱口令，代价是几乎不增加记忆负担。
 *   * 不能与登录标识（手机号 / 邮箱）互为子串 —— 手机号当密码是跨国场景里
 *     最常见的偷懒做法，而手机号本身在通讯录里是公开的。
 *   * 上限 128 —— 不是安全问题（scrypt 不吃长度），而是防止有人把一张图片
 *     粘进输入框，让每次登录都变成一次大字符串哈希。
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordProblem =
  "empty" | "tooShort" | "tooLong" | "tooSimple" | "sameAsIdentifier";

/** 按字符数（而非 UTF-16 码元）算长度，中文密码不会被算成两倍长。 */
function lengthOf(value: string): number {
  return Array.from(value).length;
}

/**
 * 检查一条**新设置的**密码是否合格。返回 null 表示通过。
 *
 * `identifier` 是可选的相关性检查：注册时把用户刚填的手机号/邮箱传进来，
 * 拒绝"密码就是自己手机号"这类做法。
 */
export function checkPassword(
  password: string,
  identifier?: string,
): PasswordProblem | null {
  if (password === "") {
    return "empty";
  }

  const length = lengthOf(password);

  if (length < PASSWORD_MIN_LENGTH) {
    return "tooShort";
  }

  if (length > PASSWORD_MAX_LENGTH) {
    return "tooLong";
  }

  const hasLetter = /\p{L}/u.test(password);
  const hasDigit = /\p{Nd}/u.test(password);

  if (!hasLetter || !hasDigit) {
    return "tooSimple";
  }

  if (identifier) {
    const needle = identifier.trim().toLowerCase();
    const haystack = password.toLowerCase();

    // 双向包含：既挡「密码里含手机号」，也挡「密码是手机号的一部分」
    // （有人会只截手机号后六位）。短于 4 位的标识不值得比对，
    // 否则一个两位的国家码会让大量正常密码被拒。
    if (
      needle.length >= 4 &&
      (haystack.includes(needle) || needle.includes(haystack))
    ) {
      return "sameAsIdentifier";
    }
  }

  return null;
}

/** 注册：新密码 + 确认密码。返回第一个问题，通过则 null。 */
export function checkNewPassword(
  password: string,
  confirm: string,
  identifier?: string,
): PasswordProblem | "mismatch" | null {
  const problem = checkPassword(password, identifier);

  if (problem) {
    return problem;
  }

  // 只比"是不是一模一样"。不做 trim —— 空格是合法密码字符，
  // 悄悄裁掉会让用户下次照着输却进不来。
  if (password !== confirm) {
    return "mismatch";
  }

  return null;
}

/**
 * 强度提示：0 弱 / 1 一般 / 2 好 / 3 很强。
 *
 * 只用于界面上的进度条，**不参与校验**。它衡量的是"还能怎么变强"，
 * 而不是"够不够用" —— 后者是 `checkPassword` 的事，两件事分开才不会
 * 出现"进度条 1 格但允许提交"这种自相矛盾的界面。
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password === "") {
    return 0;
  }

  let score = 0;
  const length = lengthOf(password);

  if (length >= PASSWORD_MIN_LENGTH) {
    score += 1;
  }

  if (length >= 12) {
    score += 1;
  }

  const variety = [
    /\p{Ll}/u.test(password),
    /\p{Lu}/u.test(password),
    /\p{Nd}/u.test(password),
    /[^\p{L}\p{Nd}]/u.test(password),
  ].filter(Boolean).length;

  if (variety >= 3) {
    score += 1;
  } else if (variety === 2 && length >= 10) {
    // 只有两类字符但足够长，也算一档 —— 长口令本身就有熵。
    score += 1;
  }

  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}
