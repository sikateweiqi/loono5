import { getTranslations, setRequestLocale } from "next-intl/server";

import { Screen } from "@/components/layout/screen";
import { OnboardingPartner } from "@/components/onboarding/partner-step";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { emptyPreferences } from "@/lib/profile-defaults";
import type { UserLevel } from "@/types/user";

/**
 * Registration step 3 — module P「择偶条件」.
 *
 * Same conditions as 「完善个人信息」→「择偶条件」: free conditions are always
 * available, premium ones (P3) sit behind a level gate and the individually
 * charged ones (P4) show their price until purchased. A freshly registered
 * member has not subscribed yet, so the gates are still closed here — which is
 * exactly the upsell moment before the plan step.
 */
const NEW_MEMBER_LEVEL: UserLevel = 2;

/** Residence assumed for the demo; see the P7 region gate. */
const ASSUMED_RESIDENCE = "CN";

export default async function OnboardingPartnerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("onboarding.partner");

  return (
    <Screen
      width="narrow"
      footer={
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full rounded-full"
            render={<Link href="/onboarding/kyc" />}
          >
            {t("continue")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full rounded-full text-muted-foreground"
            render={<Link href="/onboarding/kyc" />}
          >
            {t("skip")}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {t("hint")}
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-1 pt-4">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <OnboardingPartner
        preferences={emptyPreferences}
        level={NEW_MEMBER_LEVEL}
        profileCountry={ASSUMED_RESIDENCE}
      />
    </Screen>
  );
}
