import { ArrowRight, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { RotatingTitle } from "@/components/landing/rotating-title";
import { StatsRow, type LandingStat } from "@/components/landing/stats-row";
import { VerifiedBadge } from "@/components/landing/verified-badge";
import { Link } from "@/i18n/navigation";
import { listCatalogMembers } from "@/lib/db/members";
import { cn } from "@/lib/utils";
import type { PublicUser } from "@/types/user";

import { Container } from "./section";

/**
 * Staggered collage of member tiles.
 *
 * Photos come from the same member directory the catalog reads, so the hero can
 * never show a face the rest of the product does not know about.
 */
function MemberCollage({
  caption,
  picks,
}: {
  caption: string;
  picks: PublicUser[];
}) {
  return (
    <div className="relative">
      <div className="grid grid-cols-3 gap-3 pb-8">
        {picks.map((user, index) => (
          <figure
            key={user.id}
            className={cn(
              "glass-card overflow-hidden rounded-2xl p-1.5 transition-transform duration-500 hover:-translate-y-1.5",
              // Middle column drops down so the block reads as a collage
              // rather than a rigid table.
              index % 3 === 1 && "translate-y-7",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt=""
              loading="lazy"
              className="aspect-[3/4] w-full rounded-xl object-cover"
            />

            <figcaption className="px-1 pt-2 pb-1">
              <span className="block truncate text-[11px] font-semibold text-foreground">
                {user.name}
              </span>
              <span className="flex items-center gap-0.5 truncate text-[10px] text-muted-foreground">
                <MapPin className="size-2.5 shrink-0" />
                {user.age} · {user.city}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="text-center text-[10px] text-muted-foreground/70">
        {caption}
      </p>
    </div>
  );
}

export async function DesktopHero() {
  const t = await getTranslations("portal");
  const tg = await getTranslations("guest");

  const titles = tg.raw("heroTitles") as string[];

  // 取真实会员填充拼贴墙；库为空时退化成空数组，版面自然收起而不是报错。
  const picks = (await listCatalogMembers()).slice(0, 6);

  const stats: LandingStat[] = [
    { value: "120K+", label: t("hero.stats.members") },
    { value: "80+", label: t("hero.stats.countries") },
    { value: "2.1M+", label: t("hero.stats.matches") },
  ];

  return (
    <section className="relative pb-16 xl:pb-24">
      <Container className="grid items-center gap-14 pt-14 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:gap-20 xl:pt-20">
        <div className="flex flex-col items-start gap-6">
          <VerifiedBadge>{t("hero.badge")}</VerifiedBadge>

          <h1 className="flex flex-col gap-2">
            <span className="text-4xl leading-[1.1] font-bold tracking-tight text-balance text-foreground xl:text-[3.3rem]">
              {t("hero.title")}
            </span>
            <RotatingTitle
              phrases={titles}
              className="text-2xl font-bold tracking-tight xl:text-[1.9rem]"
            />
          </h1>

          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground xl:text-base">
            {t("hero.subtitle")}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/auth/register"
              className="loono-cta flex h-13 items-center gap-2 rounded-2xl px-8 text-base font-bold tracking-tight"
            >
              {t("hero.ctaPrimary")}
              <ArrowRight className="size-4" />
            </Link>

            <Link
              href="#pricing"
              className="loono-cta-ghost flex h-13 items-center rounded-2xl px-7 text-sm font-semibold"
            >
              {t("hero.ctaSecondary")}
            </Link>
          </div>

          <p className="text-[11px] text-muted-foreground/85">
            {t("hero.trustLine")}
          </p>

          <StatsRow stats={stats} className="w-full max-w-md" />
        </div>

        <MemberCollage caption={t("hero.collageCaption")} picks={picks} />
      </Container>

      {/* The single most persuasive line on the page, on its own. */}
      <Container className="mt-16 xl:mt-20">
        <p className="flex items-center justify-center gap-3 text-center text-sm font-medium text-muted-foreground">
          <span className="relative flex size-2 shrink-0 items-center justify-center">
            <span className="animate-loono-pulse-ring absolute inset-0 rounded-full bg-emerald-500/60" />
            <span className="size-2 rounded-full bg-emerald-500" />
          </span>
          {t("hero.pulse")}
        </p>
      </Container>
    </section>
  );
}
