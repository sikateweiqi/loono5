"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { AboutTab, CompletionCard } from "@/components/profile/profile-editor";
import { Button } from "@/components/ui/button";
import {
  saveProfileAttributesAction,
  type ProfileAttributesState,
} from "@/lib/profile/actions";
import { profileCompletion } from "@/lib/profile-options";
import type { PersonalProfile } from "@/types/profile";

/**
 * 注册第二步 — 模块 P「个人属性」。
 *
 * 复用 `AboutTab`（与「完善个人信息」同一份实现），所以注册表单和
 * 个人资料编辑器永远不会各自漂移。
 *
 * 这一步原先是个**纯静态表单**：填完点「继续」只是 `Link` 跳到下一页，
 * 一个字段都没落库。本轮把兴趣标签与自我介绍从第一步挪到这里，
 * 于是它**必须**真的会写 —— 否则挪过来的两个字段会直接丢掉。
 *
 * 与第一步同样的处理：这个组件自己渲染 `Screen`（含吸底提交按钮）。
 *
 * 为什么不能把提交按钮留在页面里再用 `form="attributes-form"` 挂回去：
 * `useFormStatus` 依赖 React context，按钮在 `<form>` 之外就拿不到
 * 提交中状态，于是点了之后按钮一直显示"保存并继续"，用户不知道有没有生效。
 * 把底栏收进组件，`pending` 就是普通 state。
 *
 * `showResidence={false}`
 * ----------------------
 * 居住地（国家 + 城市）已经在第一步问过，这里不再重复。
 * 服务端动作也不读这两个字段，所以第二步不会覆盖第一步填的居住地。
 */
export function OnboardingAttributes({
  profile: initialProfile,
}: {
  profile: PersonalProfile;
}) {
  const t = useTranslations("profileForm");
  const ta = useTranslations("onboarding.attributes");
  const te = useTranslations("onboarding.attributes.errors");

  const [state, formAction, pending] = useActionState<
    ProfileAttributesState,
    FormData
  >(saveProfileAttributesAction, {});

  const [profile, setProfile] = useState(initialProfile);

  const update = <K extends keyof PersonalProfile>(
    key: K,
    value: PersonalProfile[K],
  ) => setProfile((current) => ({ ...current, [key]: value }));

  const completion = profileCompletion(profile);

  return (
    <Screen
      width="narrow"
      footer={
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            form="attributes-form"
            size="lg"
            className="w-full rounded-full"
            disabled={pending}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? ta("submitting") : ta("submit")}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {ta("hint")}
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-1 pt-4 pb-1">
        <h1 className="text-xl font-bold">{ta("title")}</h1>
        <p className="text-sm text-muted-foreground">{ta("subtitle")}</p>
      </div>

      <form id="attributes-form" action={formAction}>
        {state.error ? (
          <p
            role="alert"
            className="mt-3 flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {te(state.error)}
          </p>
        ) : null}

        <CompletionCard
          percent={completion.percent}
          label={t("completeness")}
          value={t("completenessValue", { percent: completion.percent })}
          hint={t("completenessHint")}
        />

        <AboutTab profile={profile} update={update} showResidence={false} />

        {/*
          两条滑动条的隐藏镜像。

          为什么不像其它字段那样让控件自己带 `name`：`MetricSlider` 在
          "未设置"时会把滑块停在区间中点，而 `Slider` 的 `name` 会渲染出
          一个隐藏的 range input，值就是那个中点 —— 提交上去等于把用户
          从没选过的中间值当成了他的身高。所以只有**确实有值**时才镜像。
        */}
        {profile.heightCm === null ? null : (
          <input type="hidden" name="heightCm" value={profile.heightCm} />
        )}
        {profile.weightKg === null ? null : (
          <input type="hidden" name="weightKg" value={profile.weightKg} />
        )}
      </form>
    </Screen>
  );
}
