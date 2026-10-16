"use client";

import { AlertCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatComposer } from "@/components/chat/composer";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchThreadMessages,
  markThreadRead,
  sendMessage,
  subscribeToMessages,
} from "@/lib/chat-client";
import {
  CHATS_HREF,
  useUnreadActions,
} from "@/components/chat/unread-provider";
import { useThreadContext } from "@/components/chat/thread-moderation";
import { useModeration } from "@/components/chat/moderation-provider";
import type { Message } from "@/types/chat";
import { randomId } from "@/lib/utils";

type LoadState = "loading" | "ready" | "error";

/**
 * One conversation, backed by the database through the API.
 *
 * This is the first screen in the app that owns its data instead of reading a
 * module-level mock: it loads the history, follows new rows and writes new
 * ones. Sending is optimistic — the bubble appears immediately and is swapped
 * for the persisted row on success — so the thread never lags behind the
 * composer.
 *
 * The conversation itself is resolved by `ThreadModeration`, which owns the
 * row for the whole screen. Reading it from there rather than resolving again
 * keeps this to one lookup per open and one source of truth for the uuid.
 */
export function MessageThread() {
  const t = useTranslations("chats");
  const tm = useTranslations("chatModeration");
  const locale = useLocale();
  const { markRead } = useUnreadActions();
  const { chatId, viewerProfileId: viewerId } = useThreadContext();
  const { status: moderationStatus, unblock } = useModeration();

  const blocked = moderationStatus === "blocked";

  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  // Ids of optimistic rows whose insert failed, so they can be retried in place.
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const load = useCallback(async () => {
    if (!chatId) return;

    setState("loading");
    setError(null);

    try {
      const history = await fetchThreadMessages(chatId);

      // Opening a thread is what makes it read. The local count drops straight
      // away so the nav badge reacts to the tap, and the database recomputes
      // `chats.unread_count` from `messages.is_read` to agree with it.
      markRead(CHATS_HREF, chatId);
      void markThreadRead(chatId);

      setMessages(history);
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("error");
    }
  }, [chatId, markRead]);

  useEffect(() => {
    void load();
  }, [load]);

  // A message arriving while the thread is open is read by definition — the
  // member is looking at it — so it must not leave a badge behind. Only
  // incoming ones count; the optimistic echo of our own message is filtered
  // out above by id.
  useEffect(() => {
    if (!chatId || state !== "ready" || !viewerId) return;

    const hasIncoming = messages.some(
      (message) => message.senderId !== viewerId && !message.isRead,
    );

    if (hasIncoming) {
      void markThreadRead(chatId);
    }
  }, [messages, chatId, state, viewerId]);

  // Live updates. Polling is an enhancement, not a requirement: if a round
  // trip fails the subscription simply stays quiet and the thread still works
  // for the person typing in it. See `subscribeToMessages` for the interval.
  useEffect(() => {
    if (!chatId) return;

    return subscribeToMessages(chatId, (incoming) => {
      setMessages((previous) =>
        // The poll replays the history on its first tick; keep one copy.
        previous.some((message) => message.id === incoming.id)
          ? previous
          : [...previous, incoming],
      );
    });
  }, [chatId]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, state]);

  const send = useCallback(
    async (text: string) => {
      if (!chatId || !viewerId) return;

      const optimisticId = `pending:${randomId()}`;
      const optimistic: Message = {
        id: optimisticId,
        threadId: chatId,
        senderId: viewerId,
        originalText: text,
        originalLocale: localeRef.current,
        status: "sending",
        createdAt: new Date().toISOString(),
      };

      setMessages((previous) => [...previous, optimistic]);

      try {
        const saved = await sendMessage({
          chatId,
          body: text,
          locale: localeRef.current,
        });

        setMessages((previous) =>
          previous.map((message) =>
            message.id === optimisticId ? saved : message,
          ),
        );
        setFailed((previous) => {
          const next = new Set(previous);
          next.delete(optimisticId);
          return next;
        });
        // Clears any earlier failure banner now that a send has gone through.
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setFailed((previous) => new Set(previous).add(optimisticId));
      }
    },
    [chatId, viewerId],
  );

  const retry = useCallback(
    (message: Message) => {
      // Drop the failed row before resending, otherwise the retry adds a
      // second copy and both stay on screen.
      setMessages((previous) =>
        previous.filter((entry) => entry.id !== message.id),
      );
      setFailed((previous) => {
        const next = new Set(previous);
        next.delete(message.id);
        return next;
      });
      void send(message.originalText);
    },
    [send],
  );

  if (state === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-3 px-4 py-4 md:px-6 xl:px-8">
        {[0, 1, 2].map((index) => (
          <Skeleton
            key={index}
            className={`h-12 w-2/5 ${index % 2 === 0 ? "self-start" : "self-end"}`}
          />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <p className="max-w-[22rem] text-xs leading-relaxed text-muted-foreground">
          {error}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => void load()}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-1 flex-col">
        <ul className="flex flex-1 flex-col gap-3 px-4 py-4 md:px-6 xl:px-8">
          {messages.length === 0 ? (
            <li className="my-auto flex flex-col items-center gap-1.5 py-16 text-center">
              <p className="text-sm font-medium">{t("threadEmpty")}</p>
              <p className="max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
                {t("threadEmptyHint")}
              </p>
            </li>
          ) : null}

          {messages.length > 0 ? (
            <li className="my-1 text-center text-[10px] text-muted-foreground">
              {t("today")}
            </li>
          ) : null}

          {messages.map((message) => {
            const isOwn = message.senderId === viewerId;

            return (
              <li key={message.id} className="contents">
                <MessageBubble message={message} isOwn={isOwn} />
                {failed.has(message.id) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 self-start rounded-full text-[11px] text-destructive"
                    onClick={() => retry(message)}
                  >
                    <AlertCircle className="size-3" />
                    {t("sendFailed")}
                  </Button>
                ) : null}
              </li>
            );
          })}

          {error && messages.length > 0 ? (
            <li
              role="alert"
              className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-destructive"
            >
              <AlertCircle className="size-3" />
              {t("sendFailed")}
            </li>
          ) : null}

          <div ref={bottomRef} />
        </ul>

        <div className="sticky bottom-0 border-t border-border bg-background/95 px-3 pt-2 backdrop-blur md:px-5 xl:px-7">
          {blocked ? (
            // Blocking is reversible from here rather than only from the menu:
            // if the member blocked by mistake, an inert composer with no way
            // back would be a dead end.
            <div className="flex items-center justify-between gap-3 py-1">
              <p className="text-xs text-muted-foreground">
                {tm("blockedNotice")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full"
                onClick={() => void unblock()}
              >
                {tm("unblock")}
              </Button>
            </div>
          ) : (
            <ChatComposer
              onSend={(text) => void send(text)}
              disabled={!chatId || !viewerId}
            />
          )}
        </div>
      </div>
    </>
  );
}
