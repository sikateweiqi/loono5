import "server-only";

import { TRIAL_DAYS } from "@/lib/auth/constants";
import { getMockSession } from "@/lib/auth/session";
import { getDefaultViewer, getMemberByIdentifier } from "@/lib/db/members";
import type { PublicUser, UserLevel } from "@/types/user";

/**
 * Tier shown when browsing without signing in. Keeps the demo usable while
 * still exercising the blur path (L3 profiles stay locked).
 */
export const DEFAULT_DEMO_LEVEL: UserLevel = 2;

function withLevel(user: PublicUser, level: UserLevel): PublicUser {
  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS);

  return {
    ...user,
    level,
    subscription: {
      ...user.subscription,
      status: "active",
      level,
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isTrial: false,
      scheduledLevel: null,
    },
  };
}

/**
 * The signed-in member, read from PostgreSQL.
 *
 * 数据来源变更说明：原型阶段这里返回的是 `lib/mock-data` 的 `currentUser` 常量；
 * 现在按会话里的登录标识（手机号或邮箱）去 `users`/`profiles` 查真实档案，
 * 未登录则回落到种子里的展示账号 `u_current`（浏览态），
 * 保持"不注册也能逛"的既有体验。
 *
 * 层级仍取自会话（`level`）—— 那是 demo 里的一键档位切换器写的，
 * 用来演示可见性矩阵（PRD 规则 2），与库里的订阅记录相互独立。
 */
export async function getCurrentUser(): Promise<PublicUser> {
  const session = await getMockSession();

  const signedIn = session
    ? await getMemberByIdentifier(session.channel, session.identifier)
    : null;
  const member = signedIn ?? (await getDefaultViewer());

  if (!member) {
    // 库里连种子账号都没有 —— 说明迁移/种子没跑，直接把话说清楚，
    // 而不是抛一个 "cannot read property id of null" 让人猜。
    throw new Error(
      "数据库里找不到会员档案。请先执行 `npm run db:migrate` 与 `npm run db:seed`。",
    );
  }

  return withLevel(member, session?.level ?? DEFAULT_DEMO_LEVEL);
}

/** null when signed out. */
export async function getCurrentLevel(): Promise<UserLevel | null> {
  const session = await getMockSession();

  return session?.level ?? null;
}

export async function isSignedIn(): Promise<boolean> {
  return (await getMockSession()) !== null;
}
