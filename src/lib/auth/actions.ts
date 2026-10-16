"use server";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { isAuthChannel, type AuthChannel } from "@/lib/auth/channels";
import { DEFAULT_SIGN_IN_LEVEL, isUserLevel } from "@/lib/auth/constants";
import { normalizeIdentifier } from "@/lib/auth/identifier";
import { checkNewPassword, type PasswordProblem } from "@/lib/auth/password";
import { hashPassword, verifyPassword } from "@/lib/auth/password-hash";
import {
  clearMockSession,
  createMockSession,
  updateMockLevel,
} from "@/lib/auth/session";
import {
  consumeCode,
  findCredentialByIdentifier,
  findProfileByIdentifier,
  isIdentifierTaken,
  registerWithIdentifier,
  requestCode,
  type CodePurpose,
} from "@/lib/db/auth";
import { normalizeRefCode, REF_COOKIE } from "@/lib/referral";
import type { UserLevel } from "@/types/user";

/**
 * 注册 / 登录的 Server Actions。
 *
 * 流程被刻意切成两步（先要码、再提交），而不是一个动作里发码+校验：
 *   * 用户能先看到"码已发往 …"，从而确认自己没写错收件地址；
 *   * 提交失败时不用重新发码，改个字母再交一次就行。
 *
 * 两步之间没有任何状态放在服务端内存里 —— 码存在数据库（见 lib/db/auth.ts），
 * 所以 dev 热重载或多进程部署都不会让已发出的码"消失"。
 */

/** 与 `auth.errors.*` 一一对应的错误键。 */
export type AuthErrorKey =
  | "invalidIdentifier"
  | "identifierTaken"
  | "notRegistered"
  | "termsRequired"
  | "invalidCode"
  | "cooldown"
  // 密码相关。前端提示与服务端判定共用同一套键，
  // 所以"密码太短"在两端看起来是同一句话。
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordTooSimple"
  | "passwordSameAsIdentifier"
  | "passwordMismatch"
  | "passwordWrong"
  | "passwordNotSet"
  | "unknown";

/** 登录方式：验证码，或密码。注册固定走验证码 + 设置密码。 */
export type SignInMethod = "code" | "password";

export interface RequestCodeState {
  ok?: boolean;
  /** 码已发往哪个标识（归一化后），用于界面回显。 */
  sentTo?: string;
  /**
   * 本地测试模式回显的验证码。
   *
   * 本机没有短信网关与邮件服务，不回显就没法登录。接入真实通道时，
   * 删掉这个字段与页面上对应的展示块即可，其余逻辑不受影响。
   */
  devCode?: string;
  error?: AuthErrorKey;
  retryAfterSeconds?: number;
}

export interface AuthSubmitState {
  error?: AuthErrorKey;
}

const CODE_PATTERN = /^\d{6}$/;

function readChannel(formData: FormData): AuthChannel {
  const raw = String(formData.get("channel") ?? "sms");

  return isAuthChannel(raw) ? raw : "sms";
}

function purposeFor(mode: "register" | "signin"): CodePurpose {
  return mode === "register" ? "signup" : "signin";
}

function readMethod(formData: FormData): SignInMethod {
  return String(formData.get("method") ?? "code") === "password"
    ? "password"
    : "code";
}

/** `checkPassword` 的问题码 → 界面错误键。两种语言各写一遍会漂移，所以映射一次。 */
function passwordProblemToKey(
  problem: PasswordProblem | "mismatch",
): AuthErrorKey {
  switch (problem) {
    case "empty":
      return "passwordRequired";
    case "tooShort":
      return "passwordTooShort";
    case "tooLong":
      return "passwordTooLong";
    case "tooSimple":
      return "passwordTooSimple";
    case "sameAsIdentifier":
      return "passwordSameAsIdentifier";
    case "mismatch":
      return "passwordMismatch";
  }
}

/**
 * 发送验证码。
 *
 * 在发之前先判断"这个标识在这个页面是否合理"，因为把一个已注册的手机号
 * 送上一条必然失败的注册流程，只会让人白等一条短信：
 *   * 注册页遇到已存在的标识 → 直接告诉他去登录；
 *   * 登录页遇到没注册过的标识 → 直接告诉他去注册。
 */
export async function requestCodeAction(input: {
  channel: AuthChannel;
  rawIdentifier: string;
  mode: "register" | "signin";
}): Promise<RequestCodeState> {
  const { channel, rawIdentifier, mode } = input;

  if (!isAuthChannel(channel)) {
    return { error: "invalidIdentifier" };
  }

  const normalized = normalizeIdentifier(channel, rawIdentifier);

  if (!normalized) {
    return { error: "invalidIdentifier" };
  }

  const taken = await isIdentifierTaken(channel, normalized.value);

  if (mode === "register" && taken) {
    return { error: "identifierTaken" };
  }

  if (mode === "signin" && !taken) {
    return { error: "notRegistered" };
  }

  const result = await requestCode({
    channel,
    value: normalized.value,
    purpose: purposeFor(mode),
  });

  if (!result.ok) {
    return {
      error: "cooldown",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  return { ok: true, sentTo: normalized.value, devCode: result.code };
}

/**
 * 提交注册 / 登录。
 *
 * 校验顺序是有讲究的，两条规则贯穿全篇：
 *
 *   1. **先本地检查，再查库，最后才消费验证码**。反过来的话，用户只是把邮箱
 *      打错一个字母，那条码就被烧掉了，他必须重新等 60 秒冷却 —— 而他真正
 *      需要做的只是改个字母。密码强度这种纯本地判断更要放在最前面，
 *      它不需要任何 I/O，没有理由让它排在一次数据库往返后面。
 *   2. **密码错误与"没设过密码"分开报**。0006 之前注册的账号没有密码，
 *      把这种账号说成"密码错误"，用户会一遍遍重试一个根本不存在的东西。
 */
export async function submitAuthAction(
  _prev: AuthSubmitState,
  formData: FormData,
): Promise<AuthSubmitState> {
  const mode =
    String(formData.get("mode") ?? "signin") === "register"
      ? "register"
      : "signin";
  const channel = readChannel(formData);
  const method: SignInMethod =
    mode === "register" ? "code" : readMethod(formData);
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const normalized = normalizeIdentifier(
    channel,
    String(formData.get("identifier") ?? ""),
  );

  if (!normalized) {
    return { error: "invalidIdentifier" };
  }

  if (mode === "register" && formData.get("terms") !== "on") {
    return { error: "termsRequired" };
  }

  if (mode === "register") {
    // 纯本地判断，不碰库、不耗码。
    const problem = checkNewPassword(
      password,
      String(formData.get("passwordConfirm") ?? ""),
      normalized.value,
    );

    if (problem) {
      return { error: passwordProblemToKey(problem) };
    }
  }

  const locale = await getLocale();

  /* ───────────────────────── 密码登录：不涉及验证码 ───────────────────────── */

  if (mode === "signin" && method === "password") {
    if (password === "") {
      return { error: "passwordRequired" };
    }

    const credential = await findCredentialByIdentifier(
      channel,
      normalized.value,
    );

    if (!credential) {
      return { error: "notRegistered" };
    }

    if (!credential.passwordHash) {
      return { error: "passwordNotSet" };
    }

    if (!(await verifyPassword(password, credential.passwordHash))) {
      return { error: "passwordWrong" };
    }

    await createMockSession({
      identifier: normalized.value,
      channel,
      level: isUserLevel(credential.profile.level)
        ? credential.profile.level
        : DEFAULT_SIGN_IN_LEVEL,
    });

    return redirect({ href: "/catalog", locale });
  }

  /* ─────────────────────────── 验证码路径（注册 / 登录） ─────────────────────────── */

  // 先按位数列再比较：`12345`、`1234567` 都该在查库前就被挡掉。
  if (!CODE_PATTERN.test(code)) {
    return { error: "invalidCode" };
  }

  if (mode === "register") {
    if (await isIdentifierTaken(channel, normalized.value)) {
      return { error: "identifierTaken" };
    }
  } else if (!(await findProfileByIdentifier(channel, normalized.value))) {
    return { error: "notRegistered" };
  }

  const accepted = await consumeCode({
    channel,
    value: normalized.value,
    purpose: purposeFor(mode),
    code,
  });

  if (!accepted) {
    return { error: "invalidCode" };
  }

  if (mode === "register") {
    // 哈希放在验码之后：一次 scrypt 约几十毫秒，不该为一次注定失败的提交付出。
    return finishRegistration({
      channel,
      value: normalized.value,
      locale,
      passwordHash: await hashPassword(password),
    });
  }

  const profile = await findProfileByIdentifier(channel, normalized.value);

  if (!profile) {
    // 极小概率：上面查过、这里又没了（并发注销）。当成未注册处理。
    return { error: "notRegistered" };
  }

  await createMockSession({
    identifier: normalized.value,
    channel,
    level: isUserLevel(profile.level) ? profile.level : DEFAULT_SIGN_IN_LEVEL,
  });

  // 登录后回到目录页 —— 用户来登录就是为了继续浏览和聊天。
  return redirect({ href: "/catalog", locale });
}

/** 注册的后半段：建账号 + 落邀请归因 + 开会话。 */
async function finishRegistration(input: {
  channel: AuthChannel;
  value: string;
  locale: string;
  passwordHash: string;
}): Promise<AuthSubmitState> {
  const { channel, value, locale, passwordHash } = input;

  const store = await cookies();
  // 邀请码是服务端读的（middleware 写的 cookie）。放在这里而不是浏览器端，
  // 是因为归因写入必须发生在**建号那一刻**，而浏览器端的时序无法保证这一点。
  const refCode = normalizeRefCode(store.get(REF_COOKIE)?.value);

  const result = await registerWithIdentifier({
    channel,
    value,
    refCode,
    passwordHash,
  });

  if (!result.ok) {
    return { error: "identifierTaken" };
  }

  if (refCode) {
    // 归因是首触归因：用掉就把 cookie 清掉，
    // 否则同一浏览器里的第二个注册会被算到上一个人的链接上。
    store.delete(REF_COOKIE);
  }

  await createMockSession({
    identifier: value,
    channel,
    level: DEFAULT_SIGN_IN_LEVEL,
  });

  // 新会员先去补资料，而不是直接丢进目录页面对着一堆陌生人。
  return redirect({ href: "/onboarding/profile", locale });
}

export async function setMockLevelAction(level: UserLevel): Promise<void> {
  if (!isUserLevel(level)) {
    return;
  }

  await updateMockLevel(level);
}

export async function mockSignOutAction(): Promise<void> {
  await clearMockSession();

  const locale = await getLocale();
  return redirect({ href: "/", locale });
}
