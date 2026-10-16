-- LOONO — 0002 chat：会话、消息、成员可见性、拉黑、举报。
--
-- 移植自 `supabase/migrations/0001/0003/0004/0005`，去掉 RLS 与角色授权，
-- 保留全部业务触发器（它们与 Supabase 无关，且承担真实不变量）。
--
-- 权限模型的变化
-- --------------
-- Supabase 版靠 RLS + `auth.uid()` 把权限下沉到数据库；现在浏览器不再直连库，
-- 所有读写都经 Next.js 服务端（server actions / route handlers），
-- 因此**鉴权必须在应用层做**——见 `src/lib/db/chat.ts` 与 `src/lib/db/moderation.ts`：
-- 每个写操作都会先确认调用者确实是该会话成员。
-- `is_chat_member()` 保留下来，因为应用层的校验也复用它，避免两处逻辑漂移。

/* ────────────────────────────────── chats ───────────────────────────────── */

/*
  一次会话一行，双方共用。`member_ids` 保存两位 profile id，而不是 user_a/user_b
  两列 —— 那需要两行或者一条排序规则来表达"一件事"。

  `slug` 是**观察者相对**的：`c_01` 的含义是"Mei ↔ 当前这个人"，
  所以唯一性必须是 `(slug, owner_id)`（移植自 0003 的修复）。
*/
create table if not exists public.chats (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null,
  owner_id         uuid references public.profiles (id) on delete cascade,
  member_ids       uuid[] not null default '{}',
  peer_id          uuid references public.profiles (id) on delete set null,
  -- 冗余的对方展示字段，让会话列表不需要 join。允许陈旧：它们只用于展示。
  peer_name        text,
  peer_avatar_url  text,
  peer_level       smallint,
  peer_is_online   boolean not null default false,
  last_message_text text,
  last_message_at  timestamptz,
  unread_count     integer not null default 0,
  created_at       timestamptz not null default now()
);

create unique index if not exists chats_slug_owner_key
  on public.chats (slug, owner_id);

create index if not exists chats_member_ids_idx
  on public.chats using gin (member_ids);

-- 会话列表按最近活动排序。
create index if not exists chats_last_message_idx
  on public.chats (owner_id, last_message_at desc nulls last);

/* ──────────────────────────────── messages ──────────────────────────────── */

create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  chat_id           uuid not null references public.chats (id) on delete cascade,
  sender_id         uuid not null references public.profiles (id) on delete cascade,
  -- 原文永远不被就地覆盖：翻译写在 translated_* 两列，读者按需取自己语言（PRD 规则 4）。
  body              text not null check (length(btrim(body)) between 1 and 4000),
  original_locale   text not null default 'en',
  translated_body   text,
  translated_locale text,
  is_translating    boolean not null default false,
  is_read           boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists messages_chat_created_idx
  on public.messages (chat_id, created_at);

-- 未读计数只查 is_read = false，用部分索引保持小而快。
create index if not exists messages_unread_idx
  on public.messages (chat_id)
  where is_read = false;

/* ─────────────────── chat_visibility / blocks / reports ─────────────────── */

-- 软删除，按成员维度：一行表示"这位成员把这个会话从列表里移除了"。
create table if not exists public.chat_visibility (
  chat_id   uuid not null references public.chats (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists chat_visibility_user_idx
  on public.chat_visibility (user_id);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.user_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason      text not null
              check (reason in ('spam', 'harassment', 'inappropriate_content', 'other')),
  details     text check (details is null or length(details) <= 2000),
  created_at  timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index if not exists user_reports_created_idx
  on public.user_reports (created_at desc);
create index if not exists user_reports_reported_idx
  on public.user_reports (reported_id);

/* ───────────────────────────── 业务触发器 ──────────────────────────────── */

-- 成员关系判定：应用层与触发器共用同一份逻辑，避免两处判断漂移。
create or replace function public.is_chat_member(target_chat uuid, target_profile uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.chats c
     where c.id = target_chat
       and target_profile = any (c.member_ids)
  );
$$;

/*
  新消息 → 更新会话的预览、时间与未读徽标。
  未读只对"对方发来的"自增；自己发的不算。
*/
create or replace function public.touch_chat_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.chats
     set last_message_at   = new.created_at,
         last_message_text = new.body,
         unread_count      = case
           when new.sender_id = owner_id then unread_count
           else unread_count + 1
         end
   where id = new.chat_id;

  return new;
end;
$$;

drop trigger if exists messages_touch_chat on public.messages;

create trigger messages_touch_chat
  after insert on public.messages
  for each row
  execute function public.touch_chat_on_message();

/*
  标记已读会一次性翻掉整个会话的消息，所以这里用**语句级**触发器 + 转移表，
  重算一次而不是每行减一：既便宜，也不可能与行数据漂移。
*/
create or replace function public.refresh_chat_unread_counts()
returns trigger
language plpgsql
as $$
begin
  update public.chats c
     set unread_count = (
           select count(*)
             from public.messages m
            where m.chat_id = c.id
              and m.is_read = false
         )
   where c.id in (select distinct chat_id from updated_rows);

  return null;
end;
$$;

drop trigger if exists messages_refresh_unread on public.messages;

create trigger messages_refresh_unread
  after update on public.messages
  referencing new table as updated_rows
  for each statement
  execute function public.refresh_chat_unread_counts();

/*
  被隐藏的会话收到新消息就重新出现。
  删除行而不是加"已恢复"标记，让这张表始终是"当前隐藏了什么"的单一事实。
*/
create or replace function public.restore_hidden_chats()
returns trigger
language plpgsql
as $$
begin
  delete from public.chat_visibility where chat_id = new.chat_id;

  return new;
end;
$$;

drop trigger if exists messages_restore_visibility on public.messages;

create trigger messages_restore_visibility
  after insert on public.messages
  for each row
  execute function public.restore_hidden_chats();

/*
  拉黑在写入路径上生效，而不只是 UI 层：双向拦截——拉黑者自己也发不出去，
  这是成员的直觉预期，尽管库里只有一行。
*/
create or replace function public.assert_not_blocked()
returns trigger
language plpgsql
as $$
declare
  recipient uuid;
begin
  select c.owner_id into recipient from public.chats c where c.id = new.chat_id;

  if recipient is null then
    return new;
  end if;

  if exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = new.sender_id and b.blocked_id = recipient)
        or (b.blocker_id = recipient and b.blocked_id = new.sender_id)
  ) then
    raise exception 'cannot send: this conversation is blocked'
      using errcode = '42501',
            hint = 'sender and recipient have blocked each other';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_assert_not_blocked on public.messages;

create trigger messages_assert_not_blocked
  before insert on public.messages
  for each row
  execute function public.assert_not_blocked();
