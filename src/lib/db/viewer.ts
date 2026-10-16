import "server-only";

import { getMockSession } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/pool";
import type { ProfileRow } from "@/lib/db/types";

/**
 * "当前是谁" —— 全站唯一的身份解析入口。
 *
 * 取代了原先 `lib/supabase/session.ts` 的匿名登录 + `lib/supabase/profile.ts`
 * 的 `ensureViewerProfile`：
 *   * Supabase 版靠 GoTrue 匿名登录拿到 `auth.uid()`，再据此建 profiles 行；
 *   * 自建版里注册/登录时就已经把 `users` 与 `profiles` 建好（见 lib/db/auth.ts），
 *     所以这里只做**解析**，不再承担建号的职责。
 *
 * 未登录时的行为刻意保留原型语义：以种子里的展示账号 `u_current` 作为浏览者。
 * 它是**只读展示身份**——所有写操作都要求真实会话，
 * 因为写入需要一个能承担责任的主体（拉黑、举报、发消息都是如此）。
 */

export async function getViewerProfile(): Promise<ProfileRow | null> {
  const session = await getMockSession();

  if (session) {
    // 按会话里的通道选列。手机号与邮箱在 users 上各自唯一，
    // 所以任一列都能唯一命中，不存在"邮箱恰好等于别人手机号"的歧义。
    const row = await queryOne<ProfileRow>(
      `select p.* from public.profiles p
        join public.users u on u.id = p.user_id
       where ${session.channel === "sms" ? "u.phone = $1" : "u.email = $1"}`,
      [session.identifier],
    );

    if (row) {
      return row;
    }

    // 会话有效但库里找不到档案（比如库被重置过）。不在这里偷偷建一个：
    // 建号需要走完整的注册流程（含验证码），不是解析函数该做的事。
  }

  // 浏览态：种子账号，仅用于展示。
  return queryOne<ProfileRow>(
    "select * from public.profiles where handle = 'u_current'",
  );
}

/** 写操作入口：拿不到真实会员身份就抛 401，由 route handler 转成响应。 */
export async function requireViewerProfile(): Promise<ProfileRow> {
  const profile = await getViewerProfile();

  if (!profile) {
    throw Object.assign(new Error("no viewer profile"), { status: 401 });
  }

  /*
    判断依据是"解析出来的是不是浏览态那个种子账号"，而不是"cookie 在不在"。

    两者不等价：cookie 可能还在，但它指向的档案已经被删掉或库被重置过，
    此时 getViewerProfile 会回落到 u_current。若只看 cookie 存不存在，
    这种情形下就会放行一次以别人名义的写操作 —— 拉黑、举报、发消息都会被冒名执行。
  */
  if (profile.handle === "u_current") {
    throw Object.assign(new Error("sign in required for this action"), {
      status: 401,
    });
  }

  return profile;
}

export async function getViewerProfileId(): Promise<string | null> {
  return (await getViewerProfile())?.id ?? null;
}
