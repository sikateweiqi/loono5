import { setRequestLocale } from "next-intl/server";

import { OnboardingProfile } from "@/components/onboarding/profile-step";
import { getProfileBasics } from "@/lib/db/members";
import { getViewerProfile } from "@/lib/db/viewer";
import { redirect } from "@/i18n/navigation";
import { emptyProfileBasics } from "@/lib/profile-defaults";

/**
 * Registration step 1 — module O「完善个人资料」.
 *
 * 这个页面只做三件事：确认来的人是谁、取回他的档案、把表单交给客户端组件。
 * 曾经它是个纯静态表单（照片格子的加号点了没反应、字段也不落库），
 * 现在读写都接上了（见 lib/profile/actions.ts）。
 *
 * 回填用 `getProfileBasics` 而不是 `getCurrentUser`：后者返回的
 * `PublicUser` 是面向展示的形状（只有算好的 age，没有原始出生日期），
 * 拿它回填会让滚轮每次打开都停在默认位置，用户会以为自己的生日没保存。
 */
export default async function OnboardingProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  /*
    判据与写接口一致：必须是**真实会员**。
    未登录时会回落到浏览态的种子账号 `u_current`，而这一步是要写库的 ——
    让它填完再被拒，用户会以为是自己填错了什么。

    这里用 redirect 而不是抛 401：手输这个地址的人应该被送回注册页，
    而不是看到一张错误页。没有"登录后跳回原地址"的机制是因为
    注册流程本身就是从这里往下走的，跳回注册页不会丢任何进度。
  */
  const viewer = await getViewerProfile();

  if (!viewer || viewer.handle === "u_current") {
    return redirect({ href: "/auth/register", locale });
  }

  const basics = (await getProfileBasics(viewer.id)) ?? emptyProfileBasics;

  return <OnboardingProfile member={basics} />;
}
