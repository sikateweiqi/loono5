import { Ticket, TrendingUp, Users, Wallet } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PromoTools } from "@/components/agent/promo-tools";
import { OperatorBar } from "@/components/partner/operator-bar";
import { Panel } from "@/components/partner/panel";
import { RevenueChart } from "@/components/partner/revenue-chart";
import { agentLabelKey, commissionRate } from "@/lib/agent";
import { getAgentDashboard } from "@/lib/db/agent";
import { getViewerProfile } from "@/lib/db/viewer";
import { requirePartnerSession } from "@/lib/partner/session";
import { cn } from "@/lib/utils";

/** Placeholder series; replace with the real earnings endpoint. */
const MONTHLY_REVENUE = [
  { label: "May", amount: 412 },
  { label: "Jun", amount: 528 },
  { label: "Jul", amount: 486 },
  { label: "Aug", amount: 674 },
  { label: "Sep", amount: 741 },
  { label: "Oct", amount: 612 },
];

const CURRENCY = "USD";

/**
 * B2B partner cabinet — cool light data surface.
 *
 * This is the *partner's own* dashboard: one account, already totalled. The
 * operator's cross-partner view (search any partner over any window) lives at
 * /partner/agents, reached through the switcher in the top bar.
 *
 * Deliberately instrument-like rather than warm: neutral grey, hairline
 * rules, big tabular numbers. Nothing here is shared with the consumer
 * surface, and the page is gated — see `requirePartnerSession`.
 */
export default async function PartnerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Gate first: unauthenticated visitors never see the numbers below.
  const session = await requirePartnerSession();

  const t = await getTranslations("partner");
  const td = await getTranslations("agent.dashboard");
  const ta = await getTranslations("agent");
  const tp = await getTranslations("agent.payout");

  // 当前会员：未登录时 getViewerProfile 会回落到种子账号 u_current（只读展示身份）。
  const viewer = await getViewerProfile();
  const dashboard = viewer ? await getAgentDashboard(viewer.id) : null;

  if (!dashboard || !dashboard.agent) {
    // 当前会员没有 agents 行（不是合作方）：不抛错，保留外套与视觉，
    // 只把数字区换成明确的空状态 —— 伪造一份零值看板等于谎称对方是合作方。
    return (
      <div className="partner-surface relative flex min-h-full flex-1 flex-col">
        <OperatorBar account={session.account} section="dashboard" />

        <div className="relative z-10 mx-auto w-full max-w-[76rem] px-4 py-5 pb-14 md:px-6 xl:px-8">
          <div className="partner-panel mt-3 p-5 text-center">
            <p className="text-sm font-medium text-foreground/85">
              {t("empty.title")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("empty.body")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { agent, payouts, referrals } = dashboard;
  const { stats } = agent;
  const rate = Math.round(commissionRate(agent.level) * 100);

  const kpis = [
    { icon: TrendingUp, label: t("totalRevenue"), value: stats.totalEarnings },
    { icon: Wallet, label: td("thisMonth"), value: stats.thisMonthEarnings },
    { icon: Users, label: td("totalInvitees"), value: stats.totalInvitees },
    { icon: Ticket, label: td("pendingPayout"), value: stats.pendingPayout },
  ];

  return (
    <div className="partner-surface relative flex min-h-full flex-1 flex-col">
      <OperatorBar
        account={session.account}
        section="dashboard"
        badge={`${ta(agentLabelKey(agent.level))} · ${rate}%`}
      />

      <div className="relative z-10 mx-auto w-full max-w-[76rem] px-4 py-5 pb-14 md:px-6 xl:px-8">
        {/* ── KPI strip ──────────────────────────────────────────────── */}
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;

            return (
              <li key={kpi.label} className="partner-panel p-4">
                <span className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
                  <Icon className="size-3.5" />
                  <span className="truncate">{kpi.label}</span>
                </span>
                <p className="mt-2.5 text-2xl font-semibold text-foreground tabular-nums">
                  ${kpi.value.toLocaleString(locale)}
                </p>
              </li>
            );
          })}
        </ul>

        {/* ── Trend + ratios ─────────────────────────────────────────── */}
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel
            title={t("revenue")}
            hint={t("revenueHint")}
            className="min-w-0"
          >
            <RevenueChart data={MONTHLY_REVENUE} currency={CURRENCY} />

            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
              {[
                { label: t("newInvites"), value: "24" },
                { label: t("activeSubs"), value: "96" },
                { label: t("arpu"), value: "$34" },
              ].map((item) => (
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

          <Panel
            title={t("quickActions")}
            hint={`${t("since")} ${new Date(agent.joinedAt).toLocaleDateString(locale)}`}
          >
            <PromoTools refLink={agent.refLink} refCode={agent.refCode} />
          </Panel>
        </div>

        {/* ── Tables ─────────────────────────────────────────────────── */}
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <Panel
            title={td("recent")}
            hint={`${t("conversion")} ${Math.round(stats.conversionRate * 100)}%`}
            className="overflow-hidden"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                  <th className="pb-2 text-left font-medium">
                    {td("tabs.overview")}
                  </th>
                  <th className="pb-2 text-left font-medium">—</th>
                  <th className="pb-2 text-right font-medium">USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-[10px] font-medium">
                          {referral.nickname.slice(0, 1)}
                        </span>
                        <span className="truncate">{referral.nickname}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-[11px] text-muted-foreground">
                      {new Date(referral.joinedAt).toLocaleDateString(locale)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {referral.subscribed ? (
                        <span className="text-emerald-700">
                          +${referral.earnings.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel
            title={tp("history")}
            hint={`${payouts.length} ${t("byMonth")}`}
            className="overflow-hidden"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                  <th className="pb-2 text-left font-medium">{tp("title")}</th>
                  <th className="pb-2 text-left font-medium">
                    {tp("available")}
                  </th>
                  <th className="pb-2 text-right font-medium">
                    {tp("status.pending")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td className="py-2.5 tabular-nums">
                      ${payout.amount.toFixed(2)}
                    </td>
                    <td className="truncate py-2.5 text-[11px] text-muted-foreground">
                      {payout.account}
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[10px]",
                          payout.status === "paid" &&
                            "border-emerald-600/40 text-emerald-700",
                          payout.status === "rejected" &&
                            "border-destructive/40 text-destructive",
                          payout.status !== "paid" &&
                            payout.status !== "rejected" &&
                            "border-border text-muted-foreground",
                        )}
                      >
                        {tp(
                          payout.status === "paid"
                            ? "status.paid"
                            : payout.status === "rejected"
                              ? "status.rejected"
                              : payout.status === "processing"
                                ? "status.processing"
                                : "status.pending",
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
