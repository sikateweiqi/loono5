import { SlidersHorizontal } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CatalogGrid } from "@/components/catalog/catalog-grid";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ScreenHeader } from "@/components/layout/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCatalogMembers } from "@/lib/db/members";
import { hasActiveSubscription, visibleLevels } from "@/lib/tiers";

const TABS = ["tabsAll", "tabsNearby", "tabsNew", "tabsOnline"] as const;

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("catalog");
  const tc = await getTranslations("common");

  // The session tier drives the visibility matrix (PRD rule 2).
  const viewer = await getCurrentUser();
  const subscribed = hasActiveSubscription(viewer);
  const viewerLevel = viewer.subscription.level ?? 1;
  const visible = new Set(visibleLevels(viewerLevel));

  // 目录来自 profiles 表，查询层面已按 kind = 'member' 过滤，
  // 所以机构型账号（代理商）永远进不了 B2C 目录。
  const members = await listCatalogMembers();

  return (
    <>
      <ScreenHeader
        title={t("title")}
        center
        action={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label={t("filter")}>
              <SlidersHorizontal className="size-5" />
            </Button>
            <LocaleSwitcher />
          </div>
        }
      />

      <div className="sticky top-14 z-20 flex gap-2 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur md:px-6 xl:px-8">
        {TABS.map((tab, index) => (
          <Badge
            key={tab}
            variant={index === 0 ? "default" : "outline"}
            className="shrink-0 rounded-full px-3 py-1"
          >
            {t(tab)}
          </Badge>
        ))}
      </div>

      {subscribed ? (
        <div className="px-4 pb-2 text-xs text-muted-foreground md:px-6 xl:px-8">
          {t("resultsCount", { count: members.length })}
        </div>
      ) : (
        <div className="px-4 pb-2 md:px-6 xl:px-8">
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {tc("comingSoon")}
          </Badge>
        </div>
      )}

      {/* Blocked members drop out client-side; see `CatalogGrid`. */}
      <CatalogGrid users={members} visibleLevels={[...visible]} />
    </>
  );
}
