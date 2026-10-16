import { errorResponse, fail, isUuid, ok, readJson } from "@/app/api/_lib/http";
import { fetchThreadMessages, sendMessage } from "@/lib/db/chat";
import { getViewerProfileId, requireViewerProfile } from "@/lib/db/viewer";

/**
 * 一个会话的消息：读历史与发消息。
 *
 * 成员身份不再由 RLS 保证 —— db/chat.ts 的两个函数入口都会先跑 assertChatMember，
 * 不是该会话成员会抛 status 403，由 errorResponse 翻成 403。
 * 所以这里不需要（也不应该）再判一次权限：契约只有一处，漏不掉。
 */

export const dynamic = "force-dynamic";

interface SendMessageBody {
  body?: unknown;
  locale?: unknown;
}

/** 历史消息（旧 → 新）。 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params;

    if (!isUuid(chatId)) {
      return fail(400, "会话标识不合法。");
    }

    const viewerId = await getViewerProfileId();

    // 未登录（连展示身份都解析不到）：没有身份就无法判断成员关系，直接 401。
    if (!viewerId) {
      return fail(401, "请先登录。");
    }

    return ok(await fetchThreadMessages(chatId, viewerId));
  } catch (cause) {
    return errorResponse(cause);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params;

    if (!isUuid(chatId)) {
      return fail(400, "会话标识不合法。");
    }

    // 发消息是写操作：必须是真实登录身份，不能用浏览态替别人说话。
    const viewer = await requireViewerProfile();
    const body = await readJson<SendMessageBody>(request);

    const rawText = body?.body;
    const text = typeof rawText === "string" ? rawText : "";
    const length = text.trim().length;

    // 与 0002_chat.sql 的 CHECK (length(btrim(body)) between 1 and 4000) 对齐：
    // 在边界上先拒绝，客户端拿到的是可读的 400 而不是数据库约束报错。
    if (length === 0) {
      return fail(400, "消息内容不能为空。");
    }

    if (length > 4000) {
      return fail(400, "消息内容过长。");
    }

    // 原文不做 trim：正文按用户输入的样子存，数据库只用 btrim 做长度校验。
    const rawLocale = body?.locale;
    const locale =
      typeof rawLocale === "string" && rawLocale.trim()
        ? rawLocale.trim()
        : "en";

    const message = await sendMessage({
      chatId,
      senderId: viewer.id,
      body: text,
      locale,
    });

    return ok(message, 201);
  } catch (cause) {
    return errorResponse(cause);
  }
}
