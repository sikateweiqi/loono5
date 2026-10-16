import { getTranslations, setRequestLocale } from "next-intl/server";

import { Screen } from "@/components/layout/screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { PlanPicker } from "@/components/profile/plan-picker";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listPlans } from "@/lib/db/plans";
import { hasActiveSubscription } from "@/lib/tiers";

export default async function SubscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("subscription");

  const currentUser = await getCurrentUser();
  const plans = await listPlans();

  return (
    <>
      <ScreenHeader backHref="/profile" title={t("title")} width="narrow" />

      <Screen width="narrow">
        <p className="pb-4 text-sm text-muted-foreground">{t("subtitle")}</p>

        <PlanPicker
          plans={plans}
          locale={locale}
          currentLevel={
            hasActiveSubscription(currentUser)
              ? currentUser.subscription.level
              : null
          }
        />
      </Screen>
    </>
  );
}
