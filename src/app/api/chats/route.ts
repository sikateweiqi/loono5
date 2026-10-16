import { errorResponse, fail, isUuid, ok, readJson } from "@/app/api/_lib/http";
import {
  ensureThreadWithMessages,
  listChats,
  type PeerDisplay,
} from "@/lib/db/chat";
import { getViewerProfileId, requireViewerProfile } from "@/lib/db/viewer";

/**
 * 会话列表与"打开会话"。
 *
 * 替代浏览器直连：原 `lib/supabase/chat.ts` 的 listChats / ensureChatThread
 * 在浏览器里用 anon key 读写，权限由 RLS 判断；现在这两件事都挪到服务端，
 * 调用者是谁只能由服务端从会话 cookie 解析 —— 请求体里**没有** viewerProfileId，
 * 客户端也无法伪造（见 hard rule：绝不接受调用者 id）。
 */

export const dynamic = "force-dynamic";

/** POST body。peer 是对方在会话行上的展示字段，不是身份凭证。 */
interface CreateChatBody {
  slug?: unknown;
  peer?: unknown;
  peerId?: unknown;
}

/**
 * 把 body 里的 peer 收敛成 `PeerDisplay`。
 *
 * peer 是**展示数据**（昵称、头像、等级、在线状态），会被原样写进会话行的冗余列，
 * 所以逐字段判类型，宁可留空也不要让任意 JSON 落库。
 */
function normalizePeer(raw: unknown): PeerDisplay | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const value = raw as Record<string, unknown>;

  return {
    id: typeof value.id === "string" ? value.id : "",
    name: typeof value.name === "string" ? value.name : "",
    avatarUrl:
      typeof value.avatarUrl === "string" && value.avatarUrl
        ? value.avatarUrl
        : null,
    level: typeof value.level === "number" ? value.level : null,
    isOnline: value.isOnline === true,
  };
}

/** 当前会员的会话列表。 */
export async function GET() {
  try {
    const viewerId = await getViewerProfileId();

    // 读接口允许浏览态：拿不到身份时给空列表，界面自然走空状态，
    // 而不是把 401 抛到客户端的列表刷新里（那会变成一个没人能处理的红字）。
    if (!viewerId) {
      return ok([]);
    }

    return ok(await listChats(viewerId));
  } catch (cause) {
    return errorResponse(cause);
  }
}

/**
 * 确保会话存在，并返回会话 + 消息（一次事务，见 db/chat.ts 的 ensureThreadWithMessages）。
 *
 * 这是写路径（upsert 一个 chats 行），所以要求真实会话身份：浏览态是只读展示身份，
 * 不能替别人建会话。
 */
export async function POST(request: Request) {
  try {
    const viewer = await requireViewerProfile();
    const body = await readJson<CreateChatBody>(request);

    const rawSlug = body?.slug;
    const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";

    if (!slug) {
      return fail(400, "缺少会话标识。");
    }

    const peer = normalizePeer(body?.peer);

    if (!peer) {
      return fail(400, "缺少对方资料。");
    }

    /*
      对方的 profile id 是会话成员关系的依据（chats.member_ids 是 uuid[]），
      也是拉黑/举报的作用对象，所以必须是合法 uuid：body 显式给的 peerId 优先，
      否则退回 peer.id。两者都不合法就明确拒绝，而不是把 "" 塞进 uuid 列。
    */
    const explicitPeerId = body?.peerId;
    const peerId = isUuid(explicitPeerId)
      ? explicitPeerId
      : isUuid(peer.id)
        ? peer.id
        : null;

    if (!peerId) {
      return fail(400, "对方资料不存在，无法发起会话。");
    }

    const result = await ensureThreadWithMessages({
      slug,
      viewerProfileId: viewer.id,
      peer: { ...peer, id: peerId },
    });

    return ok(result);
  } catch (cause) {
    return errorResponse(cause);
  }
}
