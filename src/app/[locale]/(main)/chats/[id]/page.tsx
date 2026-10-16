import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { MessageThread } from "@/components/chat/message-thread";
import { ThreadActions } from "@/components/chat/thread-actions";
import { ThreadModeration } from "@/components/chat/thread-moderation";
import { ScreenHeader } from "@/components/layout/screen-header";
import { listChats } from "@/lib/db/chat";
import { getViewerProfile } from "@/lib/db/viewer";

/**
 * The message list is fetched by the client (`MessageThread`) rather than
 * rendered here, so this route must not be prerendered — the shell is enough
 * to build, the history arrives after sign-in resolves.
 */
export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("chats");

  /*
    The conversation comes from the database, looked up among the viewer's own
    threads by slug — the same slug the list links to. There is no mock
    catalogue to fall back on any more, so an unknown slug (or one that was
    hidden from this member's list) is a genuine 404 rather than an empty
    thread.
  */
  const viewer = await getViewerProfile();
  const chats = viewer ? await listChats(viewer.id) : [];
  const chat = chats.find((row) => row.slug === id);

  /*
    `peer_id` has to exist: it is what blocking and reporting act on, and it is
    the only peer identity the client can send. A row without one is a
    conversation nothing can be done with — better a 404 than a thread whose
    menu silently fails on click.
  */
  if (!chat || !chat.peer_id) {
    notFound();
  }

  const peerName = chat.peer_name ?? "";

  return (
    <ThreadModeration
      slug={chat.slug}
      peer={{
        id: chat.peer_id,
        name: peerName,
        avatarUrl: chat.peer_avatar_url,
        level: chat.peer_level,
        isOnline: chat.peer_is_online,
      }}
      peerId={chat.peer_id}
    >
      <ScreenHeader
        backHref="/chats"
        // The rail is always visible from xl up, so the back arrow would
        // only ever lead to the "pick a conversation" placeholder.
        backClassName="xl:hidden"
        title={peerName}
        action={
          <div className="flex items-center gap-1">
            {chat.peer_is_online ? (
              <span className="text-[11px] text-emerald-600">
                {t("online")}
              </span>
            ) : null}
            <ThreadActions />
          </div>
        }
      />

      <MessageThread />
    </ThreadModeration>
  );
}
