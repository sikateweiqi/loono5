"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  Wheel,
  WHEEL_HEIGHT,
  type WheelOption,
} from "@/components/ui/wheel-picker";
import { cn } from "cn";

/**
 * 年 / 月 / 日三列滚轮 —— 「像调手表一样」选出生日期。
 *
 * 为什么不用 `<input type="date">`
 * ------------------------------
 * 原生日期控件在三个平台上长得完全不一样（macOS 是个小日历弹层、
 * Windows 是分段输入框、iOS 是系统滚轮），它既不受设计令牌控制，
 * 也没法统一三语的年份/月份顺序。三列滚轮是本项目里唯一能在
 * 手机和桌面都稳定呈现的形态，而且**用手滑**这件事本身比敲数字快得多。
 *
 * 「未选择」是一个真实状态
 * ----------------------
 * 滚轮永远停在某一行，所以"没选过"无法用空值表达。这里刻意把它做成
 * `value === null`：初次渲染时三列停在一个中性的默认位置（1995-06-15），
 * 但隐藏字段是**空的**，界面也提示"请滑动选择"。用户第一次滑动才产生真实值。
 *
 * 这样做的原因是出生日期直接决定年龄，而年龄是匹配的硬条件之一；
 * 一个"看起来已经填好、其实没人选过"的默认值，会悄悄把所有人的年龄
 * 都算成同一岁。
 */

/** 未选择时的停靠位置。刻意取一个中间值，不偏向任何年代。 */
const FALLBACK = { year: 1995, month: 6, day: 15 };

const MONTHS_IN_YEAR = 12;

function daysInMonth(year: number, month: number): number {
  // day=0 表示"上个月的最后一天"，所以这里 to 的是当月天数。
  // new Date(2008, 2, 0) → 2008-02-29，闰年自动正确。
  return new Date(year, month, 0).getDate();
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function formatValue(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

interface Parsed {
  year: number;
  month: number;
  day: number;
}

function parse(value: string | null): Parsed | null {
  if (!value) {
    return null;
  }

  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!matched) {
    return null;
  }

  return {
    year: Number(matched[1]),
    month: Number(matched[2]),
    day: Number(matched[3]),
  };
}

export interface WheelDatePickerProps {
  /** `yyyy-mm-dd`；null 表示用户还没有选过。 */
  value: string | null;
  onChange: (value: string | null) => void;
  /** 允许的年份范围（含端点）。出生日期一般传「今年-80」到「今年-18」。 */
  minYear: number;
  maxYear: number;
  /** 隐藏字段名，让这个组件能直接参与表单提交。 */
  name?: string;
  id?: string;
  className?: string;
}

export function WheelDatePicker({
  value,
  onChange,
  minYear,
  maxYear,
  name,
  id,
  className,
}: WheelDatePickerProps) {
  const t = useTranslations("datePicker");
  const locale = useLocale();

  const parsed = parse(value);

  // 三列的显示位置：没选过就停在默认位置，虚拟出一个日期供滚轮渲染。
  const shown = parsed ?? FALLBACK;
  const year = Math.min(Math.max(shown.year, minYear), maxYear);
  const month = Math.min(Math.max(shown.month, 1), MONTHS_IN_YEAR);
  const dayLimit = daysInMonth(year, month);
  const day = Math.min(Math.max(shown.day, 1), dayLimit);

  /**
   * 年份列**降序**：生日场景下用户多半落在最近二三十年，
   * 放在顶部（列表开头）可以让绝大多数人少滑一大截。
   */
  const yearOptions = useMemo<WheelOption[]>(() => {
    const list: WheelOption[] = [];

    for (let value = maxYear; value >= minYear; value -= 1) {
      list.push({ value, label: String(value) });
    }

    return list;
  }, [minYear, maxYear]);

  const monthOptions = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: MONTHS_IN_YEAR }, (_, index) => index + 1).map(
        (value) => ({ value, label: pad(value) }),
      ),
    [],
  );

  // 日列随年月变长变短：2 月只有 28/29 天，31 天月份才有 31。
  // 依赖 dayLimit 而不是 month —— 闰年时月份没变，天数却要跟着变。
  const dayOptions = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: dayLimit }, (_, index) => index + 1).map(
        (value) => ({
          value,
          label: pad(value),
        }),
      ),
    [dayLimit],
  );

  /**
   * 统一出口：任何一列变化都走这里，并在这里**夹紧日期**。
   *
   * 夹紧要发生在这里而不是三处各自处理：用户把月份从 1 月滑到 2 月时，
   * 日列还停在 31，若不夹紧就会拼出 2008-02-31 这种非法日期。
   */
  function commit(nextYear: number, nextMonth: number, nextDay: number) {
    const limit = daysInMonth(nextYear, nextMonth);
    onChange(formatValue(nextYear, nextMonth, Math.min(nextDay, limit)));
  }

  const readable = parsed
    ? new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(parsed.year, parsed.month - 1, parsed.day))
    : null;

  const columns = [
    {
      key: "year",
      label: t("year"),
      options: yearOptions,
      index: maxYear - year,
      onIndexChange: (next: number) => commit(maxYear - next, month, day),
      className: "flex-[1.35]",
    },
    {
      key: "month",
      label: t("month"),
      options: monthOptions,
      index: month - 1,
      onIndexChange: (next: number) => commit(year, next + 1, day),
      className: "flex-[0.85]",
    },
    {
      key: "day",
      label: t("day"),
      options: dayOptions,
      index: day - 1,
      onIndexChange: (next: number) => commit(year, month, next + 1),
      className: "flex-[0.85]",
    },
  ];

  return (
    <div
      className={cn("rounded-2xl border border-border bg-card p-3", className)}
    >
      {/* 隐藏字段承载真正的提交值。未选择时是空串，
          交给服务端按"必填但为空"处理。 */}
      {name ? (
        <input type="hidden" name={name} id={id} value={value ?? ""} />
      ) : null}

      {/* 列标题单独一行：如果把它放进列的纵向流里，滚轮的几何中心
          就会被标题顶下去，而高亮带是按容器的 50% 定位的 —— 两者会错开。
          标题挪出来之后，下面那个容器的高度刚好等于滚轮高度。 */}
      <div className="flex gap-1 pb-1">
        {columns.map((column) => (
          <span
            key={column.key}
            className={cn(
              "text-center text-[10px] font-medium tracking-wide text-muted-foreground",
              column.className,
            )}
          >
            {column.label}
          </span>
        ))}
      </div>

      <div
        className="relative flex gap-1"
        style={{ height: WHEEL_HEIGHT }}
      >
        {/* 高亮带只画一次、横跨三列，做成一条连续的"表盘刻度线"，
            比三列各画一条更接近真实机械表的观感。 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-9 -translate-y-1/2 rounded-xl border-y border-primary/25 bg-primary/5"
        />

        {columns.map((column) => (
          <div
            key={column.key}
            className={cn("flex min-w-0", column.className)}
          >
            <Wheel
              options={column.options}
              index={column.index}
              onIndexChange={column.onIndexChange}
              ariaLabel={column.label}
              showHighlight={false}
              className="w-full"
            />
          </div>
        ))}
      </div>

      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        {readable ? t("selected", { value: readable }) : t("hint")}
      </p>
    </div>
  );
}
