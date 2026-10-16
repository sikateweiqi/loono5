import { setRequestLocale } from "next-intl/server";

import { AuthScreen } from "@/components/auth/auth-screen";

/**
 * 登录页。通道与注册页一致（手机号 / 邮箱 + 验证码），
 * 但遇到没有注册过的标识会直接把人引到注册页，而不是默默给他建一个新账号。
 */
export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AuthScreen mode="signin" />;
}
