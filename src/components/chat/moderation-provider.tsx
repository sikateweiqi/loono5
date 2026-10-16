"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { blockUser, isBlocked, unblockUser } from "@/lib/chat-client";

/**
 * Blocking state for the conversation currently on screen.
 *
 * The `...` menu lives in the page header and the composer lives in the thread
 * body — two different components, one server-rendered, one client. They both
 * need to agree that this person is blocked, so the state is lifted here rather
 * than passed as a prop chain through the server component boundary.
 *
 * The database is the authority: `assert_not_blocked` rejects a message from a
 * blocked pair regardless of what this thinks. This exists so the UI can stop
 * offering to send, not to decide whether sending is allowed.
 */

export type ModerationStatus =
  "checking" | "allowed" | "blocked" | "unavailable";

interface ModerationState {
  status: ModerationStatus;
  block: () => Promise<void>;
  unblock: () => Promise<void>;
  /** False while the composer should be inert. */
  canSend: boolean;
}

const ModerationContext = createContext<ModerationState | null>(null);

export function ModerationProvider({
  peerId,
  children,
}: {
  /** Null when the peer has no profile row yet (see `seed.sql`). */
  peerId: string | null;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<ModerationStatus>("checking");

  useEffect(() => {
    // Without a profile there is nothing to block, and offering the action
    // would fail at the database. Say so instead of pretending.
    if (!peerId) {
      setStatus("unavailable");
      return;
    }

    let active = true;
    setStatus("checking");

    isBlocked(peerId)
      .then((blocked) => {
        if (active) setStatus(blocked ? "blocked" : "allowed");
      })
      .catch(() => {
        if (active) setStatus("allowed");
      });

    return () => {
      active = false;
    };
  }, [peerId]);

  const block = useCallback(async () => {
    if (!peerId) return;
    await blockUser(peerId);
    setStatus("blocked");
  }, [peerId]);

  const unblock = useCallback(async () => {
    if (!peerId) return;
    await unblockUser(peerId);
    setStatus("allowed");
  }, [peerId]);

  const value = useMemo<ModerationState>(
    () => ({ status, block, unblock, canSend: status === "allowed" }),
    [status, block, unblock],
  );

  return (
    <ModerationContext.Provider value={value}>
      {children}
    </ModerationContext.Provider>
  );
}

export function useModeration(): ModerationState {
  const context = useContext(ModerationContext);

  // Rendered outside the provider: never block, never offer the action.
  return {
    status: "unavailable",
    block: async () => {},
    unblock: async () => {},
    canSend: true,
    ...context,
  };
}
