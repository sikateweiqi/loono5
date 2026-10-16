import {
  Bell,
  ChevronRight,
  CreditCard,
  FileText,
  Globe,
  HelpCircle,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  UserRound,
  UserX,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { MockLevelSwitcher } from "@/components/auth/mock-level-switcher";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Screen } from "@/components/layout/screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { isSignedIn } from "@/lib/auth/current-user";
import { getMockSession } from "@/lib/auth/session";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("settings");
  const tm = await getTranslations("settings.mock");
  const tc = await getTranslations("common");

  const session = await getMockSession();
  const signedIn = await isSignedIn();

  const groups = [
    {
      title: t("account"),
      rows: [
        {
          icon: UserRound,
          label: t("accountEdit"),
          href: "/profile/edit",
        },
        { icon: Lock, label: t("security"), href: "#" },
        { icon: ShieldCheck, label: t("privacy"), href: "#" },
        { icon: CreditCard, label: t("blockedUsers"), href: "#" },
      ],
    },
    {
      title: t("support"),
      rows: [
        { icon: HelpCircle, label: t("contactUs"), href: "#" },
        { icon: FileText, label: t("terms"), href: "#" },
        { icon: FileText, label: t("privacyPolicy"), href: "#" },
      ],
    },
  ];

  return (
    <>
      <ScreenHeader
        title={t("title")}
        backHref="/profile"
        action={<LocaleSwitcher />}
        width="narrow"
      />

      <Screen width="narrow">
        <MockLevelSwitcher
          current={session?.level ?? null}
          signedIn={signedIn}
          className="mb-4"
        />

        {session ? (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-xs">
            <span className="text-muted-foreground">{tm("session")}</span>
            <span className="font-mono">{session.identifier}</span>
          </div>
        ) : null}

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Globe className="size-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("language")}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t("languageDesc")}
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bell className="size-4 text-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("notifications")}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t("pushNotifications")}
              </p>
            </div>
            <Switch defaultChecked aria-label={t("pushNotifications")} />
          </div>
        </section>

        {groups.map((group) => (
          <section key={group.title} className="mt-4">
            <h2 className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
              {group.title}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {group.rows.map((row, index) => {
                const Icon = row.icon;
                return (
                  <div key={row.label}>
                    {index > 0 ? <Separator /> : null}
                    <a
                      href={row.href}
                      className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50 active:bg-muted"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm">{row.label}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 p-4">
            <Trash2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-sm">{t("clearCache")}</span>
          </div>
          <Separator />
          <div className="flex items-center gap-3 p-4">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-sm">{t("about")}</span>
            <span className="text-[11px] text-muted-foreground">
              {tc("appName")} v1.0.0
            </span>
          </div>
        </section>

        <Link
          href="/settings/delete-account"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/50 active:bg-muted"
        >
          <UserX className="size-4 shrink-0 text-destructive" />
          <span className="flex-1 text-sm text-destructive">
            {t("deleteAccount")}
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 text-sm text-destructive transition-colors hover:bg-muted/50"
        >
          <LogOut className="size-4" />
          {t("logout")}
        </button>
      </Screen>
    </>
  );
}
