/**
 * 数据库行类型（手写，与 db/migrations/*.sql 一一对应）。
 *
 * 替代原先 `lib/supabase/database.types.ts` 里那套 PostgREST 形状的 `Database` 泛型：
 * 直连 PostgreSQL 后不再有自动生成的 REST 类型，行的形状就是 SQL 查询返回的形状。
 * 字段保持 snake_case，与列名一致，减少一层心智转换；转成界面用的 camelCase
 * 在各自的读取函数里完成（见 lib/db/members.ts 的 toPublicUser）。
 *
 * ⚠️ 这里用 `type X = {...}` 而不是 `interface X {...}`，是有原因的：
 * `pg` 的 `query<T>` 要求 `T extends QueryResultRow`，而 `QueryResultRow` 带索引签名。
 * TypeScript 只给**类型别名**隐式索引签名，`interface` 不会 —— 写成 interface 会得到
 * 「Index signature for type 'string' is missing」。本目录其它行类型同样是 type 别名。
 */

export type ChatRow = {
  id: string;
  slug: string;
  owner_id: string | null;
  member_ids: string[];
  peer_id: string | null;
  peer_name: string | null;
  peer_avatar_url: string | null;
  peer_level: number | null;
  peer_is_online: boolean;
  last_message_text: string | null;
  last_message_at: Date | null;
  unread_count: number;
  created_at: Date;
};

export type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  original_locale: string;
  translated_body: string | null;
  translated_locale: string | null;
  is_translating: boolean;
  is_read: boolean;
  created_at: Date;
};

export type ProfileRow = {
  id: string;
  user_id: string | null;
  handle: string;
  kind: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  is_online: boolean;
  phone: string | null;
  ref_code: string | null;
  referred_by: string | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * 举报理由的封闭集合。
 *
 * 与 `user_reports.reason` 上的 CHECK 约束一一对应：数据库拒绝集合外的值，
 * 所以这个联合类型不可能与库里的允许值漂移。
 */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "inappropriate_content",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
