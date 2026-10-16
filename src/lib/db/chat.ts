import "server-only";

import { query, queryOne, transaction } from "@/lib/db/pool";
import type { ChatRow, MessageRow, ReportReason } from "@/lib/db/types";
import type { Message, MessageStatus } from "@/types/chat";

/**
 * 会话与消息的服务端读写。
 *
 * 权限在这里显式做，而不是靠数据库的 RLS —— 自建 PG 之后浏览器不再直连库，
 * 所有调用都经 Next.js 的 route handlers，所以"你只能读自己的会话"
 * 必须在每个函数入口自己确认（`assertChatMember`）。
 * 这一层的每个写操作都先验成员身份，任何一处漏掉都等于把私信摊开。
 *
 * 与 Supabase 版的对应关系见文件底部注释：那里是浏览器直连 + RLS，
 * 这里是服务端 + 显式校验，行为一致。
 */

export interface PeerDisplay {
  id: string;
  name: string;
  avatarUrl: string | null;
  level: number | null;
  isOnline: boolean;
}

/** 不是该会话成员时抛错；调用方（route handler）转成 403。 */
async function assertChatMember(
  chatId: string,
  profileId: string,
): Promise<void> {
  const row = await queryOne<{ ok: boolean }>(
    "select public.is_chat_member($1, $2) as ok",
    [chatId, profileId],
  );

  if (!row?.ok) {
    throw Object.assign(new Error("not a member of this chat"), {
      status: 403,
    });
  }
}

export function toMessage(row: MessageRow, viewerId: string): Message {
  const status: MessageStatus = row.is_read
    ? "read"
    : row.sender_id === viewerId
      ? "delivered"
      : "sent";

  return {
    id: row.id,
    threadId: row.chat_id,
    senderId: row.sender_id,
    originalText: row.body,
    originalLocale: row.original_locale,
    translatedText: row.translated_body ?? undefined,
    translatedLocale: row.translated_locale ?? undefined,
    isTranslating: row.is_translating || undefined,
    isRead: row.is_read,
    status,
    createdAt: row.created_at.toISOString(),
  };
}

/* ─────────────────────────────── 读取 ─────────────────────────────── */

/**
 * 会话列表：本人拥有的、未被隐藏的会话，按最近活动排序。
 *
 * 已隐藏的会话用 `not exists` 过滤（而不是 join 后过滤），
 * 这样一条 SQL 就能同时给出列表与徽标数，实时刷新时只需重跑一次。
 */
export async function listChats(viewerProfileId: string): Promise<ChatRow[]> {
  return query<ChatRow>(
    `select c.*
       from public.chats c
      where c.owner_id = $1
        and not exists (
          select 1 from public.chat_visibility v
           where v.chat_id = c.id and v.user_id = $1
        )
      order by c.last_message_at desc nulls last, c.created_at desc`,
    [viewerProfileId],
  );
}

export async function fetchThreadMessages(
  chatId: string,
  viewerId: string,
): Promise<Message[]> {
  await assertChatMember(chatId, viewerId);

  const rows = await query<MessageRow>(
    `select * from public.messages
      where chat_id = $1
      order by created_at asc
      limit 500`,
    [chatId],
  );

  return rows.map((row) => toMessage(row, viewerId));
}

/** 取（或创建）会话行。slug 是观察者相对的，所以唯一键是 (slug, owner_id)。 */
export async function ensureChatThread(input: {
  slug: string;
  viewerProfileId: string;
  peer: PeerDisplay;
  peerId?: string | null;
}): Promise<ChatRow> {
  const peerId = input.peerId ?? input.peer.id;

  const row = await queryOne<ChatRow>(
    `insert into public.chats
       (slug, owner_id, member_ids, peer_id, peer_name, peer_avatar_url, peer_level, peer_is_online)
     values ($1, $2, array[$2, $3]::uuid[], $3, $4, $5, $6, $7)
     on conflict (slug, owner_id) do update
       set peer_id = excluded.peer_id,
           peer_name = excluded.peer_name,
           peer_avatar_url = excluded.peer_avatar_url,
           peer_level = excluded.peer_level,
           peer_is_online = excluded.peer_is_online,
           member_ids = excluded.member_ids
     returning *`,
    [
      input.slug,
      input.viewerProfileId,
      peerId,
      input.peer.name,
      input.peer.avatarUrl,
      input.peer.level,
      input.peer.isOnline,
    ],
  );

  return row!;
}

/* ─────────────────────────────── 写入 ─────────────────────────────── */

export async function sendMessage(input: {
  chatId: string;
  senderId: string;
  body: string;
  locale: string;
}): Promise<Message> {
  await assertChatMember(input.chatId, input.senderId);

  const row = await queryOne<MessageRow>(
    `insert into public.messages (chat_id, sender_id, body, original_locale)
     values ($1, $2, $3, $4)
     returning *`,
    [input.chatId, input.senderId, input.body, input.locale],
  );

  return toMessage(row!, input.senderId);
}

/**
 * 标记整个会话已读。
 *
 * 更新语句只碰 `is_read` —— 列级权限在 Supabase 版里靠 GRANT 实现，
 * 直连之后靠这一条语句本身：它不可能改到别人写的正文。
 * 未读计数由 `messages_refresh_unread` 触发器重算，不在这里手算。
 */
export async function markThreadRead(
  chatId: string,
  viewerId: string,
): Promise<void> {
  await assertChatMember(chatId, viewerId);

  await query(
    `update public.messages
        set is_read = true
      where chat_id = $1 and is_read = false`,
    [chatId],
  );
}

/* ─────────────────────────── 可见性 / 拉黑 / 举报 ─────────────────────────── */

/** 从自己的列表里移除会话（软删除，另一边不受影响）。 */
export async function hideChatForUser(
  chatId: string,
  viewerId: string,
): Promise<void> {
  await assertChatMember(chatId, viewerId);

  await query(
    `insert into public.chat_visibility (chat_id, user_id)
     values ($1, $2)
     on conflict (chat_id, user_id) do nothing`,
    [chatId, viewerId],
  );
}

export async function showChatForUser(
  chatId: string,
  viewerId: string,
): Promise<void> {
  await query(
    "delete from public.chat_visibility where chat_id = $1 and user_id = $2",
    [chatId, viewerId],
  );
}

export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await query(
    `insert into public.user_blocks (blocker_id, blocked_id)
     values ($1, $2)
     on conflict (blocker_id, blocked_id) do nothing`,
    [blockerId, blockedId],
  );
}

export async function unblockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await query(
    "delete from public.user_blocks where blocker_id = $1 and blocked_id = $2",
    [blockerId, blockedId],
  );
}

export async function listBlockedProfileIds(
  blockerId: string,
): Promise<string[]> {
  const rows = await query<{ blocked_id: string }>(
    "select blocked_id from public.user_blocks where blocker_id = $1",
    [blockerId],
  );

  return rows.map((row) => row.blocked_id);
}

export async function reportUser(input: {
  reporterId: string;
  reportedId: string;
  reason: ReportReason;
  details?: string | null;
}): Promise<void> {
  await query(
    `insert into public.user_reports (reporter_id, reported_id, reason, details)
     values ($1, $2, $3, $4)`,
    [
      input.reporterId,
      input.reportedId,
      input.reason,
      input.details?.trim() ? input.details.trim() : null,
    ],
  );
}

/**
 * 会话 + 消息的一次性装配：会话列表点进去时需要"先确保会话存在，再取消息"。
 * 放在一个事务里，避免两次往返之间被人插进一条新消息而顺序错乱。
 */
export async function ensureThreadWithMessages(input: {
  slug: string;
  viewerProfileId: string;
  peer: PeerDisplay;
}): Promise<{ chat: ChatRow; messages: Message[] }> {
  return transaction(async (client) => {
    const chatResult = await client.query<ChatRow>(
      `insert into public.chats
         (slug, owner_id, member_ids, peer_id, peer_name, peer_avatar_url, peer_level, peer_is_online)
       values ($1, $2, array[$2, $3]::uuid[], $3, $4, $5, $6, $7)
       on conflict (slug, owner_id) do update
         set peer_id = excluded.peer_id,
             peer_name = excluded.peer_name,
             peer_avatar_url = excluded.peer_avatar_url,
             peer_level = excluded.peer_level,
             peer_is_online = excluded.peer_is_online
       returning *`,
      [
        input.slug,
        input.viewerProfileId,
        input.peer.id,
        input.peer.name,
        input.peer.avatarUrl,
        input.peer.level,
        input.peer.isOnline,
      ],
    );

    const chat = chatResult.rows[0]!;

    const messageResult = await client.query<MessageRow>(
      `select * from public.messages
        where chat_id = $1
        order by created_at asc
        limit 500`,
      [chat.id],
    );

    return {
      chat,
      messages: messageResult.rows.map((row) =>
        toMessage(row, input.viewerProfileId),
      ),
    };
  });
}
