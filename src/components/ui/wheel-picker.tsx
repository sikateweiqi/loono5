"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "cn";

/**
 * 滚动轮（drum / wheel）选择器的三个零件。
 *
 * 实现方式
 * --------
 * 不用虚拟列表、不用 transform 计算偏移，而是让浏览器来做这件事：
 * 一个固定高度的滚动容器 + `scroll-snap-type: y mandatory`，
 * 每一行 `scroll-snap-align: center`。滚轮/拖拽/触摸惯性全部由原生滚动提供，
 * 我们只做两件事：
 *
 *   1. **滚动停下来后**把最近的整数索引回报给上层（用定时器判断"停下来"，
 *      而不是 `scrollend` —— 后者在 Safari 上还没有）；
 *   2. 上层改值（比如点了某一行）时把容器滚到对应位置。
 *
 * 上下各留两行 padding，是为了让**第一行和最后一行也能滚到中间**。
 * 没有这段 padding，第一项永远压在顶部，永远不可能是选中项。
 *
 * 为什么"停下来"要用定时器而不是每次 scroll 都回报
 * ------------------------------------------------
 * 惯性滚动会连续触发几十次 scroll，每次都回报的话，上层会收到
 * 一整串中间值（1994、1993、1992…）并据此重新渲染日期。
 * 只在停下后回报一次，语义上才是"用户选了哪一年"。
 */

/** 单行高度（px）。三列共用，居中计算依赖它是个常量。 */
export const WHEEL_ITEM_HEIGHT = 36;

/** 可见行数。奇数，正中间那行即选中项。 */
const VISIBLE_ITEMS = 5;

/**
 * 滚动容器的总高度。
 *
 * 导出而不是让调用方自己写 `WHEEL_ITEM_HEIGHT * 5`：那个 5 是这里的
 * 私有常量，外面照抄一份就成了"改一处、另一处悄悄错位"的隐患 ——
 * 而错位的表现是高亮带与选中行差半行，看起来像随机 bug。
 */
export const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * VISIBLE_ITEMS;

/** 上下各留的行数，让首尾两项也能滚到中间。 */
const PAD_ITEMS = (VISIBLE_ITEMS - 1) / 2;

/** 判定"滚动停下来了"的静默时长。太短会误判惯性中段，太长会显得迟钝。 */
const SETTLE_MS = 90;

export interface WheelOption {
  value: number | string;
  label: string;
}

interface WheelProps {
  options: WheelOption[];
  /** 当前选中项的下标（受控）。 */
  index: number;
  onIndexChange: (index: number) => void;
  ariaLabel: string;
  /**
   * 是否画自己的选中高亮带。
   *
   * 三列日期滚轮要的是**一条横跨三列**的刻度线，所以由外层统一画、
   * 三列各自关掉；单独使用滚轮时保持默认 true。
   */
  showHighlight?: boolean;
  className?: string;
}

export function Wheel({
  options,
  index,
  onIndexChange,
  ariaLabel,
  showHighlight = true,
  className,
}: WheelProps) {
  const scroller = useRef<HTMLDivElement | null>(null);
  /** 由我们自己发起的滚动，期间忽略 scroll 事件（否则会把程序滚动当成用户选择）。 */
  const programmatic = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  /** 点行时的平滑滚动标记，只生效一次。 */
  const smoothNext = useRef(false);

  // 镜像一份当前下标：ref 回调在 commit 阶段就要用它定位初始位置，
  // 而那时还拿不到"最新一次渲染的 props"以外的任何东西。
  const indexRef = useRef(index);
  indexRef.current = index;

  /**
   * 首次挂载时直接把滚动条放到位，而不是等 useEffect。
   *
   * ref 回调发生在 commit 阶段、浏览器绘制之前，所以不会出现
   * "先停在最上面、半帧后再跳到 1995 年"的闪烁。
   */
  const attach = useCallback((el: HTMLDivElement | null) => {
    scroller.current = el;

    if (el) {
      el.scrollTop = indexRef.current * WHEEL_ITEM_HEIGHT;
    }
  }, []);

  // 外部改值（点了某行、年月变化导致日期被夹紧）→ 滚过去。
  useEffect(() => {
    const el = scroller.current;

    if (!el) {
      return;
    }

    const target = index * WHEEL_ITEM_HEIGHT;

    if (Math.abs(el.scrollTop - target) < 1) {
      smoothNext.current = false;
      return;
    }

    programmatic.current = true;
    el.scrollTo({
      top: target,
      behavior: smoothNext.current ? "smooth" : "auto",
    });
    smoothNext.current = false;

    // 平滑滚动会持续若干帧，期间一直是"程序发起的"；
    // 用定时器兜底解锁，比监听 scrollend 兼容性更好。
    const unlock = window.setTimeout(() => {
      programmatic.current = false;
    }, 400);

    return () => window.clearTimeout(unlock);
  }, [index]);

  useEffect(() => {
    return () => window.clearTimeout(settleTimer.current);
  }, []);

  function handleScroll() {
    if (programmatic.current) {
      return;
    }

    window.clearTimeout(settleTimer.current);

    settleTimer.current = window.setTimeout(() => {
      const el = scroller.current;

      if (!el) {
        return;
      }

      const next = Math.min(
        Math.max(Math.round(el.scrollTop / WHEEL_ITEM_HEIGHT), 0),
        options.length - 1,
      );

      if (next !== indexRef.current) {
        onIndexChange(next);
      }
    }, SETTLE_MS);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;

    if (
      delta === 0 ||
      (delta < 0 && index === 0) ||
      (delta > 0 && index === options.length - 1)
    ) {
      return;
    }

    event.preventDefault();
    onIndexChange(index + delta);
  }

  return (
    <div className={cn("relative", className)}>
      {/* 选中行的高亮带。放在滚动容器**外面**，所以它不跟着内容走，
          这正好给出"哪一行是当前值"的视觉锚点。 */}
      {showHighlight ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg border-y border-primary/25 bg-primary/5"
        />
      ) : null}

      <div
        ref={attach}
        role="listbox"
        tabIndex={0}
        aria-label={ariaLabel}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        style={{
          height: WHEEL_HEIGHT,
          scrollSnapType: "y mandatory",
          // 隐藏滚动条：这是滚轮，不是文本区。滚动条会打断"表盘"的观感，
          // 而且它占了宽度会让三列对不齐。
          scrollbarWidth: "none",
        }}
        className="relative overflow-y-auto overscroll-contain outline-none [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: PAD_ITEMS * WHEEL_ITEM_HEIGHT }} aria-hidden />

        {options.map((option, optionIndex) => {
          const active = optionIndex === index;

          return (
            <div
              key={option.value}
              role="option"
              aria-selected={active}
              onClick={() => {
                if (optionIndex !== index) {
                  smoothNext.current = true;
                  onIndexChange(optionIndex);
                }
              }}
              style={{ height: WHEEL_ITEM_HEIGHT, scrollSnapAlign: "center" }}
              className={cn(
                "flex cursor-pointer items-center justify-center tabular-nums transition-colors",
                // 越靠近上下边缘越小越淡，做出表盘滚过去的纵深感。
                active
                  ? "text-base font-semibold text-foreground"
                  : "text-sm text-muted-foreground/60 hover:text-foreground",
              )}
            >
              {option.label}
            </div>
          );
        })}

        <div style={{ height: PAD_ITEMS * WHEEL_ITEM_HEIGHT }} aria-hidden />
      </div>
    </div>
  );
}
