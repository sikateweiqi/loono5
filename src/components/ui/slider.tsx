"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "cn";

/**
 * 滑动条。单值与区间共用一个组件。
 *
 * 为什么统一用**数组**传值
 * ----------------------
 * 身高是一个数，择偶的年龄区间是两个数。做成两个组件会逼调用方记住
 * "哪个用 number、哪个用 number[]"，而两者的 99% 代码是一样的。
 * 所以对外只暴露数组：单值传 `[v]`，区间传 `[min, max]`，
 * 需要几个滑块由 `value.length` 决定 —— 少一个"thumbs 数量与 value 长度不一致"
 * 的坏状态。
 *
 * 表单集成：base-ui 的滑块内部会渲染 `<input type="range">`，
 * 所以传 `name` 就能直接参与原生表单提交（区间会提交两个同名值）。
 */
export interface SliderProps {
  /** 单值 `[v]`，区间 `[min, max]`。 */
  value: number[];
  onChange: (value: number[]) => void;
  min: number;
  max: number;
  step?: number;
  name?: string;
  disabled?: boolean;
  /**
   * 每个滑块的 aria-label，按值数组的下标对应。
   *
   * 是必填而不是可选：base-ui 的 `getAriaLabel` 返回类型是 `string`，
   * 没有标签时只能退化成空串 —— 那会让读屏软件念出一个没有名字的滑块。
   * 与其允许"有滑块但没标签"这种状态，不如要求调用方在构造
   * `value` 的同时就把标签一起给出来，两者长度天然一致。
   */
  ariaLabels: string[];
  className?: string;
}

/**
 * 把 base-ui 回调给的负载统一成数组。
 *
 * 为什么需要它 —— 上游对"这是不是区间滑块"有两个互相打架的判定：
 *
 * - `SliderRoot` 用 `Array.isArray(value)`：传 `[175]` 就算区间（`range = true`）；
 * - `SliderControl` / `SliderThumb` 用 `values.length > 1`：`[175]` 只有一个值，
 *   算**单值**（`range = false`）。
 *
 * 两者在"只传一个元素的数组"上结论相反，于是同一个滑块的不同交互路径
 * 吐出不同形状的负载（已实测，不是推断）：
 *
 * - 隐藏 `<input type="range">` 的 change（键盘/表单）走 Root 的 `range` → 给 `number[]`；
 * - 指针拖动走 Control 的 `range` → 给**裸 `number`**。
 *
 * 于是 `[...next]` 在拖动时会抛 `TypeError: next is not iterable` ——
 * 这正是身高/体重滑块的线上报错。对外我们坚持"只暴露数组"（见文件头注释），
 * 所以差异必须在这一个边界处被抹平，而不是让每个调用方各自判断。
 *
 * 用 `typeof === "number"` 而不是 `Array.isArray`：对 `readonly number[]`
 * 做 `Array.isArray` 窄化后类型会退化成 `any[]`，而这里两种形状是互斥的，
 * 用 typeof 既能正确窄化、也把"只有这两种形状"写死在代码里。
 */
export function toSliderValueArray(next: number | readonly number[]): number[] {
  return typeof next === "number" ? [next] : [...next];
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  name,
  disabled,
  ariaLabels,
  className,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      onValueChange={(next) => onChange(toSliderValueArray(next))}
      min={min}
      max={max}
      step={step}
      name={name}
      disabled={disabled}
      // 两个滑块相撞时不允许越过对方：身高区间写成 180–160 没有意义，
      // 而"推着走"（push）会让上滑块把下滑块一路顶到最大值。
      thumbCollisionBehavior="none"
      className={cn("w-full", className)}
    >
      <SliderPrimitive.Control className="flex w-full touch-none items-center py-3 select-none">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full rounded-full bg-muted"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="absolute h-full rounded-full bg-primary"
          />
        </SliderPrimitive.Track>

        {value.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            index={index}
            getAriaLabel={(index) => ariaLabels[index] ?? ""}
            className={cn(
              "size-5 rounded-full border-2 border-primary bg-background shadow-sm transition-shadow",
              "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              // 拖动时让滑块略微放大 —— 手指挡住它的时候，
              // 这一点缩放是唯一能确认"我确实抓住了它"的反馈。
              "data-[dragging]:scale-110 data-[dragging]:shadow-md",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
