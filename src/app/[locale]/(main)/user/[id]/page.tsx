import { Crown, MapPin, MoreHorizontal } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Screen } from "@/components/layout/screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { ProfileAttributes } from "@/components/profile/profile-attributes";
import {
  VerificationBadges,
  VerificationTagWall,
} from "@/components/profile/verification-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMember } from "@/lib/db/members";
import { canView, effectiveLevel, isLocked } from "@/lib/tiers";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("user");
  const tt = await getTranslations("tier");
  const tv = await getTranslations("verification");

  // 路由参数既可能是 uuid 也可能是 handle（`u_01`），getMember 两种都认。
  const user = await getMember(id);
  if (!user) {
    notFound();
  }

  const viewerLevel = effectiveLevel(await getCurrentUser());
  const targetLevel = effectiveLevel(user);

  const unlocked =
    viewerLevel !== null &&
    targetLevel !== null &&
    canView(viewerLevel, targetLevel);
  const locked =
    viewerLevel !== null &&
    targetLevel !== null &&
    isLocked(viewerLevel, targetLevel);

  return (
    <>
      <ScreenHeader
        backHref="/catalog"
        title={user.name}
        action={
          <Button variant="ghost" size="icon" aria-label={t("report")}>
            <MoreHorizontal className="size-5" />
          </Button>
        }
      />

      <Screen flush>
        {/* Portrait on the left, everything else on the right, from xl up. */}
        <div className="xl:flex xl:items-start xl:gap-6 xl:px-8 xl:py-6">
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted xl:sticky xl:top-6 xl:w-[21rem] xl:shrink-0 xl:rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="size-full object-cover"
            />

            {locked ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 px-6 text-center backdrop-blur-sm">
                <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                  <Crown className="size-3" />L{targetLevel}
                </span>
                <p className="text-sm font-semibold text-white">
                  {t("locked.title")}
                </p>
                <p className="max-w-[15rem] text-xs leading-relaxed text-white/75">
                  {t("locked.description", { level: targetLevel })}
                </p>
                <Button
                  size="sm"
                  className="rounded-full"
                  render={<Link href="/profile/subscription" />}
                >
                  {t("locked.cta")}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 px-4 py-4 xl:min-w-0 xl:flex-1 xl:px-0 xl:py-0">
            <header className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">{user.name}</h2>
                <Badge variant="outline" className="gap-0.5 text-[10px]">
                  <Crown className="size-2.5" />L{user.level}
                </Badge>
              </div>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                {t("ageCity", { age: user.age, city: user.city })}
              </p>

              <VerificationBadges
                tags={user.verifications}
                showUnverified
                size="sm"
                className="mt-1"
              />
            </header>

            {!unlocked && !locked ? (
              <Card className="p-4 text-xs text-muted-foreground">
                {tt("requiredLevel", { level: user.level })}
              </Card>
            ) : null}

            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">{t("about")}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {user.bio}
              </p>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">{t("interests")}</h3>
              <ul className="flex flex-wrap gap-2">
                {user.interests.map((interest) => (
                  <li key={interest}>
                    <Badge
                      variant="secondary"
                      className="rounded-full font-normal"
                    >
                      {interest}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
            {user.profile ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t("details")}</h3>
                <ProfileAttributes profile={user.profile} />
              </section>
            ) : null}

            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">{tv("title")}</h3>
              <VerificationTagWall tags={user.verifications} />
            </section>
          </div>
        </div>
      </Screen>
    </>
  );
}
