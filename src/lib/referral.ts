import { PROMO_CODE_TTL_DAYS } from "@/lib/agent";

/**
 * Referral capture, shared by the middleware that writes the cookie and the
 * client that later spends it.
 *
 * Why a cookie and not `localStorage`: the capture has to happen *before* any
 * React code runs, otherwise a member who bounces straight to another page can
 * outrun it. Middleware is the only hook that sees the link on its first
 * request, and it can only write a cookie.
 *
 * The cookie is deliberately readable by script. A referral code is a share
 * link, not a credential — it is printed on screen and pasted into messengers
 * — and the profile-creation path needs to read it in the browser. Nothing is
 * authorised by its contents: the code is only used to look up a row, and an
 * unknown code is discarded rather than trusted.
 */

export const REF_COOKIE = "loono_ref";

/** Matches the promo-code window, so a link and its code expire together. */
export const REF_COOKIE_MAX_AGE = PROMO_CODE_TTL_DAYS * 24 * 60 * 60;

/**
 * Deliberately narrow. These codes travel through SMS, messengers and printed
 * material, so anything outside this set is either a typo or an attempt to
 * stuff the cookie, and both are cheaper to reject than to store.
 */
const REF_PATTERN = /^[A-Za-z0-9_-]{4,24}$/;

export function isValidRefCode(value: unknown): value is string {
  return typeof value === "string" && REF_PATTERN.test(value);
}

/**
 * Normalises a code to its canonical form, or null if it is not usable.
 *
 * Codes are stored upper case by the database trigger, so normalising here too
 * means `?ref=alex60` from a hand-typed message resolves the same profile as a
 * link the platform generated.
 */
export function normalizeRefCode(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return isValidRefCode(trimmed) ? trimmed.toUpperCase() : null;
}

/**
 * Reads the captured code in the browser. Returns null during SSR, where
 * `document` does not exist — the profile is created client-side, so that is
 * not a case that needs handling beyond returning null.
 */
export function readRefCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${REF_COOKIE}=([^;]*)`),
  );

  if (!match) {
    return null;
  }

  return normalizeRefCode(decodeURIComponent(match[1]));
}

/**
 * Drops the cookie once it has been spent on a profile.
 *
 * Attribution is first-touch, so a second signup in the same browser must not
 * be re-attributed to whoever the last link happened to point at. Failing
 * early — before the profile exists — leaves the code in place to be retried.
 */
export function clearRefCookie(): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${REF_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}

/**
 * The share link a member hands out.
 *
 * Built from the live origin rather than a constant, because the consumer site
 * is `loono.com` in production but `localhost:3000` in development and the two
 * must not drift apart. The locale segment is left out on purpose: the
 * middleware resolves it and preserves the query string, so `/auth/register?ref=X`
 * lands on `/ru/auth/register?ref=X` for a Russian member.
 *
 * 指向注册页而不是登录页：邀请链接的唯一用途就是拉新，
 * 落到登录页会让被邀请的人先去读一句"欢迎回来"。
 */
export function buildReferralUrl(origin: string, refCode: string): string {
  return `${origin.replace(/\/$/, "")}/auth/register?ref=${encodeURIComponent(refCode)}`;
}
