import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/**
 * 旧的单页入口，现在只做一个跳转。
 *
 * 注册与登录拆成 `/auth/register` 与 `/auth/login` 之后，这个路径不再有自己的界面，
 * 但它不能 404 —— 已经发出去的邀请链接（`/auth?ref=CODE`）、
 * 历史书签、以及印在推广物料上的二维码都还指着它。
 * 跳转而不是删除，是为了让这些链接继续可用；`?ref=` 由 middleware 在
 * 任意路径上捕获（见 src/middleware.ts），跨过这一跳也不会丢。
 */
export default async function AuthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return redirect({ href: "/auth/register", locale });
}
