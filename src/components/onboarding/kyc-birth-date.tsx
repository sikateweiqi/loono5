"use client";

import { useState } from "react";

import { WheelDatePicker } from "@/components/ui/wheel-date-picker";
import { PROFILE_AGE_MAX, PROFILE_AGE_MIN } from "@/lib/profile/age";

/**
 * 实名认证里的出生日期。
 *
 * 单独包一层客户端组件，是因为 KYC 页面本身是服务端组件、表单是静态的，
 * 而滚轮必须持有"当前选中哪一天"的状态。
 *
 * 年份范围与「完善个人资料」保持一致（18–80 岁）：两处对同一个人的
 * 出生日期给出不同的可选范围，会让用户怀疑到底以哪个为准。
 * 证件上的出生日期理论上可能更早，但那属于"证件与自填不符"的审核范畴，
 * 不该由可选范围来提前表达。
 */
export function KycBirthDate({ name = "birthDate" }: { name?: string }) {
  const [value, setValue] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  return (
    <WheelDatePicker
      name={name}
      value={value}
      onChange={setValue}
      minYear={currentYear - PROFILE_AGE_MAX}
      maxYear={currentYear - PROFILE_AGE_MIN}
    />
  );
}
