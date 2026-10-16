import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * 样式对齐设计令牌的**原生** `<select>`。
 *
 * 为什么不用 `components/ui/select.tsx`（base-ui 的自定义弹层）
 * ---------------------------------------------------------
 * 这个控件是给「国家 → 城市」这类**长列表**用的：
 *
 * 1. **移动端是主战场。** 本工程是移动优先的 H5，重点适配微信内置浏览器。
 *    国家列表 15 项、城市列表最多 8 项，在手机上原生选择器会唤起系统滚轮
 *    （iOS）或全屏列表（Android），触控目标、惯性滚动、首字母跳转都是系统给的；
 *    自定义弹层要把这些一件件重做，且在小屏上很容易只露出三四行。
 * 2. **表单集成是零成本的。** 原生 `select` 的 `name` / `value` / `onChange`
 *    就是浏览器语义，不依赖组件库把值同步进隐藏 input 的实现细节。
 * 3. **级联逻辑更直白。** "换国家就重置城市"只需要在两个 `value` 上做文章，
 *    不必和弹层的开合状态打交道。
 *
 * 代价是没有自定义弹层的观感。这里用 `appearance-none` 去掉系统样式，
 * 再手绘一个 `ChevronDown` 作为提示，视觉上与 `Input` 保持一致
 * （同样的圆角、边框、高度、聚焦环）—— 换句话说，它在页面上**看起来**
 * 就是设计系统里的输入框，只是点开时交给系统。
 */
export interface NativeSelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  /** 未选择时显示的占位项。传了它才会渲染一个 `value=""` 的禁用项。 */
  placeholder?: string;
  /** 选项列表。`disabled` 的项会被渲染成不可选。 */
  options: readonly {
    value: string;
    label: string;
    disabled?: boolean;
  }[];
  /** 尺寸。`lg` 用于注册引导这类大触控目标页面。 */
  size?: "default" | "lg";
}

export function NativeSelect({
  placeholder,
  options,
  size = "default",
  className,
  value,
  ...props
}: NativeSelectProps) {
  /*
    受控与不受控要分开处理：
    * 受控（传了 `value`）时，占位项必须在"当前值不在选项里"时出现，
      否则 React 会因为 select 的 value 找不到对应 option 而渲染成空白，
      用户看到的是一个没有任何文字的框。
    * 不受控时按浏览器默认行为走（选中第一个 option），占位项交给
      `defaultValue=""` 的调用方自己决定。
  */
  const isControlled = value !== undefined;
  const showPlaceholder =
    placeholder !== undefined && (!isControlled || String(value ?? "") === "");

  return (
    <div className="relative">
      <select
        {...props}
        value={value}
        className={cn(
          "w-full appearance-none rounded-lg border border-input bg-transparent pr-8 pl-2.5 text-sm transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          size === "lg" ? "h-11" : "h-9",
          // 未选择时用弱化文字，和占位符的观感一致。
          showPlaceholder && placeholder !== undefined
            ? "text-muted-foreground"
            : "text-foreground",
          className,
        )}
      >
        {showPlaceholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}

        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>

      {/*
        箭头必须是 pointer-events-none，否则点它落到的是箭头而不是 select，
        在部分浏览器上会导致"点了下拉却不展开"。
      */}
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
