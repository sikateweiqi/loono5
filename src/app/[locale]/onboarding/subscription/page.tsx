import { getTranslations, setRequestLocale } from "next-intl/server";

import { Screen } from "@/components/layout/screen";
import { OnboardingSubscription } from "@/components/onboarding/subscription-step";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listPlans } from "@/lib/db/plans";

export default async function OnboardingSubscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("onboarding.subscription");
  const plans = await listPlans();

  return (
    <Screen
      width="narrow"
      footer={
        <Button
          size="lg"
          className="w-full rounded-full"
          render={<Link href="/catalog" />}
        >
          {t("continue")}
        </Button>
      }
    >
      <OnboardingSubscription plans={plans} />
    </Screen>
  );
}
