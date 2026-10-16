"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ModerationProvider } from "@/components/chat/moderation-provider";
import {
  ensureChatThread,
  ensureViewerProfile,
  type PeerDisplay,
} from "@/lib/chat-client";

/**
 * Resolves the conversation once for everything on this screen.
 *
 * The header menu and the thread body are separate components either side of a
 * server/client boundary, and both need the same thing: the `chats` row's uuid.
 * The header needs it to hide the thread, the body needs it to read and write
 * messages, and the slug in the URL is not it.
 *
 * Resolving here rather than in each keeps this to one lookup and one upsert
 * per open — the upsert writes on every call, so two callers would mean two
 * writes for no benefit.
 */

interface ThreadContextValue {
  /** The `chats` row uuid, or null until resolved. */
  chatId: string | null;
  /** The viewer's `profiles` row uuid. */
  viewerProfileId: string | null;
  peerId: string | null;
  peerName: string;
  ready: boolean;
}

const ThreadContext = createContext<ThreadContextValue>({
  chatId: null,
  viewerProfileId: null,
  peerId: null,
  peerName: "",
  ready: false,
});

export function ThreadModeration({
  slug,
  peer,
  peerId,
  children,
}: {
  slug: string;
  peer: PeerDisplay;
  /** The peer's profile id when they have one; null for an unseeded peer. */
  peerId: string | null;
  children: ReactNode;
}) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolve() {
      try {
        // The viewer comes from the session cookie, so nothing is passed in:
        // the profile row exists by the time this screen is reachable.
        const profile = await ensureViewerProfile();
        const chat = await ensureChatThread({ slug, peer, peerId });

        if (!active) return;

        setViewerProfileId(profile.id);
        setChatId(chat.id);
      } catch {
        // The thread body surfaces the real failure with a retry; there is
        // nothing useful to do here, and an error here would only blank the
        // header menu.
      } finally {
        if (active) setReady(true);
      }
    }

    void resolve();

    return () => {
      active = false;
    };
    // `peer` is a literal from the server component; depending on it would
    // re-resolve on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const value = useMemo<ThreadContextValue>(
    () => ({ chatId, viewerProfileId, peerId, peerName: peer.name, ready }),
    [chatId, viewerProfileId, peerId, peer.name, ready],
  );

  return (
    <ModerationProvider peerId={peerId}>
      <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
    </ModerationProvider>
  );
}

export function useThreadContext(): ThreadContextValue {
  return useContext(ThreadContext);
}
