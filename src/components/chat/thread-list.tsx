"use client";

import { Crown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { VerificationBadges } from "@/components/profile/verification-badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, usePathname } from "@/i18n/navigation";
import {
  ensureViewerProfile,
  getMember,
  listChats,
  subscribeToChats,
} from "@/lib/chat-client";
import type { ChatRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import type { VerificationTag } from "@/types/verification";
import {
  CHATS_HREF,
  useUnreadActions,
} from "@/components/chat/unread-provider";

/**
 * The conversation list, read from the database through the API.
 *
 * Rendered in two placements:
 *
 *   < xl  inline in the `/chats` page, i.e. the usual mobile list
 *   xl+   inside the left rail rendered by `(main)/chats/layout.tsx`
 *
 * Every value on screen — preview text, timestamp, unread badge — is a column
 * that database triggers maintain on each message write. The list therefore
 * never patches its own copy: it refetches whenever the poll fires, so what it
 * shows is always what the database says. That is what makes the badge clear
 * when a thread is opened and the preview follow a sent message, rather than
 * those being two things that have to be remembered separately.
 */
export function ThreadList({ className }: { className?: string }) {
  const t = useTranslations("chats");
  const locale = useLocale();
  const pathname = usePathname();
  const { setUnread } = useUnreadActions();

  const [chats, setChats] = useState<ChatRow[]>([]);
  // Verification badges live on the member, not on the chat row, so they are
  // fetched per peer and cached. The list is polled, but a peer that has been
  // looked up once is never asked for again.
  const [badges, setBadges] = useState<Record<string, VerificationTag[]>>({});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // No viewer argument any more: the server scopes the query to the session
  // cookie, so there is no id here for the browser to get wrong.
  const refresh = useCallback(async () => {
    const rows = await listChats();

    setChats(rows);
    setUnread(
      CHATS_HREF,
      Object.fromEntries(
        rows.map((row) => [row.id, row.unread_count] as const),
      ),
    );
  }, [setUnread]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        // Resolving the viewer first keeps the list from rendering against an
        // unknown identity, and is what the server uses to scope the query.
        const profile = await ensureViewerProfile();

        if (!active) return;
        setViewerId(profile.id);
        await refresh();
      } catch {
        // A list that cannot reach the server shows its empty state rather
        // than an error: there is nothing useful for a member to do about it
        // here, and the thread screen surfaces real failures properly.
      } finally {
        if (active) setLoaded(true);
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [refresh]);

  // Live updates: a sent message and a cleared badge both change the `chats`
  // row, so one subscription drives the whole list. This is polling rather
  // than Supabase Realtime now — see `subscribeToChats` for the latency and
  // request-volume trade that implies.
  useEffect(() => {
    if (!viewerId) return;

    return subscribeToChats(() => refresh());
  }, [viewerId, refresh]);

  // Badges for any peer that has not been looked up yet. Requests are skipped
  // once cached, so this settles after the first render of each conversation.
  useEffect(() => {
    const missing = chats
      .map((chat) => chat.peer_id)
      .filter((id): id is string => typeof id === "string" && !(id in badges));

    if (missing.length === 0) return;

    let active = true;

    void Promise.all(
      missing.map(
        async (id) => [id, (await getMember(id))?.verifications ?? []] as const,
      ),
    )
      .then((entries) => {
        if (active) {
          setBadges((previous) => ({
            ...previous,
            ...Object.fromEntries(entries),
          }));
        }
      })
      .catch(() => {
        // Missing badges only lose a few small icons; the list itself works.
      });

    return () => {
      active = false;
    };
  }, [chats, badges]);

  if (loaded && chats.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-24 text-center">
        <p className="text-sm font-medium">{t("empty")}</p>
        <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <ul className={cn("flex flex-col divide-y divide-border", className)}>
      {chats.map((chat) => {
        const href = `/chats/${chat.slug}`;
        const active = pathname === href;

        return (
          <li key={chat.id}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-colors",
                active ? "bg-muted" : "hover:bg-muted/50 active:bg-muted",
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="size-12">
                  <AvatarImage src={chat.peer_avatar_url ?? ""} alt="" />
                  <AvatarFallback>
                    {(chat.peer_name ?? "?").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                {chat.peer_is_online ? (
                  <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-background bg-emerald-500" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {chat.peer_name}
                  </span>
                  {chat.peer_level ? (
                    <Crown className="size-2.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  <VerificationBadges
                    tags={chat.peer_id ? badges[chat.peer_id] : undefined}
                    size="xs"
                    max={3}
                  />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {chat.last_message_text ?? t("draft")}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                {chat.last_message_at ? (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(chat.last_message_at).toLocaleDateString(locale)}
                  </span>
                ) : null}
                {chat.unread_count > 0 ? (
                  <span className="text-destructive-foreground flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-medium">
                    {chat.unread_count > 99 ? "99+" : chat.unread_count}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
