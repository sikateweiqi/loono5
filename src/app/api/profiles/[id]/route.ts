import { errorResponse, fail, ok } from "@/app/api/_lib/http";
import { getMember } from "@/lib/db/members";

/**
 * 只读的会员查询（id 或 handle 都接受，见 db/members.ts 的 getMember）。
 *
 * 用途是会话列表里的认证徽章：会话行只冗余了对方的展示字段
 * （peer_name / peer_avatar_url / peer_level / peer_is_online），
 * 没有徽章，徽章只能按 peer_id 单独取。
 *
 * 不加鉴权：返回的内容与目录页（GET /api 之外的服务端渲染）对任何访问者都一样，
 * 公开目录数据不是秘密；加一层鉴权只会让未登录的浏览态看不见徽章。
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 只接受 uuid 或 handle 形状的输入：这个参数会进 SQL（参数化，但没必要
    // 让任意长度/字符的串打到库里），也不该拿它做目录扫描的入口。
    if (!/^[0-9a-zA-Z_-]{1,64}$/.test(id)) {
      return fail(400, "会员标识不合法。");
    }

    const member = await getMember(id);

    if (!member) {
      return fail(404, "没有找到这位会员。");
    }

    return ok(member);
  } catch (cause) {
    return errorResponse(cause);
  }
}
