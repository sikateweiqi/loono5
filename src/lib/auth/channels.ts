/**
 * 注册 / 登录通道。
 *
 * 之所以单独一个模块而不是放在 `lib/db/auth.ts` 里：那个文件带 `server-only`，
 * 而客户端表单组件也需要知道这两个通道的字面量。放这里两边都能引，
 * 且没有把数据层拖进浏览器包的风险。
 */

export type AuthChannel = "sms" | "email";

export const AUTH_CHANNELS: readonly AuthChannel[] = ["sms", "email"];

export function isAuthChannel(value: unknown): value is AuthChannel {
  return value === "sms" || value === "email";
}
