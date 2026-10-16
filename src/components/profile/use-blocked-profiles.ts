"use client";

import { useEffect, useState } from "react";

import { listBlockedProfileIds } from "@/lib/chat-client";

/**
 * The set of profile ids this member has blocked.
 *
 * Null means "not known yet", which callers must handle differently from an
 * empty set: rendering the unfiltered list immediately is better than flashing
 * an empty grid while a round trip is in flight.
 *
 * Kept as a hook rather than a wrapper component on purpose. An earlier version
 * was a `<BlockedFilter>` wrapper taking a `children` render prop, which cannot
 * work from a Server Component: a function cannot cross the RSC boundary, and
 * passing one makes the whole route throw at render time. Anything that has to
 * react to browser-only state has to be a client component in its own right.
 */
export function useBlockedProfiles(): Set<string> | null {
  const [blocked, setBlocked] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;

    listBlockedProfileIds()
      .then((ids) => {
        if (active) setBlocked(new Set(ids));
      })
      .catch(() => {
        // An unreadable block list must not empty the feed.
        if (active) setBlocked(new Set());
      });

    return () => {
      active = false;
    };
  }, []);

  return blocked;
}
