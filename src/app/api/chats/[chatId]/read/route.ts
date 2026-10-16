import { errorResponse, fail, isUuid, ok } from "@/app/api/_lib/http";
import { markThreadRead } from "@/lib/db/chat";
import { getViewerProfileId } from "@/lib/db/viewer";

/**
 * 标记整个会话已读。
 *
 * 这里刻意用 `getViewerProfileId()` 而不是 `requireViewerProfile()`：
 * 已读状态是"把别人的消息标记为我读过了"，属于读取动作的收尾，而不是以别人的名义
 * 写内容 —— 客户端在打开会话和收到新消息时都会调用它。浏览态若被 401 挡掉，
 * 列表每 4 秒轮询一次又会把 unread_count 拉回来，徽标就会"清了又出现"。
 *
 * 调用者身份仍然只能来自服务端会话，客户端送不了 id：写入的 user 由
 * markThreadRead(chatId, viewerId) 的第二个参数决定，而它来自 cookie。
 */

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params;

    if (!isUuid(chatId)) {
      return fail(400, "会话标识不合法。");
    }

    const viewerId = await getViewerProfileId();

    if (!viewerId) {
      return fail(401, "请先登录。");
    }

    await markThreadRead(chatId, viewerId);

    return ok({ ok: true });
  } catch (cause) {
    return errorResponse(cause);
  }
}
