import {
  ChevronRight,
  Crown,
  HeartHandshake,
  LogOut,
  Settings as SettingsIcon,
  UserCog,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { MockLevelSwitcher } from "@/components/auth/mock-level-switcher";
import { Screen } from "@/components/layout/screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import {
  PartnerPreferenceSummary,
  ProfileAttributes,
} from "@/components/profile/profile-attributes";
import { ReferralLink } from "@/components/profile/referral-link";
import {
  VerificationBadges,
  VerificationTagWall,
} from "@/components/profile/verification-badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listPlans } from "@/lib/db/plans";
import { emptyPreferences, emptyProfile } from "@/lib/profile-defaults";
import { planLabelKey } from "@/lib/plans";
import { profileCompletion } from "@/lib/profile-options";
import { daysUntilExpiry, hasActiveSubscription } from "@/lib/tiers";
import { VERIFICATION_TAG_COUNT, countVerifiedTags } from "@/lib/verification";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("profile");
  const ts = await getTranslations("subscription");
  const tv = await getTranslations("verification");

  const currentUser = await getCurrentUser();

  const active = hasActiveSubscription(currentUser);
  const expiresAt = currentUser.subscription.expiresAt;
  // 价格来自 plans 表而不是代码常量：运营调价不该需要发版（PRD P6）。
  const plans = await listPlans();
  const plan = plans.find(
    (item) => item.level === currentUser.subscription.level,
  );
  const verifiedCount = countVerifiedTags(currentUser.verifications);

  const profile = currentUser.profile ?? emptyProfile;
  const preferences = currentUser.preferences ?? emptyPreferences;
  const completion = profileCompletion(profile);

  // Consumer-only shortcuts. There is deliberately no partner/agent entry
  // here: the B2B cabinet lives on its own host (partner.loono.com) and is
  // never advertised to members. The single outward door is the Partners
  // application form, linked from the marketing footer rather than from the
  // signed-in product.
  const rows = [
    { href: "/profile/subscription", icon: Crown, label: t("subscription") },
    { href: "/profile/edit", icon: UserCog, label: t("edit") },
    { href: "/settings", icon: SettingsIcon, label: t("settings") },
  ];

  return (
    <>
      <ScreenHeader title={t("title")} />

      <Screen>
        {/*
          Two columns from xl up, one column on mobile.

          The two grouping divs are `display: contents` below xl, so their
          children drop straight into the outer flex column and the mobile
          stacking order is exactly what it always was. The `order-*` values
          do double duty: they reproduce the original interleaved sequence on
          mobile, and inside each desktop column they are already ascending.
        */}
        <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] xl:items-start xl:gap-x-6">
          {/* ── Left: identity, level, shortcuts ───────────────────────── */}
          <div className="contents xl:flex xl:flex-col xl:gap-3">
            <Card className="order-1 p-4">
              <div className="flex flex-row items-center gap-3">
                <Avatar className="size-14">
                  <AvatarImage src={currentUser.avatarUrl} alt="" />
                  <AvatarFallback>
                    {currentUser.name.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {currentUser.name}
                  </span>
                  <p className="truncate text-xs text-muted-foreground">
                    {currentUser.age} · {currentUser.city}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  render={<Link href="/profile/edit" />}
                >
                  {t("edit")}
                </Button>
              </div>

              <VerificationBadges
                tags={currentUser.verifications}
                showUnverified
                size="sm"
                className="mt-3"
              />
            </Card>

            <Card className="order-5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {t("myLevel")}
                </span>
                <Badge className="gap-1 rounded-full">
                  <Crown className="size-3" />
                  {t("level", { level: currentUser.subscription.level ?? 1 })}
                </Badge>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {plan ? ts(planLabelKey(plan.level)) : "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {active && expiresAt
                      ? `${t("expiresAt")}: ${new Date(expiresAt).toLocaleDateString(locale)} · ${t("daysLeft", { days: daysUntilExpiry(expiresAt) })}`
                      : t("expired")}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="rounded-full"
                  render={<Link href="/profile/subscription" />}
                >
                  {t("upgrade")}
                </Button>
              </div>
            </Card>

            <MockLevelSwitcher
              current={currentUser.subscription.level}
              signedIn={true}
              className="order-6"
            />

            <Card className="order-7 overflow-hidden p-0">
              {rows.map((row, index) => {
                const Icon = row.icon;
                return (
                  <div key={row.href}>
                    {index > 0 ? <Separator /> : null}
                    <Link
                      href={row.href}
                      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 active:bg-muted"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm">{row.label}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </div>
                );
              })}
            </Card>

            <Button
              variant="ghost"
              className="order-8 w-full gap-2 text-destructive hover:text-destructive"
            >
              <LogOut className="size-4" />
              {t("logout")}
            </Button>
          </div>

          {/* ── Right: profile depth, preferences, verifications ─────────── */}
          <div className="contents xl:flex xl:flex-col xl:gap-3">
            {/* Module P — completeness + the extended attribute set. */}
            <Card className="order-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("completeness")}
                </span>
                <span className="text-[11px] font-medium tabular-nums">
                  {t("completenessValue", { percent: completion.percent })}
                </span>
              </div>

              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${completion.percent}%` }}
                />
              </div>

              <ProfileAttributes profile={profile} className="mt-4" />

              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full rounded-full"
                render={<Link href="/profile/edit" />}
              >
                {t("details")}
              </Button>
            </Card>

            {/* Module P — the conditions this member puts on a partner. */}
            <Card className="order-3 p-4">
              <div className="flex items-center gap-2">
                <HeartHandshake className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-xs text-muted-foreground">
                  {t("preferences")}
                </span>
                <Link
                  href="/profile/edit?tab=partner"
                  className="text-[11px] font-medium text-primary"
                >
                  {t("setPreferences")}
                </Link>
              </div>

              <PartnerPreferenceSummary
                preferences={preferences}
                level={currentUser.subscription.level ?? currentUser.level}
                className="mt-3"
              />
            </Card>

            <Card className="order-4 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {tv("title")}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {tv("count", {
                    verified: verifiedCount,
                    total: VERIFICATION_TAG_COUNT,
                  })}
                </span>
              </div>

              <VerificationTagWall
                tags={currentUser.verifications}
                className="mt-3"
              />

              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full rounded-full"
                render={<Link href="/onboarding/kyc" />}
              >
                {tv("manage")}
              </Button>
            </Card>

            {/* Referral — own code and share link, read from the database. */}
            <ReferralLink className="order-9 xl:order-none" />
          </div>
        </div>
      </Screen>
    </>
  );
}
