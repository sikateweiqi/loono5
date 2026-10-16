import {
  Handshake,
  Heart,
  Languages,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GhostCta, PrimaryCta } from "@/components/landing/cta";
import { DesktopLanding } from "@/components/landing/desktop/desktop-landing";
import { FeatureCard } from "@/components/landing/feature-card";
import { RotatingTitle } from "@/components/landing/rotating-title";
import { SoftBackdrop } from "@/components/landing/soft-backdrop";
import { StatsRow } from "@/components/landing/stats-row";
import { VerifiedBadge } from "@/components/landing/verified-badge";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Link } from "@/i18n/navigation";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("guest");
  const tc = await getTranslations("common");

  const titles = t.raw("heroTitles") as string[];

  const features = [
    {
      icon: ShieldCheck,
      title: t("featuresVerified"),
      description: t("featuresVerifiedDesc"),
    },
    {
      icon: Sparkles,
      title: t("featuresTier"),
      description: t("featuresTierDesc"),
    },
    {
      icon: Languages,
      title: t("featuresTranslate"),
      description: t("featuresTranslateDesc"),
    },
  ];

  const stats = [
    { value: "120K+", label: t("stats.members") },
    { value: "80+", label: t("stats.countries") },
    { value: "8.4K", label: t("stats.online") },
  ];

  return (
    <>
      {/*
        Below `lg` (H5 + tablet): the light-luxury landing.
        From `lg` up: the long-form marketing home in `landing/desktop`.
        The swap is pure CSS — no viewport JS, so no hydration mismatch.

        Note the consumer surface deliberately says nothing about agents or
        agencies. The only outward-facing door is the partners application
        form, rendered as a quiet text link in the footer.
      */}
      <div className="lg:hidden">
        <AppShell>
          <div className="loono-surface relative flex min-h-full flex-1 flex-col">
            <SoftBackdrop />

            {/* ── Header ──────────────────────────────────────────────── */}
            <header className="relative z-10 mx-auto flex w-full max-w-[64rem] items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 md:px-8">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-opacity hover:opacity-85"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-loono-champagne to-loono-champagne-deep shadow-[0_6px_18px_-8px] shadow-loono-champagne/80">
                  <Heart className="size-4 fill-white text-white" />
                </span>
                <span className="text-base font-bold tracking-tight text-foreground">
                  {tc("appName")}
                </span>
              </Link>

              <LocaleSwitcher className="glass-pill" />
            </header>

            {/* ── Hero ──────────────────────────────────────────────────────── */}
            <main className="relative z-10 mx-auto flex w-full max-w-[64rem] flex-1 flex-col px-5 pb-2 md:px-8">
              <section className="flex flex-col items-center gap-5 pt-6 pb-7 text-center md:pt-14 md:pb-12">
                <VerifiedBadge>{t("verifiedBadge")}</VerifiedBadge>

                <h1 className="text-[1.9rem] leading-[1.12] font-bold tracking-tight text-foreground">
                  <span className="block">{t("heroTitle")}</span>
                  <RotatingTitle
                    phrases={titles}
                    className="mt-1.5 text-[1.6rem] sm:text-[1.9rem]"
                  />
                </h1>

                <p className="max-w-[19rem] text-sm leading-relaxed text-muted-foreground">
                  {t("heroSubtitle")}
                </p>

                <div className="w-full max-w-xs">
                  <StatsRow stats={stats} className="mb-5" />

                  <div className="flex flex-col gap-2.5">
                    <PrimaryCta href="/auth/register" />
                    <GhostCta href="/catalog">{t("ctaSecondary")}</GhostCta>
                  </div>

                  <p className="mt-3.5 text-[11px] leading-relaxed text-muted-foreground/85">
                    {t("trustLine")}
                  </p>
                </div>
              </section>

              {/* ── Benefits ─────────────────────────────────────────────────── */}
              <ul className="flex flex-col gap-2.5 pb-3 md:grid md:grid-cols-3 md:gap-3">
                {features.map((feature) => (
                  <FeatureCard
                    key={feature.title}
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                  />
                ))}
              </ul>
            </main>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <footer className="relative z-10 mx-auto w-full max-w-[64rem] px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-8">
              <Link
                href="/partners/apply"
                className="group flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/70 hover:text-foreground"
              >
                <Handshake className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5" />
                {t("partnerCta")}
                <span
                  aria-hidden
                  className="text-muted-foreground/50 transition-transform duration-300 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>

              <p className="pt-1 text-center text-[10px] text-muted-foreground/70">
                {tc("tagline")}
              </p>
            </footer>
          </div>
        </AppShell>
      </div>

      <div className="hidden lg:block">
        <DesktopLanding locale={locale} />
      </div>
    </>
  );
}
