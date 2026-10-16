import { NextResponse } from "next/server";

/**
 * route handlers 的公共出口：统一的 JSON 响应、错误翻译与入参校验。
 *
 * 为什么需要这一层：`src/lib/db/*` 里的函数用"带 status 的错误对象"表达权限拒绝
 * （见 db/chat.ts 的 assertChatMember、db/viewer.ts 的 requireViewerProfile），
 * 而 PostgreSQL 自己抛出的错误只带 SQLSTATE。两者都得翻成 HTTP 状态码，
 * 且每个 handler 都要做一遍 —— 与其复制十次 try/catch，不如只写一次规则。
 *
 * 放在 `api/_lib/` 而不是 `lib/`：这层只服务于 HTTP 边界（依赖 next/server），
 * 下划线前缀让 Next 不把它当成路由。
 */

/** 正常响应。`data` 会被 JSON 序列化，Date 会变成 ISO 字符串。 */
export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** 显式失败响应，body 形状固定为 `{ error }`，客户端只认这个字段。 */
export function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * 解析 JSON 请求体；非法 JSON 或空 body 返回 null 而不是抛错。
 *
 * 调用方拿到 null 后按"缺少字段"处理（400），这样 body 解析失败与字段缺失
 * 走同一条错误路径，不需要每个 handler 各写一次 try/catch。
 */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** uuid 判定。与 db/members.ts 的 getMember 用同一套写法，避免两处漂移。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** 非空字符串（去空白后），否则 null。 */
export function asText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function statusOf(cause: unknown): number | null {
  if (typeof cause !== "object" || cause === null || !("status" in cause)) {
    return null;
  }

  const raw = (cause as { status?: unknown }).status;

  return typeof raw === "number" && raw >= 400 && raw < 600 ? raw : null;
}

/** PostgreSQL 的 SQLSTATE（pg 驱动把错误码放在 `code` 上）。 */
function sqlStateOf(cause: unknown): string | null {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return null;
  }

  const raw = (cause as { code?: unknown }).code;

  return typeof raw === "string" ? raw : null;
}

/**
 * 错误 → HTTP 响应。
 *
 * 顺序上先信 db 层显式给的 status（401 未登录 / 403 非会话成员），
 * 再按 SQLSTATE 兜底：0002_chat.sql 里唯一主动 raise 的就是"拉黑后发消息"（42501），
 * 其余约束失败都是调用方传了坏数据，算 400。都不匹配才算 500。
 *
 * 回给浏览器的文案一律是中文的固定句子，不把英文开发信息漏到界面上
 * （客户端会把 `error` 直接显示给用户），原始错误只进服务端日志。
 */
export function errorResponse(cause: unknown): NextResponse {
  const status = statusOf(cause);

  if (status === 401) {
    return fail(401, "请先登录后再操作。");
  }

  if (status === 403) {
    return fail(403, "你无权访问这个会话。");
  }

  if (status !== null) {
    return fail(status, "请求未被接受。");
  }

  const sqlState = sqlStateOf(cause);

  if (sqlState === "42501") {
    // 0002_chat.sql 的 assert_not_blocked：拉黑是双向拦截，自己发不出去也算。
    return fail(403, "这个会话已被拉黑，消息无法送达。");
  }

  if (sqlState === "23503") {
    return fail(400, "对方资料不存在或已被删除。");
  }

  if (sqlState === "23514" || sqlState === "22P02" || sqlState === "23505") {
    return fail(400, "请求包含不合法的数据。");
  }

  console.error("[api] 未处理的错误", cause);

  return fail(500, "服务器内部错误，请稍后重试。");
}
