"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPrice, isContactSales, planLabelKey } from "@/lib/plans";
import type { Plan, UserLevel } from "@/types/user";

/**
 * Step 3: pick a plan and optionally redeem a 30-day Level 1 trial code.
 * Level selection is local state until checkout is wired up.
 *
 * 档位是「数据」不是「状态」，所以由服务端页面查库后作为 props 传入 ——
 * 这样这个组件可以保持纯客户端交互，不必为了读库把自己变成异步组件。
 */
export function OnboardingSubscription({ plans }: { plans: Plan[] }) {
  const t = useTranslations("onboarding.subscription");
  const tf = useTranslations("onboarding.subscription.features");
  const ts = useTranslations("subscription");
  const locale = useLocale();

  const [selected, setSelected] = useState<UserLevel>(1);
  const [promo, setPromo] = useState("");
  const [promoState, setPromoState] = useState<"idle" | "applied">("idle");

  return (
    <>
      <div className="flex flex-col gap-1 pt-4 pb-2">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <p className="mb-4 rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {t("equalPayNotice")}
      </p>

      <ul className="flex flex-col gap-3">
        {plans.map((plan) => {
          const active = selected === plan.level;
          return (
            <li key={plan.level}>
              <button
                type="button"
                onClick={() => setSelected(plan.level)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-primary" : "border-border",
                  )}
                >
                  {active ? (
                    <span className="size-2.5 rounded-full bg-primary" />
                  ) : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {t(planLabelKey(plan.level))}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      L{plan.level}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {tf("viewProfiles")}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  {isContactSales(plan) || plan.priceMonthly === null ? (
                    <>
                      <span className="block text-sm font-bold text-primary">
                        {ts("contactUs")}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {ts("byInvitation")}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block text-base font-bold">
                        {formatPrice(plan.priceMonthly, plan.currency, locale)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {t("perMonth")}
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("promoLabel")}</span>
          {promoState === "applied" ? (
            <Badge className="rounded-full bg-emerald-600 text-[10px] text-white">
              {t("promoApplied")}
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full text-[10px]">
              {t("trialBadge")}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={promo}
            onChange={(event) => setPromo(event.target.value)}
            placeholder={t("promoPlaceholder")}
            className="flex-1 font-mono uppercase"
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              if (promo.trim()) {
                setPromoState("applied");
                setSelected(1);
              }
            }}
          >
            {t("promoApply")}
          </Button>
        </div>
      </div>
    </>
  );
}
