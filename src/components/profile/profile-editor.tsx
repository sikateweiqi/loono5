"use client";

import {
  BadgeCheck,
  CircleDollarSign,
  Compass,
  Globe2,
  Heart,
  Languages,
  Lock,
  Ruler,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import { CountryCityField } from "@/components/onboarding/country-city-field";
import { Screen } from "@/components/layout/screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import {
  AGE_MAX,
  AGE_MIN,
  ASSET_OPTIONS,
  CHILDREN_OPTIONS,
  COUNTRY_OPTIONS,
  EDUCATION_OPTIONS,
  EXCLUSIVE_CONDITION_DEFS,
  FREQUENCY_OPTIONS,
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  INTEREST_OPTIONS,
  LANGUAGE_OPTIONS,
  MARITAL_OPTIONS,
  PREMIUM_PREFERENCE_MIN_LEVEL,
  RELIGION_OPTIONS,
  SLIDER_STEP,
  TATTOO_OPTIONS,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
  exclusivePrice,
  exclusiveTotal,
  isExclusiveConditionAvailable,
  isPremiumUnlocked,
  profileCompletion,
  type Option,
} from "@/lib/profile-options";
import { cn } from "@/lib/utils";
import type {
  ExclusiveConditionCode,
  PartnerPreferences,
  PersonalProfile,
} from "@/types/profile";
import type { UserLevel } from "@/types/user";

/**
 * Module P — 「完善个人信息」 + 「择偶条件」 editor.
 *
 * Front-end template only: everything is local state and `handleSave` is a
 * no-op stub. Wire it up with:
 *   PATCH /me/profile      ← `profile`
 *   PATCH /me/preferences  ← `preferences`
 *   POST  /me/conditions/:code/purchase ← P4 unlock
 *
 * The two tabs are exported so the onboarding wizard can reuse the exact same
 * field groups during registration (see `components/onboarding/*-step.tsx`).
 */

interface ProfileEditorProps {
  profile: PersonalProfile;
  preferences: PartnerPreferences;
  level: UserLevel;
  /** Which tab opens first — `/profile/edit?tab=partner` deep-links to P3/P4. */
  initialTab?: "about" | "partner";
}

/** Which P4 conditions the member has already paid for (mock). */
const INITIALLY_PAID: ExclusiveConditionCode[] = [];

export function ProfileEditor({
  profile: initialProfile,
  preferences: initialPreferences,
  level,
  initialTab = "about",
}: ProfileEditorProps) {
  const t = useTranslations("profileForm");

  const [tab, setTab] = useState<"about" | "partner">(initialTab);
  const [profile, setProfile] = useState(initialProfile);
  const [prefs, setPrefs] = useState(initialPreferences);
  const [paid, setPaid] = useState<ExclusiveConditionCode[]>(INITIALLY_PAID);
  const [saved, setSaved] = useState(false);

  const completion = profileCompletion(profile);
  const exclusiveCost = exclusiveTotal(prefs.exclusive, level);

  const update = <K extends keyof PersonalProfile>(
    key: K,
    value: PersonalProfile[K],
  ) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const updatePrefs = <K extends keyof PartnerPreferences>(
    key: K,
    value: PartnerPreferences[K],
  ) => {
    setPrefs((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  /** P4 — switch a charged condition on/off; payment is a separate step. */
  const toggleExclusive = (code: ExclusiveConditionCode) => {
    setPrefs((current) => ({
      ...current,
      exclusive: current.exclusive.includes(code)
        ? current.exclusive.filter((item) => item !== code)
        : [...current.exclusive, code],
    }));
    setSaved(false);
  };

  /** Mock stand-in for the payment sheet; a real build calls the order API. */
  const purchaseExclusive = (code: ExclusiveConditionCode) => {
    setPaid((current) =>
      current.includes(code) ? current : [...current, code],
    );
  };

  const handleSave = () => {
    // TODO: PATCH /me/profile + PATCH /me/preferences once the API exists.
    setSaved(true);
  };

  return (
    <>
      <ScreenHeader title={t("title")} backHref="/profile" width="narrow" />

      <Screen
        width="narrow"
        footer={
          <div className="flex flex-col gap-2">
            {saved ? (
              <p className="text-center text-[11px] text-emerald-600">
                {t("saved")}
              </p>
            ) : (
              <p className="text-center text-[11px] text-muted-foreground">
                {t("saveHint")}
              </p>
            )}
            <Button
              size="lg"
              className="w-full rounded-full"
              onClick={handleSave}
            >
              <Save className="size-4" />
              {t("save")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-1 pt-2 pb-3">
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>

        <CompletionCard
          percent={completion.percent}
          label={t("completeness")}
          value={t("completenessValue", { percent: completion.percent })}
          hint={t("completenessHint")}
        />

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {(
            [
              ["about", t("tabs.about")],
              ["partner", t("tabs.partner")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full py-1.5 text-xs font-medium transition-colors",
                tab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "about" ? (
          <AboutTab profile={profile} update={update} />
        ) : (
          <PartnerTab
            prefs={prefs}
            updatePrefs={updatePrefs}
            level={level}
            profileCountry={profile.countryCode}
            paid={paid}
            exclusiveCost={exclusiveCost}
            toggleExclusive={toggleExclusive}
            purchaseExclusive={purchaseExclusive}
          />
        )}
      </Screen>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared building blocks                                                     */
/* -------------------------------------------------------------------------- */

export function CompletionCard({
  percent,
  label,
  value,
  hint,
}: {
  percent: number;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint ? (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * 单值刻度字段：一条滑动条 + 右侧读数。
 *
 * 「未填」是一个真实状态，所以读数在 `value === null` 时显示 `—`，
 * 而滑块本身停在区间中点。用户第一次拖动（或点轨道）才产生真实值 ——
 * 这与出生日期滚轮的处理方式一致：**不让界面看起来像是已经填过了**。
 *
 * 为什么把数值只放在读数里、不放进输入框：这是本次改动的目的 ——
 * 身高体重是一个连续量，"拖动"比"敲数字"快，而且不会敲出 999。
 */
function MetricSlider({
  label,
  unit,
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  label: string;
  unit: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  const t = useTranslations("profileForm");

  return (
    <Field label={label} hint={unit}>
      <div className="flex items-center gap-3">
        <Slider
          value={[value ?? Math.round((min + max) / 2)]}
          onChange={([next]) => onChange(next)}
          min={min}
          max={max}
          step={SLIDER_STEP}
          ariaLabels={[ariaLabel]}
          className="flex-1"
        />

        <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
          {value === null ? (
            <span className="text-xs font-normal text-muted-foreground">
              {t("slider.notSet")}
            </span>
          ) : (
            `${value} ${unit}`
          )}
        </span>
      </div>

      {value === null ? null : (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("slider.clear")}
        </button>
      )}
    </Field>
  );
}

/**
 * 区间刻度字段：双滑块 + `最小 — 最大` 读数。
 *
 * 两个端点都可以是"不限"，所以读数在两端都为空时显示"不限"，
 * 只填一端时另一端显示 `—`。区间滑块天生会把两个端点都填上某个值
 * （滑块总得停在某处），所以这里保留了"只定下限或只定上限"的表达能力 ——
 * "25 岁以上"和"25–80 岁"对用户是两个不同的意思。
 */
function RangeMetricSlider({
  label,
  unit,
  minValue,
  maxValue,
  min,
  max,
  onMin,
  onMax,
  labels,
}: {
  label: string;
  unit?: string;
  minValue: number | null;
  maxValue: number | null;
  min: number;
  max: number;
  onMin: (value: number | null) => void;
  onMax: (value: number | null) => void;
  labels: { from: string; to: string; any: string; clear: string };
}) {
  // 未设定时的默认停靠点：下半区间用下四分位、上半区间用上四分位。
  // 两端都停在正中会让两个滑块重叠，用户得先猜哪个是哪个。
  const lower = minValue ?? Math.round(min + (max - min) * 0.25);
  const upper = maxValue ?? Math.round(min + (max - min) * 0.75);

  return (
    <Field label={label} hint={unit}>
      <Slider
        value={[lower, upper]}
        onChange={([nextLower, nextUpper]) => {
          // 拖动任一端都视为"用户开始设定这一项"，两端一并写实。
          // 否则会出现"下限生效、上限仍是不限"这种用户没有表达过的组合。
          onMin(nextLower);
          onMax(nextUpper);
        }}
        min={min}
        max={max}
        step={SLIDER_STEP}
        ariaLabels={[labels.from, labels.to]}
      />

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium tabular-nums">
          {minValue === null && maxValue === null
            ? labels.any
            : `${minValue ?? "—"} — ${maxValue ?? "—"}${unit ? ` ${unit}` : ""}`}
        </span>

        {minValue === null && maxValue === null ? null : (
          <button
            type="button"
            onClick={() => {
              onMin(null);
              onMax(null);
            }}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {labels.clear}
          </button>
        )}
      </div>
    </Field>
  );
}

/**
 * Chip picker used for every enum field. Multi-select when `multiple`, and a
 * segmented single-select otherwise — both write through the same callback.
 *
 * `name` 传了就顺带渲染隐藏 input，让所选值能随表单提交。
 *
 * 为什么需要它：这个控件渲染的是 `<button>`，本身不产生表单字段。
 * 注册第二步要真的把这十几个属性写库，而这些值全在 React state 里 ——
 * 没有隐藏字段的话，服务端收到的表单里一个属性都没有。
 * 个人资料编辑器（`ProfileEditor`）不传 `name`：它是纯本地状态，
 * 存在 `<form>` 之外，隐藏字段也不会被提交。
 */
function ChipPicker<T extends string>({
  options,
  selected,
  onChange,
  multiple = false,
  labelOf,
  name,
  className,
}: {
  options: Option<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
  labelOf: (key: string) => string;
  /** 表单字段名。传了就渲染隐藏 input。 */
  name?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() =>
              multiple
                ? onChange(
                    active
                      ? selected.filter((item) => item !== option.value)
                      : [...selected, option.value],
                  )
                : onChange(active ? [] : [option.value])
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              active
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary",
            )}
          >
            {labelOf(option.labelKey)}
          </button>
        );
      })}

      {name
        ? selected.map((value) => (
            <input key={value} type="hidden" name={name} value={value} />
          ))
        : null}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  hint,
  children,
  className,
}: {
  icon: typeof UserRound;
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mt-3 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4",
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {hint ? (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Wraps P3 content that the member's level does not unlock yet. */
function PremiumGate({
  locked,
  lockedHint,
  cta,
  upgradeHref = "/profile/subscription",
  children,
}: {
  locked: boolean;
  lockedHint: string;
  cta: string;
  /** Where the upsell CTA points; onboarding sends it to its own plan step. */
  upgradeHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden={locked}
        className={cn(locked && "pointer-events-none opacity-40")}
      >
        {children}
      </div>

      {locked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-card/70 px-4 text-center backdrop-blur-[2px]">
          <span className="flex size-8 items-center justify-center rounded-full bg-amber-500/10">
            <Lock className="size-4 text-amber-600 dark:text-amber-400" />
          </span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {lockedHint}
          </p>
          <Button
            size="sm"
            className="rounded-full"
            render={<Link href={upgradeHref} />}
          >
            {cta}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab 1 — 个人资料                                                            */
/* -------------------------------------------------------------------------- */

export function AboutTab({
  profile,
  update,
  showResidence = true,
}: {
  profile: PersonalProfile;
  update: <K extends keyof PersonalProfile>(
    key: K,
    value: PersonalProfile[K],
  ) => void;
  /**
   * 是否渲染居住国家/城市。
   *
   * 注册引导里传 `false`：居住地在**第一步**「完善个人资料」已经问过了
   * （那里是"国家 → 城市"级联下拉），第二步再问一遍纯属重复，
   * 用户会以为自己第一遍没填上。
   * 个人资料编辑器保持 `true`，否则会员在注册之后就再也改不了居住地。
   */
  showResidence?: boolean;
}) {
  const t = useTranslations("profileForm");

  const single = <T extends string>(
    options: Option<T>[],
    value: T | null,
    onChange: (next: T | null) => void,
    name?: string,
  ) => (
    <ChipPicker
      options={options}
      multiple={false}
      selected={value ? [value] : []}
      onChange={(next) => onChange(next[0] ?? null)}
      labelOf={t}
      name={name}
    />
  );

  return (
    <>
      <SectionCard icon={UserRound} title={t("sections.basic")}>
        <MetricSlider
          label={t("height.label")}
          unit={t("height.unit")}
          value={profile.heightCm}
          min={HEIGHT_CM_MIN}
          max={HEIGHT_CM_MAX}
          onChange={(next) => update("heightCm", next)}
          ariaLabel={t("height.label")}
        />

        <MetricSlider
          label={t("weight.label")}
          unit={t("weight.unit")}
          value={profile.weightKg}
          min={WEIGHT_KG_MIN}
          max={WEIGHT_KG_MAX}
          onChange={(next) => update("weightKg", next)}
          ariaLabel={t("weight.label")}
        />

        <Field label={t("education.label")}>
          {single(
            EDUCATION_OPTIONS,
            profile.education,
            (next) => update("education", next),
            "education",
          )}
        </Field>

        <Field label={t("occupation.label")} htmlFor="occupation">
          <Input
            id="occupation"
            name="occupation"
            placeholder={t("occupation.placeholder")}
            value={profile.occupation}
            onChange={(event) => update("occupation", event.target.value)}
          />
        </Field>

        <Field label={t("marital.label")}>
          {single(
            MARITAL_OPTIONS,
            profile.maritalStatus,
            (next) => update("maritalStatus", next),
            "maritalStatus",
          )}
        </Field>

        <Field label={t("children.label")}>
          {single(
            CHILDREN_OPTIONS,
            profile.children,
            (next) => update("children", next),
            "children",
          )}
        </Field>
      </SectionCard>

      {/*
        兴趣与自我介绍。
        本轮（2026-10-16）从注册第一步挪到这里：它们和身高学历一样是
        "可以慢慢补的个人属性"，而不是注册时必须定下的身份项。
        分区标题沿用 `sections.lifestyle` 之外的新键，避免把两件不同的事
        塞进同一个语义槽。
      */}
      <SectionCard icon={Compass} title={t("sections.interests")}>
        <Field label={t("interests.label")} hint={t("interests.hint")}>
          {/*
            `labelOf` 传恒等函数而不是 `t`：兴趣标签的值本身就是展示文本
            （`Art` / `Coffee`），不走 i18n。若传 `t`，它会去查一个不存在的
            键，而 next-intl 对缺失键是**静默回退成 key 原文**的 ——
            结果是"看起来能用，但一旦有人真的加了同名键就会串词"。
            显式恒等更诚实。
          */}
          <ChipPicker
            multiple
            options={INTEREST_OPTIONS}
            selected={profile.interests}
            onChange={(next) => update("interests", next)}
            labelOf={(key) => key}
            name="interests"
            className="-mt-1"
          />
        </Field>

        <Field label={t("bio.label")} htmlFor="bio">
          <Textarea
            id="bio"
            name="bio"
            rows={4}
            maxLength={500}
            placeholder={t("bio.placeholder")}
            value={profile.bio}
            onChange={(event) => update("bio", event.target.value)}
          />
        </Field>
      </SectionCard>

      <SectionCard
        icon={Languages}
        title={t("language.label")}
        hint={t("language.hint")}
      >
        <ChipPicker
          multiple
          options={LANGUAGE_OPTIONS}
          selected={profile.languages}
          onChange={(next) => update("languages", next)}
          labelOf={t}
          name="languages"
          className="-mt-1"
        />
      </SectionCard>

      <SectionCard icon={Heart} title={t("sections.lifestyle")}>
        <Field label={t("religion.label")}>
          {single(
            RELIGION_OPTIONS,
            profile.religion,
            (next) => update("religion", next),
            "religion",
          )}
        </Field>

        <Field label={t("tattoo.label")}>
          {single(
            TATTOO_OPTIONS,
            profile.tattoo,
            (next) => update("tattoo", next),
            "tattoo",
          )}
        </Field>

        <Field label={t("smoking.label")}>
          {single(
            FREQUENCY_OPTIONS,
            profile.smoking,
            (next) => update("smoking", next),
            "smoking",
          )}
        </Field>

        <Field label={t("drinking.label")}>
          {single(
            FREQUENCY_OPTIONS,
            profile.drinking,
            (next) => update("drinking", next),
            "drinking",
          )}
        </Field>
      </SectionCard>

      <SectionCard icon={CircleDollarSign} title={t("sections.assets")}>
        <Field label={t("asset.label")} hint={t("asset.verifiedHint")}>
          {single(
            ASSET_OPTIONS,
            profile.assetRange,
            (next) => update("assetRange", next),
            "assetRange",
          )}
        </Field>

        {showResidence ? (
          <CountryCityField
            countryCode={profile.countryCode}
            city={profile.city}
            onChange={({ countryCode, city }) => {
              update("countryCode", countryCode);
              update("city", city);
            }}
            idPrefix="aboutResidence"
          />
        ) : null}
      </SectionCard>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Tab 2 — 择偶条件                                                            */
/* -------------------------------------------------------------------------- */

export interface PartnerTabProps {
  prefs: PartnerPreferences;
  updatePrefs: <K extends keyof PartnerPreferences>(
    key: K,
    value: PartnerPreferences[K],
  ) => void;
  level: UserLevel;
  profileCountry: string;
  paid: ExclusiveConditionCode[];
  exclusiveCost: number;
  toggleExclusive: (code: ExclusiveConditionCode) => void;
  purchaseExclusive: (code: ExclusiveConditionCode) => void;
  /** Overrides the P3 upsell destination; defaults to the profile page. */
  upgradeHref?: string;
  /**
   * The tab prints its own title/subtitle. Registration renders the page
   * heading itself, so it turns this off rather than showing two.
   */
  showHeading?: boolean;
}

export function PartnerTab({
  prefs,
  updatePrefs,
  level,
  profileCountry,
  paid,
  exclusiveCost,
  toggleExclusive,
  purchaseExclusive,
  upgradeHref,
  showHeading = true,
}: PartnerTabProps) {
  const tp = useTranslations("partnerPref");
  const tf = useTranslations("profileForm");

  const availableExclusive = useMemo(
    () =>
      EXCLUSIVE_CONDITION_DEFS.filter((definition) =>
        isExclusiveConditionAvailable(definition.code, profileCountry),
      ),
    [profileCountry],
  );

  const premiumLocked = !isPremiumUnlocked("education", level);

  const single = <T extends string>(
    options: Option<T>[],
    value: T | null,
    onChange: (next: T | null) => void,
  ) => (
    <ChipPicker
      options={options}
      multiple={false}
      selected={value ? [value] : []}
      onChange={(next) => onChange(next[0] ?? null)}
      labelOf={tf}
    />
  );

  const rangeLabels = {
    from: tp("range.from"),
    to: tp("range.to"),
    any: tp("range.any"),
    clear: tf("slider.clear"),
  };

  return (
    <>
      {showHeading ? (
        <div className="flex flex-col gap-1 pt-3 pb-1">
          <h2 className="text-sm font-semibold">{tp("title")}</h2>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {tp("subtitle")}
          </p>
        </div>
      ) : null}

      {/* P1/P2 — free conditions */}
      <SectionCard
        icon={Ruler}
        title={tp("freeSection.title")}
        hint={tp("freeSection.hint")}
      >
        <RangeMetricSlider
          label={tp("age.label")}
          unit={tp("range.unitAge")}
          minValue={prefs.ageMin}
          maxValue={prefs.ageMax}
          min={AGE_MIN}
          max={AGE_MAX}
          onMin={(value) => updatePrefs("ageMin", value)}
          onMax={(value) => updatePrefs("ageMax", value)}
          labels={rangeLabels}
        />

        <RangeMetricSlider
          label={tp("height.label")}
          unit={tp("range.unitHeight")}
          minValue={prefs.heightMin}
          maxValue={prefs.heightMax}
          min={HEIGHT_CM_MIN}
          max={HEIGHT_CM_MAX}
          onMin={(value) => updatePrefs("heightMin", value)}
          onMax={(value) => updatePrefs("heightMax", value)}
          labels={rangeLabels}
        />

        <Field label={tp("countries.label")}>
          <ChipPicker
            multiple
            options={COUNTRY_OPTIONS}
            selected={prefs.countries}
            onChange={(next) => updatePrefs("countries", next)}
            labelOf={tf}
          />
        </Field>

        <Field label={tp("smoking.label")}>
          {single(FREQUENCY_OPTIONS, prefs.smoking, (next) =>
            updatePrefs("smoking", next),
          )}
        </Field>

        <Field label={tp("drinking.label")}>
          {single(FREQUENCY_OPTIONS, prefs.drinking, (next) =>
            updatePrefs("drinking", next),
          )}
        </Field>
      </SectionCard>

      {/* P3 — premium conditions, level-gated */}
      <SectionCard
        icon={Sparkles}
        title={tp("premiumSection.title")}
        hint={tp("premiumSection.hint")}
      >
        <PremiumGate
          locked={premiumLocked}
          lockedHint={tp("premiumSection.locked", {
            level: PREMIUM_PREFERENCE_MIN_LEVEL.education,
          })}
          cta={tp("premiumSection.cta")}
          upgradeHref={upgradeHref}
        >
          <div className="flex flex-col gap-4">
            <Field label={tp("education.label")}>
              <ChipPicker
                multiple
                options={EDUCATION_OPTIONS}
                selected={prefs.education}
                onChange={(next) => updatePrefs("education", next)}
                labelOf={tf}
              />
            </Field>

            <Field label={tp("languages.label")}>
              <ChipPicker
                multiple
                options={LANGUAGE_OPTIONS}
                selected={prefs.languages}
                onChange={(next) => updatePrefs("languages", next)}
                labelOf={tf}
              />
            </Field>

            <Field label={tp("religions.label")}>
              <ChipPicker
                multiple
                options={RELIGION_OPTIONS}
                selected={prefs.religions}
                onChange={(next) => updatePrefs("religions", next)}
                labelOf={tf}
              />
            </Field>

            <Field label={tp("children.label")}>
              <ChipPicker
                multiple
                options={CHILDREN_OPTIONS}
                selected={prefs.children}
                onChange={(next) => updatePrefs("children", next)}
                labelOf={tf}
              />
            </Field>

            <Field label={tp("assetMin.label")}>
              {single(ASSET_OPTIONS, prefs.assetMin, (next) =>
                updatePrefs("assetMin", next),
              )}
            </Field>

            <Field label={tp("cities.label")} htmlFor="prefCity">
              <Input
                id="prefCity"
                name="prefCity"
                placeholder={tp("cities.placeholder")}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  const value = event.currentTarget.value.trim();
                  if (!value || prefs.cities.includes(value)) {
                    return;
                  }
                  updatePrefs("cities", [...prefs.cities, value]);
                  event.currentTarget.value = "";
                }}
              />
              {prefs.cities.length > 0 ? (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {prefs.cities.map((city) => (
                    <li key={city}>
                      <button
                        type="button"
                        onClick={() =>
                          updatePrefs(
                            "cities",
                            prefs.cities.filter((item) => item !== city),
                          )
                        }
                        className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        {city} ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <span className="text-xs font-medium">
                {tp("noTattoo.label")}
              </span>
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={prefs.noTattoo}
                onChange={(event) =>
                  updatePrefs("noTattoo", event.target.checked)
                }
              />
            </label>
          </div>
        </PremiumGate>
      </SectionCard>

      {/* P4 — individually charged conditions */}
      <SectionCard
        icon={BadgeCheck}
        title={tp("exclusiveSection.title")}
        hint={tp("exclusiveSection.hint")}
      >
        <ul className="flex flex-col gap-2">
          {availableExclusive.map((definition) => {
            const code = definition.code;
            const price = exclusivePrice(code, level);
            const isPaid = price === 0 || paid.includes(code);
            const enabled = prefs.exclusive.includes(code);
            const effective = enabled && isPaid;

            return (
              <li
                key={code}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                  enabled
                    ? effective
                      ? "border-violet-500/40 bg-violet-500/5"
                      : "border-amber-500/40 bg-amber-500/5"
                    : "border-border",
                )}
              >
                <input
                  type="checkbox"
                  aria-label={tp(`exclusive.${code}.label`)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={enabled}
                  onChange={() => toggleExclusive(code)}
                />

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {tp(`exclusive.${code}.label`)}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {tp(`exclusive.${code}.desc`)}
                  </p>

                  {definition.sensitive ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                      {tp("exclusive.sensitiveNotice")}
                    </p>
                  ) : null}

                  {enabled ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-1.5 border-transparent",
                        effective
                          ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {effective
                        ? tp("exclusive.active")
                        : tp("exclusive.inactive")}
                    </Badge>
                  ) : null}
                </div>

                {price > 0 && !isPaid ? (
                  <Button
                    size="xs"
                    variant="outline"
                    className="shrink-0 rounded-full"
                    onClick={() => purchaseExclusive(code)}
                  >
                    {tp("exclusive.unlock", { price })}
                  </Button>
                ) : (
                  <span className="shrink-0 pt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    {tp("exclusive.unlocked")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">
            {tp("exclusive.payHint")}
          </span>
          <span className="text-xs font-semibold tabular-nums">
            {tp("exclusive.total", { amount: `$${exclusiveCost}` })}
          </span>
        </div>
      </SectionCard>

      <p className="mt-3 flex items-start gap-2 px-1 pb-2 text-[11px] leading-relaxed text-muted-foreground">
        <Globe2 className="mt-0.5 size-3 shrink-0" />
        {tp("complianceNote")}
      </p>
    </>
  );
}
