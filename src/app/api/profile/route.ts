import { errorResponse, fail, ok } from "@/app/api/_lib/http";
import { getViewerProfile } from "@/lib/db/viewer";

/**
 * 当前浏览者的身份。
 *
 * 替代原先浏览器里的 `ensureViewerProfile()`（Supabase 匿名登录 + 建 profiles 行）：
 * 自建版里 profiles 行在**注册**时就建好了（见 lib/db/auth.ts 的 registerWithIdentifier，
 * 以及 lib/db/viewer.ts 的身份解析），所以这里只做解析，不再写库。
 *
 * 读接口，因此允许"浏览态"（种子里的展示身份 u_current）——未登录也能拿到一个
 * 只读身份，界面上的会话列表、邀请码才和原型一致。写操作各自要求真实会话。
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profile = await getViewerProfile();

    if (!profile) {
      return fail(401, "还没有可用的会员身份。");
    }

    // 只回界面用得到的字段：不要把 phone、user_id 之类的身份信息送到浏览器。
    return ok({
      id: profile.id,
      handle: profile.handle,
      name: profile.display_name,
      avatarUrl: profile.avatar_url,
      level: profile.level,
      refCode: profile.ref_code,
    });
  } catch (cause) {
    return errorResponse(cause);
  }
}
