# 数据库（自建 PostgreSQL）

这里放着 loono5 的**权威**库结构定义。应用代码不再读任何 mock 常量，
所有会员、会话、消息、套餐、代理商流水都从这张库里查。

> 如果你第一次接触 PostgreSQL，先看本文末尾的[「名词速查」](#名词速查)一节，
> 那里的「实例 / 数据库 / 模式 / 表」和「从节点」是本项目里反复出现的概念。

---

## 1. 目录结构

```
db/
└── migrations/
    ├── 0001_core.sql            # 会员、档案、条件、徽章、套餐、订阅、推广码、代理商、打款
    ├── 0002_chat.sql            # 会话、消息、可见性（隐藏）、拉黑、举报 + 4 个业务触发器
    ├── 0003_partner.sql         # 合作方花名册、日度流水、活动 + partner_roster 视图
    ├── 0004_ledger.sql          # 只增不改的付款账本 + agent_earnings / agent_payout_totals 视图
    ├── 0005_auth.sql            # 注册登录：users 补 email 通道 + verification_codes 表
    ├── 0006_password.sql        # users 补 password_hash / password_updated_at
    ├── 0007_profile_extras.sql  # profile_attributes 补 weight_kg
    └── 0008_attributes_move.sql # 删掉 profile_attributes 里重复的 country_code / city
```

配套脚本在项目根的 `scripts/`：

| 脚本 | 作用 |
| --- | --- |
| `load-env.mjs` | 极简 `.env` 读取器（不引 dotenv），被下面两个脚本共用 |
| `migrate.mjs` | 按文件名顺序执行 `db/migrations/*.sql`，每条迁移**各自包在一个事务里**；已执行过的记录在 `public._migrations` 表里，重复运行是安全的 |
| `seed.mjs` | 幂等灌入演示数据（`on conflict do update`）；加 `--reset` 先清空再灌 |

---

## 2. 第一次跑起来

前提：PC 上的 PostgreSQL 已经在跑（见 `pg/docker-compose.yml`），
并且 Mac 能访问到它 —— 判断方法是浏览器打开 `http://192.168.31.37:8081/`
（pgweb 界面）能看到库。

```bash
# ① 装依赖（沙箱里装不了，必须在你自己机器上执行）
npm install

# ② 配置连接串
cp .env.example .env.local
# 编辑 .env.local，把「改我」换成 pg/.env 里的 POSTGRES_PASSWORD
#   DATABASE_URL=postgresql://loono:<密码>@192.168.31.37:5432/loono

# ③ 建表
npm run db:migrate

# ④ 灌演示数据
npm run db:seed

# ⑤ 起服务
npm run dev
```

其它命令：

```bash
npm run db:reset    # 清空 + 重灌（改完 seed 想从头看效果时用）
npm run db:status   # 干跑一遍迁移，只报告「还剩哪些没执行」，不改库
```

---

## 3. 库结构总览

### 3.1 身份与会员（`0001_core.sql`）

| 表 | 说明 |
| --- | --- |
| `users` | **登录身份**，放 `phone` / `email` / `password_hash` / `created_at` / `last_seen_at` / `phone_verified_at` / `email_verified_at` / `password_updated_at`。两个标识各自唯一、都允许为空（单通道账号合法）。**故意与 `profiles` 分开**：一个自然人将来可以既有一个会员档案、又有一个合作方账号，两者共用一份凭证；而目录里的展示型会员（Mei、Sofia）**只有 profile 没有 user** |
| `profiles` | 会员/机构档案主表。核心字段 `handle`（对外短 ID，如 `u_0042`）、`display_name`（**存真实姓名**，见 3.8）、`birth_date`、`city`、`country_code`、`bio`、`interests`、`level`、`kyc_status`、`photo_urls`、`avatar_url`、`ref_code`、`referred_by` |
| `profile_attributes` | P1 扩展属性：身高、**体重**、学历、语言、宗教、纹身、吸烟、饮酒、资产区间、子女、婚况、职业。**不含居住地** —— 那两列在 0008 里删掉了，居住地只在 `profiles` 上 |
| `partner_preferences` | 征友条件：年龄/身高区间、学历/语言/宗教偏好、资产下限、意向国家城市等 |
| `verification_badges` | 认证徽章，一个会员一行一个 `code`，带 `status` 与有效期 |
| `plans` | 4 个付费档位与价格。**价格进库而不是写死在代码里**，运营调价是一次 `UPDATE`，不是一次发版 |
| `subscriptions` | 订阅记录。用**部分唯一索引** `subscriptions_current_key` 保证一个会员最多只有一条「进行中」的订阅 |
| `promo_codes` | 推广码（如 30 天 L1 试用码） |
| `agents` | 代理商自身档案（佣金率、上级） |
| `payouts` | 打款记录 |

关键设计：

- **`profiles.kind`** 取值为 `member` / `agency` / `referral_stub` / `system`。
  B2C 目录页的查询里写死了 `where kind = 'member'` —— 「主站界面不得出现代理机构」
  这条产品约束**落在查询层**，不靠组件自觉。
- **不存 `age` 存 `birth_date`**。年龄会随时间漂移，读的时候用
  `date_part('year', age(birth_date))` 现算，永远不会过期。
- `ref_code` 由触发器生成，且**不可修改**（`profiles_ref_code_is_immutable`）：
  一旦有人用这个码注册过，改码就会让归属记录对不上。

### 3.2 会话与消息（`0002_chat.sql`）

表：`chats`、`messages`、`chat_visibility`（每个用户各自「删除对话」，是软隐藏而不是真删）、
`user_blocks`（拉黑）、`user_reports`（举报）。

四个业务触发器，把规则写在库里而不是散在应用代码里：

| 触发器 | 作用 |
| --- | --- |
| `messages_touch_chat` | 新消息写入时更新所属会话的 `last_message_at` / 预览，省掉一次应用层 UPDATE |
| `messages_refresh_unread` | 未读数重算。**语句级 + transition table**，一条 SQL 插 100 行也只触发一次 |
| `messages_restore_visibility` | 对方发来新消息时，把被自己隐藏的会话自动恢复显示 |
| `messages_assert_not_blocked` | 被拉黑的人往对方发消息时**主动 `raise exception`（SQLSTATE 42501）**，而不是静默丢弃 |

`is_chat_member(chat, profile)` 是个辅助函数，所有权限判断都走它，
避免「有的地方比较 `owner_id`、有的地方比较 `member_ids`」这种漂移。

### 3.3 合作方数据（`0003_partner.sql`）

`partners`（花名册）、`partner_daily_records`（日报：新增会员、佣金、活跃数）、
`partner_activities`（活动记录，标题是多语言 `jsonb`），加一个把三者拼平的视图 `partner_roster`。

### 3.4 付款账本（`0004_ledger.sql`）

`member_payments` 是**只增不改**的账本：`member_payments_immutable` 触发器会拦住任何
`UPDATE` / `DELETE`。

这不是洁癖，是因为佣金是按比例算的 —— 如果历史付款行可以被改写，
那么「代理商上月拿到的佣金」就成了一个可以事后被篡改的数字。
正确做法是：调佣率只影响**之后新增**的行，历史行原样保留，余额靠回放算出来。

视图 `agent_earnings`（按代理商汇总）和 `agent_payout_totals`（已打款合计）就是这套回放。

### 3.5 注册与登录（`0005_auth.sql`）

注册页支持**手机号或邮箱二选一**，两条通道在库里是这样落地的：

| 表 / 列 | 说明 |
| --- | --- |
| `users.phone` | 手机号，唯一、可空。存**归一化后**的值（去掉空格/横线/括号） |
| `users.email` | 邮箱，唯一索引 `users_email_key`、可空。存**小写**形式 |
| `users.phone_verified_at` / `email_verified_at` | 「验证通过」与「有这个标识」分开记。将来做改绑时，新标识先写入、验证通过才盖时间戳 |
| `verification_codes` | 一次性验证码：`channel`（sms/email）、`destination`、`code`、`purpose`（signup/signin）、`expires_at`、`consumed_at` |

三个关键点：

- **两个标识各自唯一，但都允许为空。** 于是「一个手机号一个账号、一个邮箱一个账号」
  由数据库兜底，「一个账号可以只有手机号或只有邮箱」也成立。
  注意 PostgreSQL 的唯一约束**不约束 NULL**，所以多行 `email is null` 不会互相冲突 ——
  这正是单通道账号能存在的前提。
- **归一化必须在应用层做**（`src/lib/auth/identifier.ts`）。
  库里存的是 `member@example.com`，如果有人拿 `MEMBER@example.com` 来注册，
  唯一索引会认为这是**另一个**邮箱 —— 因为它确实是另一个字符串。
  这件事已用真实数据验证过（见第 5 节末尾）。
- **`purpose` 把注册码和登录码隔开。** 在注册页拿到的码不能拿去登录另一个账号，
  校验 SQL 里 `purpose` 是 where 条件的一部分。

验证码是**一条 SQL 完成"找到并置位"**的，而不是先 `select` 再 `update`：

```sql
update public.verification_codes
   set consumed_at = now()
 where id = (
   select id from public.verification_codes
    where channel = $1 and destination = $2 and purpose = $3
      and code = $4 and consumed_at is null and expires_at > now()
    order by created_at desc limit 1
 )
returning id
```

拆成两步会有竞态：两个人同时提交同一个码，两边都查到"未消费"，于是都能通过。
把条件写进 `update` 的 `where` 里，让数据库来保证只有一个赢家。

> ⚠️ **原型阶段的权宜**：`verification_codes.code` 目前是**明文**，并且会直接回显在页面上。
> 因为本机没有短信网关也没有邮件服务，不回显就没法登录。
> 上线前必须改成加盐哈希 + 真实发送通道（表注释里也写了这条）。

### 3.6 密码（`0006_password.sql`）

注册时除了验证码，还会**设置登录密码**；登录页可以在「验证码登录」与「密码登录」之间切。
库里只加两列：

| 列 | 说明 |
| --- | --- |
| `users.password_hash` | scrypt 哈希串，格式 `scrypt$N$r$p$salt$hash`。**可空** |
| `users.password_updated_at` | 最后一次设置密码的时间，供将来做「改密后踢掉其它会话」与安全审计 |

三点设计取舍：

- **密码可空。** 0006 之前用验证码注册的账号（以及全部种子会员）没有密码，
  改成 `not null` 会让它们全部无法登录。代码把「没有密码」当作一种合法状态：
  密码登录时明确提示「该账号还没有设置密码，请改用验证码登录」，
  而不是含糊地说密码错误 —— 后者会让用户一遍遍重试一个根本不存在的东西。
- **不存盐列、不存算法版本列。** 两者都写在哈希串里（`scrypt$16384$8$1$<salt>$<hash>`）。
  单列自描述的好处是：将来调参或换算法时老串照样能验，
  也不会出现「盐在、哈希被清空」这种拦不住的坏状态。
- **为什么是 scrypt 而不是 bcrypt/argon2。** bcrypt 有 72 字节截断的坑且需要原生编译，
  而这个项目在 Jenkins 里构建镜像，多一个原生依赖就多一处可能编不过的地方；
  argon2 是首选但 Node 没有内置。scrypt 是内存硬的、`node:crypto` 自带，
  参数 16384/8/1 落在 OWASP 对交互式登录的建议区间内。

规则（长度、字母+数字、不得与手机号/邮箱互为子串）在 `src/lib/auth/password.ts`，
是**纯函数**：注册表单用它做即时提示，服务端用同一个函数做最终把关，
两端不存在"前端说没问题、后端说太弱"的分裂。

> 密码规则里有个容易踩的次序问题：条目顺序是「长度 → 复杂度 → 与标识的相关性」。
> 所以纯数字的密码永远先被 `tooSimple` 挡下，而"密码是标识的一部分"这一条
> 只在邮箱这类含字母的标识上才可达 —— 写测试用例时要按真实可达的形状来写。

### 3.7 照片（文件系统，不在库里）

`profiles.photo_urls`（`text[]`）与 `profiles.avatar_url` 在 0001 里就有，
0007 之后**第一次真正被写入**：注册第一步的照片上传会落盘并写进这两列。

- **照片本身不进数据库**，只存 URL。库里塞二进制会让备份体积、复制流量和
  `select *` 的代价全部失控，而且图片本来就走不到事务语义。
- 落盘目录由 `UPLOAD_DIR` 决定，默认 `<项目根>/var/uploads`（已加进 `.gitignore`）。
  **生产必须指向数据卷**：容器重建会换掉项目目录，写在那里的照片会一起消失。
- 文件名由服务端生成（`uuid + 按文件头判定的扩展名`），
  永不采用客户端传来的名字 —— `../../.env` 是路径穿越最经典的载体。
- 类型按**文件头**判定，不信 `Content-Type`：后者是客户端可控的字符串，
  把 `.html` 改名成 `.jpg` 就能骗过它。
- 因此后续换到对象存储时，`profiles.photo_urls` 里的值会从
  `/api/uploads/<uuid>.jpg` 变成签名 URL 或对象 key，表结构不用动。

### 3.8 居住地与姓名归属（`0008_attributes_move.sql`）

这一条对应 2026-10-16 那次表单重排：注册第一步改采「国家 → 城市」两级下拉、
昵称改采真实姓名、兴趣与自我介绍从第一步挪到第二步。库这边只做了一件事 ——
**删掉 `profile_attributes.country_code` / `city`**，另有几条 `comment on column`。

为什么要删：这两列与 `profiles` 上的同名两列**完全重复**，而读取逻辑写的是
"属性表优先、主表兜底"：

```sql
-- 改动前（lib/db/members.ts 的 toProfile）
coalesce(attr_country_code, country_code, '')
```

问题出在属性表的列是 `not null default ''` —— 会员只要保存过一次第二步而没填
居住地，属性表里躺的就是**空串**。空串不是 `NULL`，`??` 不会回退，
于是主表里填得好好的居住地在页面上变成空白。这类"两个地方存同一个事实"
的结构，早晚会以这种方式出问题。

删列前已核对过实际数据：7 行属性记录里，两处取值**全部一致**，
所以删除不丢任何信息（见第 5 节末尾的验证记录）。

现在的归属关系：

| 字段 | 住在哪 | 谁写 | 说明 |
| --- | --- | --- | --- |
| `country_code` / `city` | `profiles` | 注册第一步（`saveProfileBasics`） | 全站唯一来源。第二步**不碰**这两列 |
| `display_name` | `profiles` | 注册第一步 | 现在存**真实姓名**，不再是昵称 |
| `interests` / `bio` | `profiles` | 注册第二步（`saveProfileAttributes`） | 列本来就在，本轮只是把填写位置挪到了第二步 |
| 身高/体重/学历等 13 项 | `profile_attributes` | 注册第二步 | 与 `interests` / `bio` 在**同一个事务**里写 |

> ⚠️ 搬家最容易踩的坑：一个字段从第一步挪到第二步之后，
> 若第一步的写入函数还带着那一列，那么会员每次重填第一步都会把
> 第二步的内容清成空 —— 而第一步的表单里已经没有那个字段，
> `formData` 取到的只能是空。`saveProfileBasics` 因此显式不再写
> `interests` / `bio`（代码里有注释，测试里有专门的回归用例）。

**城市的值是语言中立的拉丁专名**（`Shanghai`、`Saint Petersburg`），
取自 `src/lib/geo.ts` 的 `COUNTRY_CITIES`。不按界面语言翻译，因为
`profiles.city` 会被目录卡片、会员详情、落地页地区栏**直接渲染**（五处），
存成"当前语言的名字"会让同一个人的城市随界面语言变化，
同一个人在中俄两种界面下变成两条不同记录，按城市筛选就会漏人。

`city` 是裸 `text`（没有外键也没有 check），所以**服务端必须自己验**：
`lib/profile/actions.ts` 里国家与城市是成对校验的 ——
只验"国家在列表里"不够，否则可以提交 `countryCode=GB&city=Shanghai`，
入库后按国家筛会员会以"在英国、城市上海"的形态出现。

---

## 4. 常用 SQL（可以直接粘到 pgweb 里）

```sql
-- 有多少会员、几个代理
select kind, count(*) from public.profiles group by kind order by 2 desc;

-- 目录页会显示哪些人（注意 kind 过滤）
select handle, display_name, city, level from public.profiles
 where kind = 'member' and handle <> 'u_current' order by handle;

-- 档位与价格
select level, price_monthly, price_yearly, currency from public.plans order by sort_order;

-- 一个会话的消息数
select c.slug, count(m.id) from public.chats c
  left join public.messages m on m.chat_id = c.id
 group by c.slug order by 2 desc;

-- 每个代理商的累计佣金
select * from public.agent_earnings order by total_commission desc;

-- 谁真的注册过（有登录身份的人；目录里的展示型会员不在这张表里）
select u.phone, u.email, p.handle, p.display_name
  from public.users u
  left join public.profiles p on p.user_id = u.id
 order by u.created_at desc;

-- 谁设过密码（password_hash 非空），谁只能走验证码
select phone, email,
       case when password_hash is null then '仅验证码' else '有密码' end as login_mode,
       password_updated_at
  from public.users order by created_at desc;

-- 会员的身高体重（0007 之后才有）
select p.display_name, a.height_cm, a.weight_kg
  from public.profiles p
  join public.profile_attributes a on a.profile_id = p.id
 where a.height_cm is not null order by p.handle;

-- 谁传了照片、几张
select handle, display_name, coalesce(array_length(photo_urls, 1), 0) as photos
  from public.profiles where kind = 'member' order by photos desc;

-- 居住地与兴趣（居住地只在 profiles 上，兴趣与自我介绍也在 profiles 上）
select handle, display_name, country_code, city, interests, bio
  from public.profiles where kind = 'member' order by handle;

-- 按国家统计会员（城市值取自 lib/geo.ts 的城市表；出现表外城市即为脏数据）
select country_code, city, count(*) from public.profiles
 where kind = 'member' group by country_code, city order by 3 desc;

-- 属性表里不该再有居住地列（0008 之后应为空结果）
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'profile_attributes'
   and column_name in ('country_code', 'city');

-- 兴趣与自我介绍填了没有（这两项也计入资料完整度）
select handle, coalesce(array_length(interests, 1), 0) as interests,
       length(coalesce(bio, '')) as bio_len
  from public.profiles where kind = 'member' order by interests desc;

-- 最近的验证码（原型阶段是明文，方便调试；上线前这里会变成哈希）
select channel, destination, code, purpose, consumed_at, expires_at
  from public.verification_codes
 order by created_at desc limit 10;

-- 已经执行过哪些迁移
select * from public._migrations order by applied_at;
```

---

## 5. 设计取舍（为什么是这样）

1. **不用 RLS，也不用 Supabase。**
   原来的 `supabase/migrations/*.sql` 依赖 `auth.users`、`auth.uid()` 和 RLS 策略，
   这些是 Supabase 平台自带的东西，标准 PostgreSQL 里没有。
   现在身份由应用层（`src/lib/db/viewer.ts`）解析后显式传给查询，
   权限判断集中在数据层的几个函数里，比把逻辑散在几十条策略里更好审计。

2. **不引 ORM。**
   直接写 SQL，用 `pg` 驱动。原因是这套 schema 里有大量触发器、部分唯一索引、
   带 `lateral` 的聚合查询 —— 用 ORM 表达这些反而更长、更绕，而且出问题时
   很难看出最终发到数据库的到底是什么语句。

3. **可分区驻留。**
   同一套 `db/migrations` 将来在哈萨克斯坦与境外各跑一个**主库**，
   按数据主体属地把会员分过去，区域之间用逻辑复制 + 行过滤同步必要子集。
   所以这里刻意**没有**用任何专有扩展或平台特性 —— 换供应商时只需迁数据。

4. **同一个事实只存一处。**
   0008 删掉属性表里重复的居住地两列，就是这条原则的一次纠偏。
   重复存储本身不会立刻出错，但它会让"以哪一列为准"变成一个需要读代码
   才能回答的问题，而每个读代码的人给出的答案都可能不同。
   代价（一次删列迁移）远小于收益（不必再推理谁覆盖谁）。

### 验证记录（0008 这次改动实际跑过的）

改动不是"看着对"，而是在真实库上跑过：

| 项 | 结果 |
| --- | --- |
| 迁移应用 | `0008` 已 applied；`db:seed` 复跑幂等（14 profiles / 54 payments / 1529 ledger days 不变） |
| 删列是否丢数据 | 删前核对 7 行属性记录，`profiles` 与 `profile_attributes` 两处取值**全部一致** |
| 端到端往返 | 112 → 149 项断言全通过：建临时档案 → 第一步写居住地 → 第二步写属性+兴趣+自我介绍 → 读回比对 → 清理 |
| 关键回归 | 第一步提交后 `interests` / `bio` **未被清空**；第二步提交后居住地**未被改动** |
| 列已删 | `information_schema` 查不到属性表的 `country_code` / `city`，`occupation` / `weight_kg` 仍在 |
| 清理 | 临时档案与属性行级联删除已核实，种子会员未受影响 |

---

## 6. 迁移文件的写法约定

- 文件名 `NNNN_名字.sql`，`NNNN` 四位递增数字，按字符串排序即执行顺序。
- **每条迁移自己开事务**（`migrate.mjs` 用 `begin` / `commit` 包住），
  要么整条成功要么整条回滚，不会留下半张表。
- 迁移一旦提交就不再修改。要改结构就**新增**一条（如 `0009_xxx.sql`），
  否则已经在别的机器上跑过的库和新库会不一致。
- 里面不写 `drop table`。演示数据要重来用 `npm run db:reset`，
  结构要重来则手工删库重建（见下一节）。
- **删列可以，但要写清楚为什么、以及数据为什么不丢。**
  `drop column` 是不可逆的，所以它必须附带证据：0008 之前的核对结果是
  "两处取值全部一致"，这句话就写在迁移文件的注释里。
  反过来，如果被删的列**有**独立信息（比如只有属性表里有值），
  那就得先做数据搬迁、再删列，分两次迁移走。
- 迁移里的每条语句都要能重复执行。加列用 `add column if not exists`，
  删列用 `drop column if exists`，`comment on column` 本身幂等。

需要**从零重建**（比如 schema 改乱了想推倒重来）：

```bash
# 在 PC 上执行；会删掉 loono 库里的所有数据
docker compose -f pg/docker-compose.yml exec postgres \
  psql -U loono -d postgres -c 'drop database loono;' -c 'create database loono;'

# 回到 Mac
npm run db:migrate && npm run db:seed
```

---

## 名词速查

刚接触 PostgreSQL 时最容易混的是这几个词：

| 词 | 类似物 | 说明 |
| --- | --- | --- |
| **实例（instance / cluster）** | 一台 MySQL 服务进程 | 一个跑在 5432 端口上的 `postgres` 服务。它下面可以有多个数据库 |
| **数据库（database）** | MySQL 的 database | 本项目叫 `loono`。跨数据库不能直接 join |
| **模式（schema）** | MySQL 里没有对应物 | 数据库内部的命名空间。本项目所有表都放在 `public` 模式下，所以全名是 `public.profiles` |
| **表（table）** | 一样 | 就是表 |
| **WAL** | MySQL 的 redo log | 预写日志，先写日志再改数据。崩溃恢复靠它，主从复制也靠它 |
| **主库 / 从库（primary / replica）** | MySQL 主从 | 主库可读写，从库只读、从主库同步数据 |
| **逻辑复制** | MySQL 的 binlog 复制 | 按「行」复制，可以选择只同步部分表、部分行。本项目跨区域同步用的就是它 |

一句话总结本项目的形态：**每个有硬性本地化要求的国家跑一个自己的主库，
彼此之间只同步必要的一小部分数据**，而不是全球一个大库。
