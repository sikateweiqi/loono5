"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { NativeSelect } from "@/components/ui/native-select";
import { cityAfterCountryChange, citiesOf } from "@/lib/geo";
import { COUNTRY_OPTIONS } from "@/lib/profile-options";
import { cn } from "@/lib/utils";

/**
 * 居住地级联选择：**先选国家，再在对应国家的城市列表里选城市**。
 *
 * 为什么是一个受控组件而不是两个独立字段
 * ------------------------------------
 * 城市列表取决于国家，所以两者是**一个整体**："换国家"这个动作天然会
 * 影响城市。把协调逻辑收在这里（而不是让父组件分别持有两个值再自己同步），
 * "换国家必清空不属于新国家的城市"这条不变式就只有一处实现 ——
 * 否则两个调用点（注册第一步、个人资料编辑器）各写一遍，早晚漏掉一处。
 *
 * 值通过隐藏 input 交给表单。隐藏 input 在 `<form>` 之外是惰性的，
 * 所以个人资料编辑器那种"不提交、只改本地状态"的用法不需要额外开关。
 */
export interface CountryCityFieldProps {
  countryCode: string;
  city: string;
  /** 两个值一起回传 —— 换国家时城市可能被清空，分开回调会有一帧不一致。 */
  onChange: (next: { countryCode: string; city: string }) => void;
  /** 控件尺寸；注册引导用 `lg` 换取更大的触控目标。 */
  size?: "default" | "lg";
  className?: string;
  /** 同一页面可能出现两组（如会员与择偶条件），用它避免 id 冲突。 */
  idPrefix?: string;
}

export function CountryCityField({
  countryCode,
  city,
  onChange,
  size = "default",
  className,
  idPrefix = "residence",
}: CountryCityFieldProps) {
  const t = useTranslations("profileForm");

  const cities = useMemo(() => citiesOf(countryCode), [countryCode]);
  const cityDisabled = cities.length === 0;

  const countryOptions = useMemo(
    () =>
      COUNTRY_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t],
  );

  const cityOptions = useMemo(
    () => cities.map((name) => ({ value: name, label: name })),
    [cities],
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-2">
        <label
          htmlFor={`${idPrefix}-country`}
          className="text-sm leading-none font-medium select-none"
        >
          {t("country.label")}
        </label>
        <NativeSelect
          id={`${idPrefix}-country`}
          size={size}
          placeholder={t("country.placeholder")}
          options={countryOptions}
          value={countryCode}
          onChange={(event) =>
            onChange({
              countryCode: event.target.value,
              city: cityAfterCountryChange(event.target.value, city) ?? "",
            })
          }
        />
        <input type="hidden" name="countryCode" value={countryCode} />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={`${idPrefix}-city`}
          className="text-sm leading-none font-medium select-none"
        >
          {t("city.label")}
        </label>
        <NativeSelect
          id={`${idPrefix}-city`}
          size={size}
          disabled={cityDisabled}
          placeholder={
            cityDisabled ? t("city.pickCountryFirst") : t("city.placeholder")
          }
          options={cityOptions}
          value={city}
          onChange={(event) =>
            onChange({ countryCode, city: event.target.value })
          }
        />
        <input type="hidden" name="city" value={city} />

        {/*
          城市框在未选国家时是禁用的，说明里要写清"为什么点不动"，
          否则用户会以为是页面卡住了。
        */}
        <p className="text-[11px] text-muted-foreground">
          {cityDisabled ? t("city.pickCountryFirst") : t("city.hint")}
        </p>
      </div>
    </div>
  );
}
