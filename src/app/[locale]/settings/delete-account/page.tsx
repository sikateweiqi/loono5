import { DeleteAccountFlow } from "@/components/account/delete-account-flow";
import { AppShell } from "@/components/layout/app-shell";
import { getMockSession } from "@/lib/auth/session";

/**
 * Account deletion entry point (module Q).
 *
 * Lives outside the `(main)` route group so the bottom tab bar is hidden —
 * users should finish or explicitly leave this flow instead of wandering off
 * through the tabs.
 */
export default async function DeleteAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Resolve the locale so nested client components inherit the request scope.
  await params;

  const session = await getMockSession();

  // 只传手机号：注销流程要用它做身份核对（界面里会遮罩展示）。
  // 邮箱注册的账号目前拿到 null，界面显示 "—" —— 邮箱通道的核对方式
  // 还没定（是回一封确认信，还是人工审核），定了再补这里，不先假装支持。
  return (
    <AppShell>
      <DeleteAccountFlow phone={session?.phone ?? null} />
    </AppShell>
  );
}
