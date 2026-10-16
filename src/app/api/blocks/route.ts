import {
  asText,
  errorResponse,
  fail,
  isUuid,
  ok,
  readJson,
} from "@/app/api/_lib/http";
import { blockUser, listBlockedProfileIds, unblockUser } from "@/lib/db/chat";
import { getViewerProfileId, requireViewerProfile } from "@/lib/db/viewer";

/**
 * 拉黑名单。
 *
 *   GET    /api/blocks                 → 我拉黑过的 profile id 数组
 *   POST   /api/blocks { profileId }   → 拉黑
 *   DELETE /api/blocks?profileId=...   → 解除
 *
 * 名单按"我"过滤：blocker_id 一律取自服务端解析出的身份，
 * 所以这里不可能读到（或删掉）别人的拉黑记录。
 */

export const dynamic = "force-dynamic";

interface BlockBody {
  profileId?: unknown;
}

export async function GET() {
  try {
    const viewerId = await getViewerProfileId();

    if (!viewerId) {
      return ok([]);
    }

    return ok(await listBlockedProfileIds(viewerId));
  } catch (cause) {
    return errorResponse(cause);
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await requireViewerProfile();
    const body = await readJson<BlockBody>(request);
    const profileId = body?.profileId;

    if (!isUuid(profileId)) {
      return fail(400, "缺少要拉黑的会员。");
    }

    // 库里有 CHECK (blocker_id <> blocked_id)，但先判一次能给出可读的提示，
    // 也避免把一次注定失败的写打到数据库。
    if (profileId === viewer.id) {
      return fail(400, "不能拉黑自己。");
    }

    await blockUser(viewer.id, profileId);

    return ok({ ok: true }, 201);
  } catch (cause) {
    return errorResponse(cause);
  }
}

export async function DELETE(request: Request) {
  try {
    const viewer = await requireViewerProfile();
    const profileId = asText(
      new URL(request.url).searchParams.get("profileId"),
    );

    if (!isUuid(profileId)) {
      return fail(400, "缺少要解除拉黑的会员。");
    }

    await unblockUser(viewer.id, profileId);

    return ok({ ok: true });
  } catch (cause) {
    return errorResponse(cause);
  }
}
