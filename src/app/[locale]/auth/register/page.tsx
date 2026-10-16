import { setRequestLocale } from "next-intl/server";

import { AuthScreen } from "@/components/auth/auth-screen";

/**
 * 注册页。手机号或邮箱二选一，验证码通过后即建号并进入补资料流程。
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AuthScreen mode="register" />;
}
