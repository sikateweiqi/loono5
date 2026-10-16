import { getTranslations } from "next-intl/server";

import { AuthForm } from "@/components/auth/auth-form";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ScreenHeader } from "@/components/layout/screen-header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";

/**
 * 注册页与登录页共用的骨架。
 *
 * 两个页面除了标题文案、协议勾选和"去对面"的链接之外完全一样，
 * 所以差异留在 `AuthForm` 的 `mode` 里，这里只负责外壳。
 *
 * 微信 / Apple 两个按钮是原型里的占位：第三方登录要等 OAuth 应用审核下来，
 * 先把位置留出来，免得将来排版又要动一轮。
 */
export async function AuthScreen({ mode }: { mode: "register" | "signin" }) {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  const linkClass = "text-muted-foreground";

  return (
    <AppShell>
      <ScreenHeader
        title={tc("appName")}
        center
        action={<LocaleSwitcher />}
        width="narrow"
      />

      <div className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col px-4 md:px-6">
        <div className="flex flex-col gap-1 pt-4 pb-6">
          <h2 className="text-xl font-bold">{t(`${mode}.title`)}</h2>
          <p className="text-sm text-muted-foreground">
            {t(`${mode}.subtitle`)}
          </p>
        </div>

        <AuthForm mode={mode} />

        <div className="flex items-center gap-3 py-6">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">{t("divider")}</span>
          <Separator className="flex-1" />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="lg"
            className="w-full rounded-full"
            disabled
          >
            WeChat
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full rounded-full"
            disabled
          >
            Apple
          </Button>
        </div>

        <div className="mt-auto pt-8 text-center">
          {/*
            这里的文案必须与去向对得上。改版前它写着"已有账号？去登录"却指向 /catalog，
            点下去到了目录页，是整条流程里最容易让人以为"注册坏了"的一处。
          */}
          {mode === "register" ? (
            <Button
              variant="link"
              className={linkClass}
              render={<Link href="/auth/login" />}
            >
              {t("hasAccount")}
            </Button>
          ) : (
            <Button
              variant="link"
              className={linkClass}
              render={<Link href="/auth/register" />}
            >
              {t("noAccount")}
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
