"use client";

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  Mail,
  MessageSquare,
  Wand2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestCodeAction,
  submitAuthAction,
  type AuthSubmitState,
  type RequestCodeState,
  type SignInMethod,
} from "@/lib/auth/actions";
import { AUTH_CHANNELS, type AuthChannel } from "@/lib/auth/channels";
import {
  CODE_RESEND_COOLDOWN_MS,
  MOCK_SAMPLE_EMAIL,
  MOCK_SAMPLE_PHONE,
} from "@/lib/auth/constants";
import { looksValid } from "@/lib/auth/identifier";
import {
  checkNewPassword,
  PASSWORD_MIN_LENGTH,
  passwordStrength,
  type PasswordProblem,
} from "@/lib/auth/password";
import { cn } from "@/lib/utils";

/**
 * 注册 / 登录表单。
 *
 * 一个组件服务两个页面（`mode` 决定文案与提交去向），因为两者的差别只有：
 *   注册多一个协议勾选与设置密码，成功后去补资料；登录成功后回目录页。
 * 拆成两份代码会让"验证码怎么发、什么时候清空"这类逻辑有两处实现。
 *
 * 通道切换（手机号 / 邮箱）与登录方式切换（验证码 / 密码）都是**本地状态 + 隐藏字段**，
 * 不是路由参数：用户在几种方式之间来回比较是常态，换一次页面就丢一次已输入的内容会很烦。
 *
 * 密码强度的判定与注册校验共用 `lib/auth/password.ts` —— 同一个函数既驱动这里的
 * 进度条，也在服务端挡下不合规的密码。前端只做提示，**不拦提交**：
 * 真正的把关必须在服务端，否则绕过浏览器就能注册一个空密码。
 */

const CHANNEL_ICON: Record<AuthChannel, typeof Mail> = {
  sms: MessageSquare,
  email: Mail,
};

const STRENGTH_TONE = [
  "bg-muted-foreground/30",
  "bg-destructive",
  "bg-amber-500",
  "bg-emerald-500",
] as const;

export function AuthForm({ mode }: { mode: "register" | "signin" }) {
  const t = useTranslations("auth");
  const te = useTranslations("auth.errors");

  const [state, formAction, pending] = useActionState<
    AuthSubmitState,
    FormData
  >(submitAuthAction, {});

  const [channel, setChannel] = useState<AuthChannel>("sms");
  const [identifier, setIdentifier] = useState("");
  const [method, setMethod] = useState<SignInMethod>("code");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendState, setSendState] = useState<RequestCodeState | null>(null);
  const [sending, startSending] = useTransition();
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  // 冷却倒计时。用 setTimeout 而不是 setInterval：每秒重建一个一次性定时器，
  // 不必在组件卸载时和 setInterval 的累积误差打交道。
  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);

    return () => clearTimeout(timer);
  }, [cooldown]);

  /**
   * 换通道时把已发出的验证码一并丢掉。
   *
   * 否则"验证码已发往 +8613800000000"会挂在邮箱输入框下面，
   * 用户会以为邮箱收到了码，然后拿着一条属于手机号的码去提交。
   */
  function switchChannel(next: AuthChannel) {
    if (next === channel) {
      return;
    }

    setChannel(next);
    setIdentifier("");
    setSendState(null);
    setCooldown(0);
  }

  function switchMethod(next: SignInMethod) {
    if (next === method) {
      return;
    }

    setMethod(next);
    // 两种方式的错误提示来源不同，切换时把上一次的发送回执清掉，
    // 免得"验证码已发往…"挂在一个只剩密码框的界面上。
    setSendState(null);
    setCooldown(0);
  }

  function sendCode() {
    startSending(async () => {
      const result = await requestCodeAction({
        channel,
        rawIdentifier: identifier,
        mode,
      });

      setSendState(result);

      if (result.ok) {
        setCooldown(CODE_RESEND_COOLDOWN_MS / 1000);
        codeRef.current?.focus();
      }
    });
  }

  // 提交错误优先于发送错误：用户刚点的是"提交"，他关心的是这一次为什么没进去。
  const activeError =
    state.error ?? (sendState && !sendState.ok ? sendState.error : undefined);

  // 格式明显不对就别让他发码 —— 白等一条短信不如当场把输入框标出来。
  // 用的是与数据层完全相同的规则（lib/auth/identifier），不存在两边判断不一致的问题。
  const canSend = looksValid(channel, identifier) && !sending && cooldown === 0;

  /**
   * 输入过程中给出的密码提示（不拦提交）。
   *
   * 与提交时的判定共用 `checkNewPassword`，所以不会出现"这里显示合格、
   * 提交后却报错"的分歧。identifier 传进去是为了提前发现"密码就是自己手机号"。
   */
  const passwordHint = useMemo(() => {
    if (password === "") {
      return null;
    }

    return checkNewPassword(password, passwordConfirm, identifier);
  }, [password, passwordConfirm, identifier]);

  const strength = passwordStrength(password);
  const showSignUpPassword = mode === "register";
  const showSignInPassword = mode === "signin" && method === "password";
  const showCode = mode === "register" || method === "code";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* 这几个字段是 server action 的入参。 */}
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="channel" value={channel} />
      <input
        type="hidden"
        name="method"
        value={mode === "register" ? "code" : method}
      />

      <div className="flex flex-col gap-3">
        <Label>{t("channelLabel")}</Label>

        <div role="group" className="grid grid-cols-2 gap-2">
          {AUTH_CHANNELS.map((option) => {
            const Icon = CHANNEL_ICON[option];
            const active = option === channel;

            return (
              <button
                key={option}
                type="button"
                onClick={() => switchChannel(option)}
                aria-pressed={active}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-all",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {t(`channel.${option}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* 本地测试模式：本机没有短信/邮件通道，所以把码直接亮出来。 */}
      {showCode && sendState?.ok && sendState.devCode ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              {t("dev.hintTitle")}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700/80 dark:text-amber-400/80">
              {t("dev.hintBody", { code: sendState.devCode })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              const input = codeRef.current;

              if (!input) {
                return;
              }

              input.value = sendState.devCode ?? "";
              input.form?.requestSubmit();
            }}
          >
            <Wand2 className="size-3.5" />
            {t("dev.autofill")}
          </Button>
        </div>
      ) : null}

      {activeError ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          {te(activeError)}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">{t(`identifierLabel.${channel}`)}</Label>
        <Input
          id="identifier"
          name="identifier"
          type={channel === "sms" ? "tel" : "email"}
          inputMode={channel === "sms" ? "tel" : "email"}
          autoComplete={channel === "sms" ? "tel" : "email"}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder={
            channel === "sms" ? MOCK_SAMPLE_PHONE : MOCK_SAMPLE_EMAIL
          }
          required
        />
      </div>

      {/* 登录页：验证码 / 密码二选一。注册页不显示这一行，它固定两步都要。 */}
      {mode === "signin" ? (
        <div className="flex flex-col gap-3">
          <Label>{t("method.label")}</Label>
          <div role="group" className="grid grid-cols-2 gap-2">
            {(["code", "password"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => switchMethod(option)}
                aria-pressed={method === option}
                className={cn(
                  "rounded-xl border py-2 text-sm font-medium transition-all",
                  method === option
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {t(`method.${option}`)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showCode ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">{t("codeLabel")}</Label>
          <div className="flex gap-2">
            <Input
              ref={codeRef}
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={t("codePlaceholder")}
              className="flex-1 font-mono tracking-[0.3em]"
              required
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={!canSend}
              onClick={sendCode}
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : null}
              {cooldown > 0
                ? t("resendIn", { seconds: cooldown })
                : t("sendCode")}
            </Button>
          </div>

          {sendState?.ok && sendState.sentTo ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {t("sentTo", { target: sendState.sentTo })}
            </p>
          ) : null}
        </div>
      ) : null}

      {showSignUpPassword || showSignInPassword ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">
              {showSignUpPassword
                ? t("password.labelNew")
                : t("password.label")}
            </Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  showSignUpPassword ? "new-password" : "current-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("password.placeholder")}
                className="pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={
                  showPassword ? t("password.hide") : t("password.show")
                }
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* 注册要确认密码；登录不需要 —— 输错一次的成本只是再输一次。 */}
          {showSignUpPassword ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="passwordConfirm">
                  {t("password.confirmLabel")}
                </Label>
                <Input
                  id="passwordConfirm"
                  name="passwordConfirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder={t("password.confirmPlaceholder")}
                  required
                />
              </div>

              {/* 强度条：三段，只做提示。颜色与文案都由 strength 决定，
                  不参与提交校验（见 checkPassword）。 */}
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors",
                        index < strength ? STRENGTH_TONE[strength] : "bg-muted",
                      )}
                    />
                  ))}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {t("password.strengthLabel")}
                  {t(`password.strength.${strength}`)}
                </span>
              </div>

              <p
                className={cn(
                  "text-[11px] leading-relaxed",
                  passwordHint ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {passwordHint
                  ? te(passwordProblemKey(passwordHint))
                  : t("password.hint", { min: PASSWORD_MIN_LENGTH })}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {mode === "register" ? (
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
          <input
            type="checkbox"
            name="terms"
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>{t("terms")}</span>
        </label>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full rounded-full"
        disabled={pending}
      >
        {pending ? t(`${mode}.submitting`) : t(`${mode}.submit`)}
      </Button>
    </form>
  );
}

/**
 * 本地提示用的映射表。与 `lib/auth/actions.ts` 里的服务端映射一一对应 ——
 * 两份都指向同一批 `auth.errors.*` 键，所以用户在两端看到的是同一句话。
 * 这里不复用服务端那份，是因为 `actions.ts` 带 `"use server"`，
 * 它的导出不能进客户端包。
 */
function passwordProblemKey(
  problem: PasswordProblem | "mismatch",
):
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordTooSimple"
  | "passwordSameAsIdentifier"
  | "passwordMismatch" {
  switch (problem) {
    case "empty":
      return "passwordRequired";
    case "tooShort":
      return "passwordTooShort";
    case "tooLong":
      return "passwordTooLong";
    case "tooSimple":
      return "passwordTooSimple";
    case "sameAsIdentifier":
      return "passwordSameAsIdentifier";
    case "mismatch":
      return "passwordMismatch";
  }
}
