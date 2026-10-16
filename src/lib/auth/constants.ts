import { isAuthChannel, type AuthChannel } from "@/lib/auth/channels";
import { USER_LEVELS, type UserLevel } from "@/types/user";

/**
 * 会话与注册流程共享的常量。
 *
 * 注意这里已经没有"固定验证码"了：注册/登录改为**真正生成**一次性验证码
 * （见 lib/db/auth.ts 的 requestCode），本机没有短信与邮件通道，
 * 所以码会直接回显在页面上 —— 这是原型阶段的权宜，不是最终形态。
 */

/** 档位：新注册账号从 Level 1 起步（PRD 规则 3：Level 1 + 30 天试用）。 */
export const DEFAULT_SIGN_IN_LEVEL: UserLevel = 1;

export const TRIAL_DAYS = 30;

/** 注册表单预填的示例手机号，纯为演示省事。 */
export const MOCK_SAMPLE_PHONE = "+86 138 0000 0000";

/** 邮箱通道的对应示例。 */
export const MOCK_SAMPLE_EMAIL = "member@example.com";

/**
 * 验证码有效期：10 分钟。够慢的人抄完，又不至于留太久。
 *
 * 放在这里而不是 `lib/db/auth.ts`：客户端表单要拿它做"还剩多久重发"的倒计时，
 * 而数据层带 `server-only`，被浏览器包引用会直接构建失败。
 */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** 重发冷却：60 秒。既是防轰炸，也是给真实通道的成本兜底。 */
export const CODE_RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * 本地会话。
 *
 * `identifier` + `channel` 是身份的**唯一来源**，`phone` 只是给那些
 * 确实需要手机号展示的界面（如注销确认页）用的便捷字段：
 * 邮箱注册的账号在补绑手机号之前，它就是 null。
 *
 * 不直接存 `users.id` 的原因：cookie 是明文存储的，存主键等于把
 * "换成别人的账号"变成改一个字符串。存标识则每次都要回库查询，改了就查不到人。
 */
export interface MockSession {
  /** 归一化后的标识：sms 下是手机号，email 下是小写邮箱。 */
  identifier: string;
  channel: AuthChannel;
  /** 仅 sms 通道有值。 */
  phone: string | null;
  level: UserLevel;
  createdAt: string;
}

export function isUserLevel(value: unknown): value is UserLevel {
  return USER_LEVELS.includes(value as UserLevel);
}

/**
 * 解析 cookie 里的会话对象，形状不对就当作未登录。
 *
 * 这里顺带兼容了更早的会话格式（只有 `phone`、没有 `channel`）：
 * 老 cookie 会被就地升级成 sms 通道，而不是让用户莫名其妙地被登出。
 */
export function parseMockSession(raw: string | undefined): MockSession | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const candidate = parsed as Partial<MockSession> & { phone?: unknown };

    if (!isUserLevel(candidate.level)) {
      return null;
    }

    // 旧格式迁移：{ phone, level, createdAt }
    if (!isAuthChannel(candidate.channel)) {
      if (typeof candidate.phone !== "string") {
        return null;
      }

      return {
        identifier: candidate.phone,
        channel: "sms",
        phone: candidate.phone,
        level: candidate.level,
        createdAt:
          typeof candidate.createdAt === "string"
            ? candidate.createdAt
            : new Date().toISOString(),
      };
    }

    if (typeof candidate.identifier !== "string") {
      return null;
    }

    return {
      identifier: candidate.identifier,
      channel: candidate.channel,
      phone: typeof candidate.phone === "string" ? candidate.phone : null,
      level: candidate.level,
      createdAt:
        typeof candidate.createdAt === "string"
          ? candidate.createdAt
          : new Date().toISOString(),
    };
  } catch {
    // 坏掉的 cookie 应当表现为"未登录"，而不是让整个页面崩掉。
    return null;
  }
}
