import "server-only";

import { cookies } from "next/headers";

import type { AuthChannel } from "@/lib/auth/channels";
import {
  DEFAULT_SIGN_IN_LEVEL,
  MOCK_SAMPLE_PHONE,
  parseMockSession,
  type MockSession,
} from "@/lib/auth/constants";
import { normalizePhone } from "@/lib/auth/identifier";
import type { UserLevel } from "@/types/user";

/**
 * 本地会话：把"当前是谁"放进一个 httpOnly cookie。
 *
 * 与 0005 之前的区别只有一处：会话不再假定"登录标识必须是手机号"，
 * 而是 `identifier` + `channel` 两个字段 —— 邮箱注册的账号没有手机号可用。
 * 除此之外的取舍没有变：
 *
 *   * 这是一个**没有签名的** cookie，因此它只能装"标识"这种公开信息，
 *     不能装主键或权限位。任何写操作都必须回库重新解析身份（见 lib/db/viewer.ts）。
 *   * `level` 存在会话里而不是查库，是原型期的刻意安排：设置页的"一键切档位"
 *     靠它来演示可见性矩阵（PRD 规则 2），与库里真实的订阅记录相互独立。
 */

export const SESSION_COOKIE = "loono_mock_session";

/** Current mock session, or null when signed out. */
export async function getMockSession(): Promise<MockSession | null> {
  const store = await cookies();

  return parseMockSession(store.get(SESSION_COOKIE)?.value);
}

async function write(session: MockSession): Promise<void> {
  const store = await cookies();

  store.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * 建立会话。`phone` 由通道推导而不是由调用方传：
 * 邮箱账号在补绑手机号之前，`phone` 必须是 null，
 * 否则注销确认页会显示一个不属于这个账号的号码。
 */
export async function createMockSession(input: {
  identifier: string;
  channel: AuthChannel;
  level?: UserLevel;
}): Promise<MockSession> {
  const session: MockSession = {
    identifier: input.identifier,
    channel: input.channel,
    phone: input.channel === "sms" ? input.identifier : null,
    level: input.level ?? DEFAULT_SIGN_IN_LEVEL,
    createdAt: new Date().toISOString(),
  };

  await write(session);

  return session;
}

/** Used by the one-tap level switcher to re-test profile visibility. */
export async function updateMockLevel(level: UserLevel): Promise<void> {
  const current = await getMockSession();

  if (!current) {
    // Switching level without a session implies signing in as that tier.
    await createMockSession({
      // 常量是给人看的展示形式（带空格），入库与比对用的必须是归一化形式，
      // 两者混用会让"切了档位却仍是浏览态"这种问题很难查。
      identifier: normalizePhone(MOCK_SAMPLE_PHONE) ?? MOCK_SAMPLE_PHONE,
      channel: "sms",
      level,
    });
    return;
  }

  await write({ ...current, level });
}

export async function clearMockSession(): Promise<void> {
  const store = await cookies();

  store.delete(SESSION_COOKIE);
}
