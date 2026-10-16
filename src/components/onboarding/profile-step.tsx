"use client";

import { AlertCircle, Camera, Loader2, Plus, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";

import { CountryCityField } from "@/components/onboarding/country-city-field";
import { Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { WheelDatePicker } from "@/components/ui/wheel-date-picker";
import {
  ageFromIsoDate,
  PROFILE_AGE_MAX,
  PROFILE_AGE_MIN,
} from "@/lib/profile/age";
import {
  saveProfileBasicsAction,
  type ProfileBasicsState,
} from "@/lib/profile/actions";
import { checkRealName } from "@/lib/profile/name";
import { PROFILE_PHOTO_MAX } from "@/lib/profile-options";
import { cn } from "@/lib/utils";
import type { ProfileBasics } from "@/types/profile";

/**
 * 注册第一步「完善个人资料」。
 *
 * 这一步是**真的会写库**的：照片经 `POST /api/uploads` 落盘后，
 * 与其他字段一起由 server action 写进 `profiles`。
 *
 * 本轮（2026-10-16）的三处调整
 * ---------------------------
 * 1. **昵称 → 真实姓名**。校验规则与提示都来自 `lib/profile/name.ts` ——
 *    与服务端同一个函数，所以"界面上没报错、提交后却被拒"不会发生。
 * 2. **居住地改成国家 + 城市两级下拉**（`CountryCityField`）。原先是一个
 *    自由文本城市输入框，没法知道填的是哪国城市。
 * 3. **兴趣标签与自我介绍移出本步**，改在第二步「个人属性」采集。
 *    理由：这两项是"可以慢慢补的个人属性"，而不是注册时必须定下的
 *    身份项；和身高学历放在一起，用户的心智负担更小。
 *
 * 照片为什么先上传、后随表单提交
 * ----------------------------
 * 用户会在几张照片之间删删改改，每改一次就写一次库会让"取消"无法表达。
 * 所以上传只负责产出一个 URL，真正的持久化发生在点「保存并继续」时 ——
 * 代价是可能留下几张没被引用的孤儿文件（原型阶段可接受，
 * 生产环境应由定时任务清理无引用的上传）。
 *
 * 为什么这个组件自己渲染 `Screen`（含固定底栏）
 * -------------------------------------------
 * 提交按钮在底栏里，底栏在 `<form>` 之外。用 `form="profile-form"` 能把
 * 提交挂回去，但 `useFormStatus` 依赖 React context，跨出 form 就拿不到
 * 提交中状态 —— 按钮会一直显示"保存并继续"，用户看不出刚才那一下有没有生效。
 * 把底栏收进这个组件，`pending` 就是一个普通 state，不再需要跨边界传。
 */

/** 上传失败的原因 → 错误键。 */
type UploadErrorKey =
  "uploadFailed" | "uploadTooLarge" | "uploadType" | "uploadEmpty";

export function OnboardingProfile({ member }: { member: ProfileBasics }) {
  const t = useTranslations("onboarding.profile");
  const te = useTranslations("onboarding.profile.errors");

  const [state, formAction, pending] = useActionState<
    ProfileBasicsState,
    FormData
  >(saveProfileBasicsAction, {});

  const [photos, setPhotos] = useState<string[]>(member.photoUrls);
  // 滚轮永远停在某一行，所以"还没选过"只能存在组件状态里。
  const [birthDate, setBirthDate] = useState<string | null>(member.birthDate);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<UploadErrorKey | null>(null);

  /*
    姓名与居住地是**受控**的。

    姓名：要在用户还在敲字时提示格式问题（"123"、"abc123"），
    不受控就拿不到中间态。

    居住地：城市列表取决于国家，两者必须一起更新，见 CountryCityField。
  */
  const [name, setName] = useState(member.displayName);
  const [residence, setResidence] = useState({
    countryCode: member.countryCode,
    city: member.city,
  });

  const fileInput = useRef<HTMLInputElement>(null);

  const currentYear = new Date().getFullYear();
  const atLimit = photos.length >= PROFILE_PHOTO_MAX;

  /*
    本地即时提示：只在用户**已经输入了内容**时才提示格式问题。
    刚进页面时输入框是空的，这时立刻显示"请填写真实姓名"是在指责用户
    还没做的事 —— 空值的提示留给提交后。
  */
  const nameProblem = name.trim() === "" ? null : checkRealName(name);

  // 与服务端完全相同的函数（lib/profile/age），两端不会给出不同结论。
  const birthDateAge = birthDate ? ageFromIsoDate(birthDate) : null;
  const birthDateOutOfRange =
    birthDateAge !== null &&
    (birthDateAge < PROFILE_AGE_MIN || birthDateAge > PROFILE_AGE_MAX);

  /**
   * 逐张上传，而不是 `Promise.all`。
   *
   * 并行上传在弱网下最容易表现成"转圈很久然后一起失败"，而且失败时
   * 用户不知道自己到底传成功了几张。串行慢一点，但每张的成败立刻可见，
   * 也天然保证了顺序 —— 而顺序在这里有意义（第一张是头像）。
   */
  async function uploadFiles(files: FileList) {
    setUploadError(null);
    setUploading(true);

    const accepted: string[] = [];

    for (const file of Array.from(files)) {
      if (accepted.length + photos.length >= PROFILE_PHOTO_MAX) {
        break;
      }

      const body = new FormData();
      body.append("file", file);

      try {
        const response = await fetch("/api/uploads", { method: "POST", body });

        if (!response.ok) {
          // 服务端返回的文案更具体，但它已经是一句中文；
          // 状态码足以区分该给用户看哪一句本地提示。
          setUploadError(
            response.status === 413
              ? "uploadTooLarge"
              : response.status === 415
                ? "uploadType"
                : "uploadFailed",
          );
          continue;
        }

        const payload = (await response.json()) as { url: string };
        accepted.push(payload.url);
      } catch {
        setUploadError("uploadFailed");
      }
    }

    if (accepted.length > 0) {
      setPhotos((current) =>
        [...current, ...accepted].slice(0, PROFILE_PHOTO_MAX),
      );
    }

    setUploading(false);

    if (fileInput.current) {
      // 清空 input，否则用户删掉照片后再选**同一张**，change 事件不会触发。
      fileInput.current.value = "";
    }
  }

  return (
    <Screen
      width="narrow"
      footer={
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            form="profile-form"
            size="lg"
            className="w-full rounded-full"
            disabled={pending || uploading}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending ? t("submitting") : t("submit")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1 pt-4 pb-4">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form
        id="profile-form"
        action={formAction}
        className="flex flex-col gap-5"
      >
        {state.error ? (
          <p
            role="alert"
            className="flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {te(state.error)}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label>{t("photosLabel")}</Label>

          <div className="grid grid-cols-3 gap-2">
            {photos.map((url, index) => (
              <div
                key={url}
                className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted"
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 33vw, 200px"
                  className="object-cover"
                />

                {index === 0 ? (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {t("primaryPhoto")}
                  </span>
                ) : null}

                <button
                  type="button"
                  aria-label={t("removePhoto")}
                  onClick={() =>
                    setPhotos((current) =>
                      current.filter((item) => item !== url),
                    )
                  }
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}

            {atLimit ? null : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                className={cn(
                  "flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors",
                  uploading
                    ? "cursor-wait"
                    : "hover:border-primary/50 hover:bg-muted hover:text-primary",
                )}
              >
                {uploading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Plus className="size-5" />
                )}
                <span className="text-[10px]">
                  {uploading ? t("uploading") : t("upload")}
                </span>
              </button>
            )}

            {/*
              占位格子：让网格在照片少的时候也保持完整的三列节奏。
              它们是**不可点击的 div** —— 原来这里是一排看起来像按钮、
              点了却没有任何反应的方块，那正是"上传没反应"这个印象的来源之一。
            */}
            {Array.from({
              length: Math.max(0, 3 - photos.length - (atLimit ? 0 : 1)),
            }).map((_, index) => (
              <div
                key={`placeholder-${index}`}
                aria-hidden
                className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-muted/40"
              >
                <Camera className="size-4 text-muted-foreground/40" />
              </div>
            ))}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files?.length) {
                void uploadFiles(event.target.files);
              }
            }}
          />

          {/* 照片是**受控状态**，所以靠隐藏字段提交，
              而不是给 file input 起个名字让它自己上（file input 提交的是文件，
              而这里要提交的是已经落盘后的 URL）。 */}
          {photos.map((url) => (
            <input key={url} type="hidden" name="photoUrls" value={url} />
          ))}

          <p
            className={cn(
              "text-xs",
              uploadError ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {uploadError
              ? te(uploadError)
              : t("photosHint", {
                  max: PROFILE_PHOTO_MAX,
                  count: photos.length,
                })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t("nameLabel")}</Label>
          <Input
            id="name"
            name="name"
            /*
              `name` 而不是 `nickname`：这个字段现在采集的是真实姓名，
              让浏览器按"姓名"提示自动填充（昵称的自动填充会给出账号名）。
            */
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            aria-invalid={nameProblem !== null}
            required
          />
          {nameProblem ? (
            <p className="text-[11px] text-destructive">{te(nameProblem)}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t("nameHint")}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t("genderLabel")}</Label>
          <RadioGroup
            defaultValue={member.gender ?? "female"}
            name="gender"
            className="flex gap-2"
          >
            <label
              htmlFor="gender-male"
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-border py-2 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:text-primary"
            >
              <RadioGroupItem value="male" id="gender-male" />
              {t("genderMale")}
            </label>
            <label
              htmlFor="gender-female"
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-border py-2 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:text-primary"
            >
              <RadioGroupItem value="female" id="gender-female" />
              {t("genderFemale")}
            </label>
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t("birthDateLabel")}</Label>
          <WheelDatePicker
            name="birthDate"
            value={birthDate}
            onChange={setBirthDate}
            minYear={currentYear - PROFILE_AGE_MAX}
            maxYear={currentYear - PROFILE_AGE_MIN}
          />
          {birthDateOutOfRange ? (
            <p className="text-[11px] text-destructive">
              {te("birthDateRange")}
            </p>
          ) : null}
        </div>

        {/*
          居住地：先选国家，再选该国城市。
          `size="lg"` 让下拉框和同一页的输入框一样高 —— 这是注册流程，
          触控目标大一点比紧凑更重要。
        */}
        <CountryCityField
          countryCode={residence.countryCode}
          city={residence.city}
          onChange={setResidence}
          size="lg"
        />
      </form>
    </Screen>
  );
}
