import { errorResponse, fail, isUuid, ok } from "@/app/api/_lib/http";
import { hideChatForUser, showChatForUser } from "@/lib/db/chat";
import { requireViewerProfile } from "@/lib/db/viewer";

/**
 * "从我的列表里删除会话" / 恢复。
 *
 * POST 隐藏（软删除，只影响自己这边），DELETE 同路径恢复。
 * 两者都要求真实登录身份：这是对会员自己数据的持久修改，浏览态（只读展示身份）
 * 不能改。db 层的 hideChatForUser 还会再确认一次成员身份。
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

    const viewer = await requireViewerProfile();
    await hideChatForUser(chatId, viewer.id);

    return ok({ ok: true });
  } catch (cause) {
    return errorResponse(cause);
  }
}

/** 恢复一个被隐藏的会话（"撤销删除"）。 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await params;

    if (!isUuid(chatId)) {
      return fail(400, "会话标识不合法。");
    }

    const viewer = await requireViewerProfile();
    await showChatForUser(chatId, viewer.id);

    return ok({ ok: true });
  } catch (cause) {
    return errorResponse(cause);
  }
}
