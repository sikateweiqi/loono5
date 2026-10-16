import { setRequestLocale } from "next-intl/server";

import { OnboardingAttributes } from "@/components/onboarding/attributes-step";
import { redirect } from "@/i18n/navigation";
import { getMember } from "@/lib/db/members";
import { getViewerProfile } from "@/lib/db/viewer";
import { emptyProfile } from "@/lib/profile-defaults";

/**
 * Registration step 2 — module P「个人属性」.
 *
 * 与第一步一样只做三件事：确认来的人是谁、取回他的属性、把表单交给客户端组件。
 *
 * 为什么现在要读库（而不是像以前那样直接喂 `emptyProfile`）
 * ------------------------------------------------------
 * 这一步从本轮起会**真的落库**了。如果仍然每次都用空值渲染，
 * 会员第二次进入这个页面（注册流程中途返回、或从别处跳回来）
 * 会看到一张全空白的表，然后一提交就把上次填好的属性全部覆盖成空 ——
 * 那比"不落库"更糟，因为用户没法察觉。
 *
 * 守卫与第一步保持一致：必须是**真实会员**。未登录时会回落到浏览态的
 * 种子账号 `u_current`，而这一步要写库 —— 让它填完再被拒，
 * 用户会以为是自己填错了什么。
 */
export default async function OnboardingAttributesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const viewer = await getViewerProfile();

  if (!viewer || viewer.handle === "u_current") {
    return redirect({ href: "/auth/register", locale });
  }

  /*
    走 `getMember` 而不是单独写一个属性读取函数：它本来就用一条
    left join 把 `profiles` 与卫星表拼好了，`toProfile` 也已经把
    `profile_attributes` 的列映射成 `PersonalProfile`。
    多写一个查询函数只会多一处需要跟着列变更同步的地方。
  */
  const member = await getMember(viewer.id);
  const profile = member?.profile ?? emptyProfile;

  /*
    居住地在第一步填。若这里取到的是空值（会员跳过了第一步就直达本页），
    与其让第二步显示一个空的居住地、显得像是"这里也要填"，
    不如直接把人送回第一步 —— 那才是填居住地的地方。
  */
  if (!profile.countryCode || !profile.city) {
    return redirect({ href: "/onboarding/profile", locale });
  }

  return <OnboardingAttributes profile={profile} />;
}
