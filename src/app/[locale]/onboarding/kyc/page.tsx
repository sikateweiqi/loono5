import { Camera, CheckCircle2, Clock, XCircle } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Screen } from "@/components/layout/screen";
import { KycBirthDate } from "@/components/onboarding/kyc-birth-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

/** Status is derived from the member's KYC record; see `KycStatus`. */
const STATUS_META = {
  unverified: { icon: Camera, className: "text-muted-foreground" },
  pending: { icon: Clock, className: "text-amber-600" },
  approved: { icon: CheckCircle2, className: "text-emerald-600" },
  rejected: { icon: XCircle, className: "text-destructive" },
} as const;

export default async function OnboardingKycPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("onboarding.kyc");
  // KYC 状态是会员档案上的真实字段，不再是常量。
  const member = await getCurrentUser();
  const status = STATUS_META[member.kycStatus];
  const StatusIcon = status.icon;
  const isApproved = member.kycStatus === "approved";

  return (
    <Screen
      width="narrow"
      footer={
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full rounded-full"
            render={<Link href="/onboarding/subscription" />}
          >
            {isApproved ? t("submit") : t("startFace")}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {t("expected")}
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-1 pt-4 pb-4">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
        <span className="text-sm font-medium">{t("faceTitle")}</span>
        <Badge variant="outline" className={status.className}>
          <StatusIcon className="size-3" />
          {isApproved ? t("statusApproved") : t("statusPending")}
        </Badge>
      </div>

      <form className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>{t("identityLabel")}</Label>
          <Select defaultValue="passport" name="identityType">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="passport">{t("idPassport")}</SelectItem>
              <SelectItem value="national">{t("idNational")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="legalName">{t("legalNameLabel")}</Label>
          <Input id="legalName" name="legalName" autoComplete="name" required />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="idNumber">{t("idNumberLabel")}</Label>
          <Input id="idNumber" name="idNumber" autoComplete="off" required />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="birthDate">{t("birthDateLabel")}</Label>
          {/*
            与「完善个人资料」用同一个滚轮控件，而不是 `<input type="date">`：
            原生日期控件在三个平台长得完全不一样、不受设计令牌控制，
            而三列滚轮在手机与桌面上是同一个形态。
          */}
          <KycBirthDate />
        </div>

        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-background">
            <Camera className="size-5 text-muted-foreground" />
          </span>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("faceHint")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            {isApproved ? t("resubmit") : t("startFace")}
          </Button>
        </div>
      </form>
    </Screen>
  );
}
