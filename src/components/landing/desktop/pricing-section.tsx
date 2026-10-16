import { Check, Crown, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { listPlans } from "@/lib/db/plans";
import {
  formatPrice,
  isContactSales,
  planLabelKey,
  yearlySavingPercent,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

import { Container, Section, SectionHeading } from "./section";

/** Tier cards, driven by the same `plans` table the in-app paywall uses. */
export async function PricingSection({ locale }: { locale: string }) {
  const t = await getTranslations("portal");
  const ts = await getTranslations("subscription");

  const features = t.raw("pricing.planFeatures") as string[][];
  // 档位与价格来自 `plans` 表，与站内付费墙共用同一份数据 —— 运营调价不用发版。
  const plans = await listPlans();

  return (
    <Section id="pricing">
      <Container>
        <SectionHeading
          eyebrow={t("pricing.eyebrow")}
          title={t("pricing.title")}
          subtitle={t("pricing.subtitle")}
        />

        <ul className="mt-14 grid gap-5 lg:grid-cols-2 xl:grid-cols-4 xl:gap-6">
          {plans.map((plan) => {
            const contact = isContactSales(plan);
            const popular = plan.level === 2;
            const saving = yearlySavingPercent(plan);

            return (
              <li
                key={plan.level}
                className={cn(
                  "glass-card relative flex flex-col gap-5 rounded-3xl p-7",
                  popular && "ring-2 ring-loono-champagne/70",
                )}
              >
                {popular ? (
                  <span className="absolute -top-3 left-7 flex items-center gap-1 rounded-full bg-gradient-to-r from-loono-champagne-deep to-loono-champagne px-3 py-1 text-[10px] font-bold tracking-wide text-loono-ink uppercase">
                    <Sparkles className="size-3" />
                    {t("pricing.popular")}
                  </span>
                ) : null}

                <div className="flex items-center gap-2">
                  <Crown
                    className="size-4 text-loono-champagne-deep"
                    strokeWidth={2}
                  />
                  <h3 className="text-base font-semibold text-foreground">
                    {ts(planLabelKey(plan.level))}
                  </h3>
                </div>

                <div className="flex flex-col gap-1.5">
                  {contact ? (
                    <span className="text-2xl font-bold text-foreground">
                      {t("pricing.byInvitation")}
                    </span>
                  ) : (
                    <span className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                        {formatPrice(
                          plan.priceMonthly ?? 0,
                          plan.currency,
                          locale,
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("pricing.monthly")}
                      </span>
                    </span>
                  )}

                  {saving > 0 ? (
                    <span className="w-fit rounded-full bg-loono-sand px-2.5 py-0.5 text-[10px] font-medium text-loono-ink-soft">
                      {t("pricing.yearlySave", { percent: saving })}
                    </span>
                  ) : null}
                </div>

                <p className="text-xs text-muted-foreground">
                  {t("pricing.visibility", { from: 1, to: plan.level })}
                </p>

                <ul className="flex flex-col gap-2.5 border-t border-border pt-5">
                  {features[plan.level - 1]?.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"
                    >
                      <Check
                        className="mt-px size-3.5 shrink-0 text-emerald-600"
                        strokeWidth={2.6}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/auth/register"
                  className={cn(
                    "mt-auto flex h-11 items-center justify-center rounded-2xl text-sm font-semibold transition-colors",
                    popular ? "loono-cta" : "loono-cta-ghost",
                  )}
                >
                  {contact ? t("pricing.contactCta") : t("pricing.cta")}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-center text-[11px] text-muted-foreground/70">
          {t("pricing.note")}
        </p>
      </Container>
    </Section>
  );
}
