import { TrendingUp, UserPlus, Users, Wallet } from "lucide-react";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { FilterBar, type PartnerOption } from "@/components/partner/filter-bar";
import { OperatorBar } from "@/components/partner/operator-bar";
import { Panel } from "@/components/partner/panel";
import { RevenueChart } from "@/components/partner/revenue-chart";
import { Link } from "@/i18n/navigation";
import { findPartner, listPartners } from "@/lib/db/partner";
import {
  arpu,
  bucketUnitFor,
  buildRoster,
  dailyAverage,
  daysBetween,
  effectiveShare,
  partnerActivitiesInRange,
  partnerTrend,
  RANGE_PRESETS,
  resolveRange,
  summarizePartner,
} from "@/lib/partner/query";
import { requirePartnerSession } from "@/lib/partner/session";
import type {
  LocalizedText,
  PartnerActivityKind,
  PartnerStatus,
  PartnerTier,
} from "@/types/partner";
import { cn } from "@/lib/utils";

const CURRENCY = "USD";

const STATUS_TONE: Record<PartnerStatus, string> = {
  active: "border-emerald-600/40 text-emerald-700",
  onboarding: "border-sky-600/40 text-sky-700",
  paused: "border-border text-muted-foreground",
};

const STATUS_KEYS: Record<PartnerStatus, string> = {
  active: "status.active",
  onboarding: "status.onboarding",
  paused: "status.paused",
};

const TIER_KEYS: Record<PartnerTier, string> = {
  online: "tiers.online",
  city: "tiers.city",
  country: "tiers.country",
  shareholder: "tiers.shareholder",
};

const ACTIVITY_KIND_KEYS: Record<PartnerActivityKind, string> = {
  campaign: "kinds.campaign",
  offline: "kinds.offline",
  webinar: "kinds.webinar",
  content: "kinds.content",
  referral: "kinds.referral",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Partner lookup — the operator's view of the partnership programme.
 *
 * The dashboard answers "how am I doing"; this answers "how is partner X doing
 * over window Y". The window and the selected partner both live in the URL, so
 * a finding can be linked to a colleague or reloaded without losing state.
 *
 * With no partner selected the page shows the whole roster for the same
 * window, which also serves as the entry point: pick a row to drill in.
 */
export default async function PartnerAgentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);

  // Gate first: the roster carries every partner's revenue.
  const session = await requirePartnerSession();

  const t = await getTranslations("partner.agents");
  const format = await getFormatter();

  const formatMoney = (value: number, whole = false) =>
    format.number(value, {
      style: "currency",
      currency: CURRENCY,
      maximumFractionDigits: whole ? 0 : 2,
    });

  const formatCount = (value: number) =>
    format.number(value, { maximumFractionDigits: 0 });

  const formatPercent = (value: number) =>
    format.number(value, { style: "percent", maximumFractionDigits: 0 });

  /** `YYYY-MM-DD` is a plain day, so pin it to UTC before formatting. */
  const formatDay = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00.000Z`), {
      dateStyle: "medium",
    });

  const localize = (text: LocalizedText) =>
    text[locale as keyof LocalizedText] ?? text.en;

  const tierOf = (tier: PartnerTier) => t(TIER_KEYS[tier]);
  const statusOf = (status: PartnerStatus) => t(STATUS_KEYS[status]);
  const kindOf = (kind: PartnerActivityKind) =>
    t(`activity.${ACTIVITY_KIND_KEYS[kind]}`);

  const range = resolveRange({
    preset: first(query.preset),
    from: first(query.from),
    to: first(query.to),
  });

  const selectedId = first(query.agent) ?? "";
  const partner = selectedId ? await findPartner(selectedId) : null;
  const roster = await buildRoster(range);
  const partners = await listPartners();

  const options: PartnerOption[] = partners.map((profile) => ({
    id: profile.id,
    label: profile.name,
    region: profile.region,
    group: tierOf(profile.tier),
  }));

  const presetLabels: Record<(typeof RANGE_PRESETS)[number], string> = {
    "7d": t("filters.presets.7d"),
    "30d": t("filters.presets.30d"),
    "90d": t("filters.presets.90d"),
    ytd: t("filters.presets.ytd"),
  };

  /** Keeps the window when drilling into a partner. */
  const detailHref = (id: string) => {
    const next = new URLSearchParams();
    if (range.preset) {
      next.set("preset", range.preset);
    } else {
      next.set("from", range.from);
      next.set("to", range.to);
    }
    next.set("agent", id);
    return `/partner/agents?${next.toString()}`;
  };

  const summary = partner ? await summarizePartner(partner.id, range) : null;
  const trend = partner ? await partnerTrend(partner.id, range) : [];
  const activities = partner
    ? await partnerActivitiesInRange(partner.id, range)
    : [];
  const unit = bucketUnitFor(range);
  const unitLabel =
    unit === "day"
      ? t("trend.byDay")
      : unit === "week"
        ? t("trend.byWeek")
        : t("trend.byMonth");

  const kpis = summary
    ? [
        {
          icon: TrendingUp,
          label: t("kpi.commission"),
          value: formatMoney(summary.commission),
        },
        {
          icon: Wallet,
          label: t("kpi.gross"),
          value: formatMoney(summary.gross),
        },
        {
          icon: UserPlus,
          label: t("kpi.signups"),
          value: formatCount(summary.signups),
        },
        {
          icon: Users,
          label: t("kpi.active"),
          value: formatCount(summary.active),
        },
      ]
    : [];

  const ratios = summary
    ? [
        { label: t("ratios.paying"), value: formatCount(summary.paying) },
        {
          label: t("ratios.conversations"),
          value: formatCount(summary.conversations),
        },
        { label: t("ratios.arpu"), value: formatMoney(arpu(summary)) },
        {
          label: t("ratios.daily"),
          value: formatMoney(dailyAverage(summary, summary.days)),
        },
        {
          label: t("ratios.share"),
          value: formatPercent(effectiveShare(summary)),
        },
      ]
    : [];

  const windowHref = `/partner/agents?${
    range.preset
      ? `preset=${range.preset}`
      : `from=${range.from}&to=${range.to}`
  }`;

  return (
    <div className="partner-surface relative flex min-h-full flex-1 flex-col">
      <OperatorBar account={session.account} section="agents" />

      <div className="relative z-10 mx-auto w-full max-w-[76rem] px-4 py-5 pb-14 md:px-6 xl:px-8">
        <div className="mb-3">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>

        <FilterBar
          partners={options}
          selectedId={partner ? selectedId : ""}
          from={range.from}
          to={range.to}
          maxDate={new Date().toISOString().slice(0, 10)}
          preset={range.preset}
          labels={{
            agent: t("filters.agent"),
            allAgents: t("filters.allAgents"),
            from: t("filters.from"),
            to: t("filters.to"),
            reset: t("filters.reset"),
            pending: t("filters.pending"),
            presets: RANGE_PRESETS.map((id) => ({
              id,
              label: presetLabels[id],
            })),
          }}
        />

        {range.fellBack ? (
          <p className="mt-3 rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800">
            {t("range.fellBack")}
          </p>
        ) : null}

        {partner && summary ? (
          <>
            {/* ── Partner header ─────────────────────────────────────── */}
            <section className="partner-panel mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <span className="truncate">{partner.name}</span>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[10px] font-normal whitespace-nowrap",
                      STATUS_TONE[partner.status],
                    )}
                  >
                    {statusOf(partner.status)}
                  </span>
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {partner.region}
                </p>
              </div>

              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
                {[
                  {
                    label: t("roster.columns.tier"),
                    value: `${tierOf(partner.tier)} · ${formatPercent(partner.share)}`,
                    mono: false,
                  },
                  {
                    label: t("profile.account"),
                    value: partner.account,
                    mono: true,
                  },
                  {
                    label: t("profile.refCode"),
                    value: partner.refCode,
                    mono: true,
                  },
                  {
                    label: t("profile.joinedAt"),
                    value: formatDay(partner.joinedAt.slice(0, 10)),
                    mono: false,
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd
                      className={cn(
                        "text-foreground/85",
                        item.mono && "font-mono",
                      )}
                    >
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <Link
                href={windowHref}
                className="ms-auto text-[11px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground/80"
              >
                {t("roster.title")} →
              </Link>
            </section>

            {summary.days === 0 ? (
              <p className="mt-3 rounded-lg border border-border bg-foreground/5 px-3 py-2 text-[11px] text-muted-foreground">
                {t("range.noData")}
              </p>
            ) : null}

            {/* ── Figures for the window ─────────────────────────────── */}
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => {
                const Icon = kpi.icon;

                return (
                  <li key={kpi.label} className="partner-panel p-4">
                    <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
                      <Icon className="size-3.5" />
                      <span className="truncate">{kpi.label}</span>
                    </span>
                    <p className="mt-2.5 text-2xl font-semibold text-foreground tabular-nums">
                      {kpi.value}
                    </p>
                  </li>
                );
              })}
            </ul>

            <Panel
              className="mt-3 min-w-0"
              title={t("trend.title")}
              hint={`${formatDay(range.from)} – ${formatDay(range.to)} · ${unitLabel}`}
            >
              <RevenueChart data={trend} currency={CURRENCY} />

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-5">
                {ratios.map((item) => (
                  <div key={item.label}>
                    <dd className="text-lg font-semibold text-foreground tabular-nums">
                      {item.value}
                    </dd>
                    <dt className="text-[10px] text-muted-foreground">
                      {item.label}
                    </dt>
                  </div>
                ))}
              </dl>
            </Panel>

            {/* ── Campaigns run inside the window ────────────────────── */}
            <Panel
              className="mt-3 overflow-hidden"
              bodyClassName="p-0"
              title={t("activity.title")}
              hint={t("activity.hint", { count: activities.length })}
            >
              {activities.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {t("activity.empty")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                        <th className="px-4 py-2 text-left font-medium">
                          {t("activity.columns.name")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("activity.columns.kind")}
                        </th>
                        <th className="px-4 py-2 text-left font-medium">
                          {t("activity.columns.period")}
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          {t("activity.columns.signups")}
                        </th>
                        <th className="px-4 py-2 text-right font-medium">
                          {t("activity.columns.commission")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activities.map((activity) => (
                        <tr key={activity.id}>
                          <td className="px-4 py-2.5">
                            <span className="block truncate text-foreground/90">
                              {localize(activity.title)}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {activity.city}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground">
                              {kindOf(activity.kind)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-[11px] whitespace-nowrap text-muted-foreground">
                            {activity.startAt === activity.endAt
                              ? formatDay(activity.startAt)
                              : `${formatDay(activity.startAt)} – ${formatDay(activity.endAt)}`}
                          </td>
                          <td className="px-4 py-2.5 text-right text-foreground/85 tabular-nums">
                            {formatCount(activity.signups)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-emerald-700 tabular-nums">
                            {formatMoney(activity.commission)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        ) : (
          <>
            {/* ── Roster for the same window ─────────────────────────── */}
            <div className="partner-panel mt-3 p-5 text-center">
              <p className="text-sm font-medium text-foreground/85">
                {t("empty.title")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("empty.body")}
              </p>
            </div>

            <Panel
              className="mt-3 overflow-hidden"
              bodyClassName="p-0"
              title={t("roster.title")}
              hint={t("roster.hint", { count: roster.length })}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                      <th className="px-4 py-2 text-left font-medium">
                        {t("roster.columns.agent")}
                      </th>
                      <th className="px-4 py-2 text-left font-medium">
                        {t("roster.columns.tier")}
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        {t("roster.columns.signups")}
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        {t("roster.columns.gross")}
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        {t("roster.columns.commission")}
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        {t("roster.columns.share")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {roster.map((row) => (
                      <tr
                        key={row.partner.id}
                        className={cn(
                          "transition-colors hover:bg-foreground/5",
                          row.days === 0 && "opacity-45",
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={detailHref(row.partner.id)}
                            className="block min-w-0"
                          >
                            <span className="block truncate text-foreground/90">
                              {row.partner.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {row.partner.region}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] whitespace-nowrap text-muted-foreground">
                          {tierOf(row.partner.tier)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-foreground/85 tabular-nums">
                          {row.days === 0
                            ? "—"
                            : formatCount(row.totals.signups)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-foreground/70 tabular-nums">
                          {row.days === 0
                            ? "—"
                            : formatMoney(row.totals.gross, true)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-700 tabular-nums">
                          {row.days === 0
                            ? "—"
                            : formatMoney(row.totals.commission)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                          {formatPercent(row.partner.share)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <p className="mt-3 text-[11px] text-muted-foreground/80">
              {t("range.label")}: {formatDay(range.from)} –{" "}
              {formatDay(range.to)} ·{" "}
              {t("range.days", { count: daysBetween(range.from, range.to) })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
