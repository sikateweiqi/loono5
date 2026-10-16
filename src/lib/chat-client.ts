"use client";

import type { ChatRow, ReportReason } from "@/lib/db/types";
import type { Message } from "@/types/chat";
import type { PublicUser } from "@/types/user";

/**
 * The browser's chat / block / report surface.
 *
 * This module exists because the data no longer lives in the browser. The
 * previous implementation (the `lib/supabase/*` modules) talked to Supabase
 * directly with the anon key and leaned on RLS for authorisation.
 * With a plain PostgreSQL behind Next.js there is no PostgREST and no GoTrue,
 * so every read and write goes through the route handlers in `src/app/api/**`
 * and the caller's identity is resolved server-side from the session cookie.
 *
 * Three rules hold everywhere below:
 *
 *   1. No request carries a caller id. The server decides who is asking, so a
 *      compromised browser cannot act as somebody else.
 *   2. A failure throws an `Error` whose message is safe to render — the
 *      server replies with a finished sentence, and the components already
 *      display `cause.message` verbatim.
 *   3. `subscribeXxx` replaces Supabase Realtime with polling. Each returns an
 *      unsubscribe function; callers must call it on unmount.
 */

/** Everything the UI needs to describe the other side of a conversation. */
export interface PeerDisplay {
  id: string;
  name: string;
  avatarUrl: string | null;
  level: number | null;
  isOnline: boolean;
}

/** The signed-in (or browsing) member, as `GET /api/profile` reports them. */
export interface ViewerProfile {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  level: number;
  refCode: string | null;
}

/** `POST /api/chats`: the conversation row plus its history. */
export interface ThreadWithMessages {
  chat: ChatRow;
  messages: Message[];
}

/** An HTTP failure, kept typed so callers can branch on the status. */
class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * One fetch, one JSON parse, one error path.
 *
 * `credentials: "same-origin"` is what carries the session cookie the API
 * resolves the viewer from — spelled out rather than left to the default so
 * nobody "optimises" it away later.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init?.body
      ? { "content-type": "application/json", ...init?.headers }
      : init?.headers,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `请求失败（${response.status}）。`;

    throw new ApiError(response.status, message);
  }

  return payload as T;
}

/* ─────────────────────────── 身份（替代 ensureViewerProfile） ─────────────────────────── */

/**
 * Resolves who is looking at the screen.
 *
 * The old `ensureViewerProfile(input)` minted a profile row from the anonymous
 * Supabase session, so it needed the display name and avatar as arguments.
 * Now the row is created at phone sign-in (see `lib/db/viewer.ts`), so there is
 * nothing to create and nothing to pass: this is a plain read.
 */
export async function ensureViewerProfile(): Promise<ViewerProfile> {
  return request<ViewerProfile>("/api/profile");
}

/* ─────────────────────────── 会话 ─────────────────────────── */

/**
 * The conversation list, newest activity first.
 *
 * No viewer id argument: the server scopes the query to whoever owns the
 * cookie. That is a deliberate signature change from the Supabase version —
 * passing an id from the browser was only ever safe because RLS re-checked it.
 *
 * One honest caveat about the row type: `ChatRow` is the server-side shape, so
 * it declares `last_message_at` and `created_at` as `Date`. JSON turns them
 * into ISO strings on the way here. The consumers feed them straight to
 * `new Date(...)`, which accepts either, so nothing is lost — but the declared
 * type is a little kinder than the wire.
 */
export async function listChats(): Promise<ChatRow[]> {
  return request<ChatRow[]>("/api/chats");
}

/** Looks the viewer's own row up by slug, or null when they have none yet. */
async function findChatBySlug(slug: string): Promise<ChatRow | null> {
  const rows = await listChats();

  return rows.find((row) => row.slug === slug) ?? null;
}

/**
 * Ensures the conversation exists and returns it with its history.
 *
 * The upsert requires a real session: a browsing visitor is a read-only
 * showcase identity, and letting them write would mean writing as somebody
 * else. They can still *open* a conversation that already exists, though —
 * that is what the 401 fallback below is for, and it keeps the demo readable
 * without a sign-in.
 */
export async function ensureThreadWithMessages(input: {
  slug: string;
  peer: PeerDisplay;
  /** The peer's profile id when they have one; null for an unseeded peer. */
  peerId?: string | null;
}): Promise<ThreadWithMessages> {
  try {
    return await request<ThreadWithMessages>("/api/chats", {
      method: "POST",
      body: JSON.stringify({
        slug: input.slug,
        peer: input.peer,
        peerId: input.peerId ?? null,
      }),
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      const chat = await findChatBySlug(input.slug);

      if (chat) {
        return { chat, messages: await fetchThreadMessages(chat.id) };
      }
    }

    throw cause;
  }
}

/** The same thing when only the row is needed (the thread header, mostly). */
export async function ensureChatThread(input: {
  slug: string;
  peer: PeerDisplay;
  peerId?: string | null;
}): Promise<ChatRow> {
  const { chat } = await ensureThreadWithMessages(input);

  return chat;
}

/** One conversation's history, oldest first. */
export async function fetchThreadMessages(chatId: string): Promise<Message[]> {
  return request<Message[]>(
    `/api/chats/${encodeURIComponent(chatId)}/messages`,
  );
}

/** Appends a message and returns the stored row (sender comes from the session). */
export async function sendMessage(input: {
  chatId: string;
  body: string;
  locale: string;
}): Promise<Message> {
  return request<Message>(
    `/api/chats/${encodeURIComponent(input.chatId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ body: input.body, locale: input.locale }),
    },
  );
}

/** Marks every message in a thread as read. */
export async function markThreadRead(chatId: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/chats/${encodeURIComponent(chatId)}/read`,
    { method: "POST" },
  );
}

/** Removes a conversation from this member's list. Reversible, and private. */
export async function hideChatForUser(chatId: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/chats/${encodeURIComponent(chatId)}/hide`,
    { method: "POST" },
  );
}

/** Undoes a hide, e.g. from a "restore deleted chats" affordance. */
export async function showChatForUser(chatId: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/chats/${encodeURIComponent(chatId)}/hide`,
    { method: "DELETE" },
  );
}

/* ─────────────────────────── 拉黑 / 举报 ─────────────────────────── */

/** Profile ids this member has blocked, for filtering the feed. */
export async function listBlockedProfileIds(): Promise<string[]> {
  return request<string[]>("/api/blocks");
}

export async function blockUser(blockedProfileId: string): Promise<void> {
  await request<{ ok: boolean }>("/api/blocks", {
    method: "POST",
    body: JSON.stringify({ profileId: blockedProfileId }),
  });
}

export async function unblockUser(blockedProfileId: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/blocks?profileId=${encodeURIComponent(blockedProfileId)}`,
    { method: "DELETE" },
  );
}

export async function isBlocked(blockedProfileId: string): Promise<boolean> {
  const ids = await listBlockedProfileIds();

  return ids.includes(blockedProfileId);
}

/** Files a report under the caller's own name (the server sets the reporter). */
export async function reportUser(input: {
  reportedProfileId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  await request<{ ok: boolean }>("/api/reports", {
    method: "POST",
    body: JSON.stringify({
      profileId: input.reportedProfileId,
      reason: input.reason,
      details: input.details,
    }),
  });
}

/* ─────────────────────────── 会员（徽章展示用） ─────────────────────────── */

/** A member by id or handle; null when there is no such profile. */
export async function getMember(id: string): Promise<PublicUser | null> {
  try {
    return await request<PublicUser>(`/api/profiles/${encodeURIComponent(id)}`);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) {
      return null;
    }

    throw cause;
  }
}

/* ─────────────────────────── 订阅：Realtime → 轮询 ─────────────────────────── */

/**
 * How often the two subscriptions below re-ask the server.
 *
 * Supabase Realtime pushed `postgres_changes` events over a websocket. This
 * build has no websocket infrastructure and deliberately does not grow one, so
 * a timer stands in. The trade is stated plainly:
 *
 *   · latency — a change is seen up to one interval late (4s here), versus
 *     sub-second push;
 *   · load — one `GET` per open list and one per open thread, every interval,
 *     per tab. Two windows on the same thread double it, and the queries run
 *     whether or not anything changed;
 *   · a hidden tab skips its tick, so backgrounding the app does not keep
 *     spending round trips.
 *
 * The interval is intentionally a single constant so raising it is a one-line
 * change if the request volume ever matters.
 */
const POLL_INTERVAL_MS = 4000;

/**
 * Notifies when the conversation list may have changed — a new preview, a
 * cleared badge, a peer going offline.
 *
 * The callback is expected to refetch rather than patch a local copy, exactly
 * as the Realtime version did: the list then always shows what the database
 * says. Rejections are swallowed here because a poll runs unattended; a
 * transient failure should not surface as an unhandled rejection, and the next
 * tick retries anyway.
 */
export function subscribeToChats(
  onChange: () => void | Promise<void>,
): () => void {
  const timer = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    try {
      void Promise.resolve(onChange()).catch(() => {});
    } catch {
      // A throwing callback must not kill the interval.
    }
  }, POLL_INTERVAL_MS);

  return () => clearInterval(timer);
}

/**
 * Notifies when new messages land in a conversation, so a second window (or
 * the other participant) sees them without a refresh.
 *
 * Deduplication lives in `seen`: each message id is delivered once per
 * subscription. The first tick therefore replays the whole history, and the
 * caller is expected to ignore ids it already has — which `MessageThread`
 * already does, because that is also how it swallows the echo of its own
 * optimistic insert. Replaying rather than priming an empty baseline is what
 * keeps a message that arrives between the initial load and the first tick
 * from being dropped on the floor.
 */
export function subscribeToMessages(
  chatId: string,
  onMessage: (message: Message) => void,
): () => void {
  const seen = new Set<string>();

  async function tick() {
    const messages = await fetchThreadMessages(chatId);

    for (const message of messages) {
      if (seen.has(message.id)) {
        continue;
      }

      seen.add(message.id);
      onMessage(message);
    }
  }

  const timer = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;

    // A poll has no caller to report to: a failed round trip (offline, 403
    // after a block) is retried on the next tick, and the thread screen
    // surfaces real failures when it loads.
    void tick().catch(() => {});
  }, POLL_INTERVAL_MS);

  return () => clearInterval(timer);
}
