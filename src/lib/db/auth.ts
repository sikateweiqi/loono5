import "server-only";

import { randomInt } from "node:crypto";

import type { AuthChannel } from "@/lib/auth/channels";
import { CODE_RESEND_COOLDOWN_MS, CODE_TTL_MS } from "@/lib/auth/constants";
import { query, queryOne, transaction } from "@/lib/db/pool";
import type { ProfileRow } from "@/lib/db/types";

/**
 * 注册与登录的数据层：手机号 / 邮箱两条通道共用同一套流程。
 *
 * 职责边界
 * --------
 *   * 这里只管**发码、验码、建账号、找账号**，不碰 cookie（那是 lib/auth/session.ts）。
 *   * 标识的归一化（normalizePhone / normalizeEmail）是纯函数，放在最前面，
 *     因为下面每一条 SQL 都假定传进来的已经是规范形式 —— 库里存的和查的必须是同一个值，
 *     否则 `+86 138 0000 0000` 与 `+8613800000000` 会被当成两个账号。
 *
 * 为什么验证码要落库而不是放内存 Map
 * ----------------------------------
 * dev 模式下 Next.js 会因热重载反复求值模块，内存里的码会在提交前凭空消失；
 * 而且多进程部署时内存各存各的，用户在 A 实例拿码、B 实例提交就必然失败。
 * 落库顺带解决了"重发冷却"和"这个码有没有被用过"两件事。
 */

/**
 * 通道类型定义在 `lib/auth/channels.ts`（无 server-only 依赖），
 * 客户端表单也要引用；这里原样再导出，让 `@/lib/db/auth` 保持单一入口。
 */
export type { AuthChannel };

export type CodePurpose = "signup" | "signin";

/* ────────────────────── 有效期常量（见 lib/auth/constants） ───────────────── */

// 客户端表单要用这两个值做倒计时，而本模块带 server-only，
// 所以常量住在 lib/auth/constants.ts，这里原样再导出。
// （是 import + export，而不是 `export ... from`：后者只重导出、不引入本地作用域，
//   本文件里的 requestCode 还要用它们。）
export { CODE_RESEND_COOLDOWN_MS, CODE_TTL_MS };

/* ─────────────────────────── 归一化（见 identifier.ts） ──────────────────── */

/*
  归一化是纯函数，住在 `lib/auth/identifier.ts`：客户端表单要用**同一套规则**
  做即时校验，而那个模块不能带 server-only（否则浏览器包会构建失败）。
  这里原样再导出，让 `@/lib/db/auth` 保持数据层的单一入口，
  调用点不必知道规则具体住在哪个文件。
*/
export {
  normalizeEmail,
  normalizeIdentifier,
  normalizePhone,
  type NormalizedIdentifier,
} from "@/lib/auth/identifier";

/* ─────────────────────────────── 验证码 ────────────────────────────────── */

function generateCode(): string {
  // 用 CSPRNG 而不是 Math.random：验证码是凭据，"猜中下一个"必须不可行。
  // 补零到 6 位，让 000042 与 100042 一样是合法码。
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type RequestCodeResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; error: "cooldown"; retryAfterSeconds: number };

/**
 * 生成并"发送"一个验证码。
 *
 * 原型阶段没有短信网关也没有邮件服务，所以 **code 直接返回给调用方**，
 * 由页面以"本地测试模式"的方式回显出来。接真实通道时，把返回值里的 code
 * 换成一次 sendSms / sendEmail 调用即可，其余逻辑（限流、过期、一次性）不用动。
 *
 * 冷却检查与写入之间没有加锁：并发的两次点击最多多发一条码，
 * 而它们共享同一个 purpose，用户用哪条都能进 —— 不值得为此上 advisory lock。
 */
export async function requestCode(input: {
  channel: AuthChannel;
  value: string;
  purpose: CodePurpose;
}): Promise<RequestCodeResult> {
  const { channel, value, purpose } = input;

  const latest = await queryOne<{ created_at: Date }>(
    `select created_at from public.verification_codes
      where channel = $1 and destination = $2 and purpose = $3
      order by created_at desc
      limit 1`,
    [channel, value, purpose],
  );

  if (latest) {
    const elapsed = Date.now() - latest.created_at.getTime();
    const remaining = CODE_RESEND_COOLDOWN_MS - elapsed;

    if (remaining > 0) {
      return {
        ok: false,
        error: "cooldown",
        retryAfterSeconds: Math.ceil(remaining / 1000),
      };
    }
  }

  const code = generateCode();
  // 过期时间在 JS 里算好再传过去：比在 SQL 里拼 interval 好读，
  // 也让"有效期多长"只有一个来源（CODE_TTL_MS）。
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await query(
    `insert into public.verification_codes
       (channel, destination, code, purpose, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [channel, value, code, purpose, expiresAt],
  );

  return { ok: true, code, expiresAt };
}

/**
 * 校验并**消费**一个验证码 —— 一条 SQL 完成查找与置位。
 *
 * 拆成"先 select 再 update"会有竞态：两个人同时提交同一个码，两边都查到未消费，
 * 于是都能通过。把条件写进 update 的 where 里，让数据库来保证只有一个赢家。
 *
 * 返回 true 表示这次校验消耗掉了一个码；同一个码不能再用第二次。
 */
export async function consumeCode(input: {
  channel: AuthChannel;
  value: string;
  purpose: CodePurpose;
  code: string;
}): Promise<boolean> {
  const consumed = await queryOne<{ id: string }>(
    `update public.verification_codes
        set consumed_at = now()
      where id = (
        select id from public.verification_codes
         where channel = $1
           and destination = $2
           and purpose = $3
           and code = $4
           and consumed_at is null
           and expires_at > now()
         order by created_at desc
         limit 1
      )
      returning id`,
    [input.channel, input.value, input.purpose, input.code],
  );

  return consumed !== null;
}

/* ───────────────────────────── 账号查询与创建 ───────────────────────────── */

/** 标识是否已被占用（注册前的友好提示；真正的把关是表上的唯一约束）。 */
export async function isIdentifierTaken(
  channel: AuthChannel,
  value: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    channel === "sms"
      ? "select id from public.users where phone = $1"
      : "select id from public.users where email = $1",
    [value],
  );

  return row !== null;
}

/** 按标识找会员档案（登录时用）。没有档案返回 null。 */
export async function findProfileByIdentifier(
  channel: AuthChannel,
  value: string,
): Promise<ProfileRow | null> {
  return queryOne<ProfileRow>(
    `select p.* from public.profiles p
       join public.users u on u.id = p.user_id
      where ${channel === "sms" ? "u.phone = $1" : "u.email = $1"}`,
    [value],
  );
}

/**
 * 密码登录的结果。
 *
 * `noPassword` 与 `wrongPassword` 必须分开：0006 之前注册的账号（以及全部种子
 * 会员）没有密码，把这种账号说成"密码错误"，用户会一遍遍重试一个根本不存在的东西。
 */
export type PasswordSignInResult =
  | { ok: true; profile: ProfileRow }
  | { ok: false; error: "notRegistered" | "noPassword" | "wrongPassword" };

/**
 * 按标识 + 密码找会员档案。
 *
 * 哈希比对不在这里做 —— 数据层负责"把哈希取出来"，`lib/auth/password-hash.ts`
 * 负责"比对不对"，两者分开之后，密码学参数的调整不需要动 SQL。
 *
 * 一条 SQL 同时取出 `password_hash` 与 `profiles.*`：分两次查会多一次往返，
 * 而且第二次查为空时（users 有行、profile 没有）还得决定算哪种失败。
 */
export async function findCredentialByIdentifier(
  channel: AuthChannel,
  value: string,
): Promise<{ passwordHash: string | null; profile: ProfileRow } | null> {
  const row = await queryOne<ProfileRow & { password_hash: string | null }>(
    `select p.*, u.password_hash
       from public.users u
       join public.profiles p on p.user_id = u.id
      where ${channel === "sms" ? "u.phone = $1" : "u.email = $1"}`,
    [value],
  );

  if (!row) {
    return null;
  }

  return { passwordHash: row.password_hash, profile: row };
}

/** 设置 / 重置密码（供将来的"忘记密码"流程使用）。 */
export async function setPasswordHash(
  channel: AuthChannel,
  value: string,
  passwordHash: string,
): Promise<boolean> {
  const updated = await queryOne<{ id: string }>(
    channel === "sms"
      ? `update public.users
            set password_hash = $2, password_updated_at = now()
          where phone = $1
          returning id`
      : `update public.users
            set password_hash = $2, password_updated_at = now()
          where email = $1
          returning id`,
    [value, passwordHash],
  );

  return updated !== null;
}

export type RegisterResult =
  { ok: true; profile: ProfileRow } | { ok: false; error: "taken" };

/**
 * 注册：建登录身份，再建会员档案，两件事必须同生共死。
 *
 * 放在一个事务里，是因为"有登录身份但没有档案"是一种**无法自我修复**的坏状态：
 * 之后每次登录都查不到 profile，页面只能回落到浏览态身份，
 * 用户会以为自己注册失败却又被告知手机号已被占用。
 *
 * 并发安全靠 `on conflict ... do nothing` + 行数判断，而不是"先查再插"：
 * 后者在两个请求同时提交时会双双通过检查。
 *
 * `passwordHash` 可空：老账号（0006 之前）与脚本建的数据没有密码，
 * 保持可空让它们仍能用验证码登录，而不是被这次改造挡在门外。
 */
export async function registerWithIdentifier(input: {
  channel: AuthChannel;
  value: string;
  /** 注册链接带过来的邀请码；首次注册时写入归因。 */
  refCode?: string | null;
  displayName?: string | null;
  /** 已哈希的密码；不传表示这个账号暂不设密码。 */
  passwordHash?: string | null;
}): Promise<RegisterResult> {
  const { channel, value, refCode, displayName, passwordHash } = input;

  /*
    `password_updated_at` 由 JS 算好再传，而不是在 SQL 里写
    `case when $2 is null then null else now() end`。

    后者会被 PostgreSQL 判为 `AmbiguousParameter`：`$2` 出现在
    `is null` 的布尔语境里，此时它的类型还没有被确定，解析阶段就报
    "could not determine data type of parameter $2"，PREPARE 与执行都会失败 ——
    也就是注册接口直接 500。多传一个参数换来一个能真正执行的语句。
  */
  const passwordUpdatedAt = passwordHash ? new Date() : null;

  return transaction(async (client) => {
    const created =
      channel === "sms"
        ? await client.query<{ id: string }>(
            `insert into public.users (phone, phone_verified_at, password_hash, password_updated_at)
             values ($1, now(), $2, $3)
             on conflict (phone) do nothing
             returning id`,
            [value, passwordHash ?? null, passwordUpdatedAt],
          )
        : await client.query<{ id: string }>(
            `insert into public.users (email, email_verified_at, password_hash, password_updated_at)
             values ($1, now(), $2, $3)
             on conflict (email) do nothing
             returning id`,
            [value, passwordHash ?? null, passwordUpdatedAt],
          );

    const userId = created.rows[0]?.id;

    if (!userId) {
      // 唯一约束挡住了：这个标识已经有账号。事务里还没写任何东西，回滚即可。
      return { ok: false as const, error: "taken" as const };
    }

    // handle 要唯一且可读，所以用"后四位 + 随机四位"而不是 uuid：
    // 随机部分负责避免并发撞车，撞了就用下一个候选重试。
    const tail = value.replace(/\D/g, "").slice(-4) || "0000";
    const name = displayName?.trim() || "New member";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const handle = `u_${tail}${randomInt(1000, 10000)}`;

      const profile = await client.query<ProfileRow>(
        `insert into public.profiles (user_id, handle, display_name, kind, phone)
         values ($1, $2, $3, 'member', $4)
         on conflict (handle) do nothing
         returning *`,
        [userId, handle, name, channel === "sms" ? value : null],
      );

      const row = profile.rows[0];

      if (!row) {
        continue; // handle 撞车，换一个再来。
      }

      if (refCode) {
        // 归因只写"上级 profile 是谁"，不在此处加收益 ——
        // 分账是 append-only 账本的职责（db/migrations/0004_ledger.sql）。
        await client.query(
          `update public.profiles p
              set referred_by = referrer.id
             from public.profiles referrer
            where p.id = $1
              and p.referred_by is null
              and referrer.ref_code = upper(btrim($2))`,
          [row.id, refCode],
        );
      }

      return { ok: true as const, profile: row };
    }

    // 5 次都撞上同一个 handle，概率低到可以视为异常；抛出去让上层看到。
    throw new Error("无法生成唯一的 handle，请重试");
  });
}
