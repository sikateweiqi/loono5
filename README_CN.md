# LOONO

> English: [README.md](./README.md)

跨国婚恋交友平台的前端工程。一套代码同时承载两个面向完全不同的站点：

| 站点 | 面向 | 视觉 | 入口 |
| --- | --- | --- | --- |
| **B2C 主站** | 普通会员 | 暖调轻奢浅色 | `loono.com` · 本地 `:3000` |
| **B2B 合作伙伴后台** | 已授权的合作伙伴／运营 | 冷调浅色数据风 | `partner.loono.com` · 本地 `:3001` |

主站**不出现任何代理人／代理机构字样**，底部导航固定为三个核心 Tab（搜索、聊天、个人中心）；对外只说「合伙」（Partners），入口是一个申请表单。合作伙伴后台**仅限账号密码登录**，与主站互不链接。

> 当前仓库是**可用原型**：业务数据已接通 PostgreSQL（自建，非托管），
> 注册与登录也已落库（手机号 / 邮箱双通道 + 一次性验证码，**注册即设密码**，
> 登录可用验证码或密码），照片上传写入本地文件系统并由 `/api/uploads/*` 回读，
> 但仍保留三处模拟能力 —— 会话是**未签名**的 cookie、
> 验证码没有真实发送通道（直接回显在表单上）、实时消息用 4 秒轮询。
> 各模块注释里已标出这三处的替换点。

---

## 技术栈

| 层 | 选型 | 版本 |
| --- | --- | --- |
| 框架 | Next.js（App Router / RSC / Server Actions） | 15 |
| 运行时 | React | 19 |
| 语言 | TypeScript（`strict`） | 5 |
| 样式 | Tailwind CSS（`@theme` 令牌 / `oklch()` 色彩空间） | 4 |
| 组件库 | shadcn/ui（`base-nova` style，底座 `@base-ui/react`） | — |
| 图标 | lucide-react | — |
| 国际化 | next-intl（`zh` / `ru` / `en`） | 4 |
| 字体 | Geist / Geist Mono / Noto Sans SC（`next/font`） | — |
| 校验 | ESLint（`next/core-web-vitals` + `next/typescript`）、Prettier（含 `prettier-plugin-tailwindcss`） | 9 / 3 |

设计约束：**移动优先的 H5**，重点适配微信内置浏览器（禁缩放、处理 `safe-area-inset`），同时向上适配到桌面画布。

---

## 快速开始

### 环境要求

Node.js 20 及以上（Next.js 15 要求 18.18+），npm。

### 安装与运行

```bash
npm install

# 分别启动（推荐，两个终端）
npm run dev            # B2C 主站 → http://localhost:3000
npm run dev:partner    # B2B 后台 → http://localhost:3001

# 或一条命令同时起
npm run dev:all
```

两个 dev server **不能共用构建目录**，所以 `dev:partner` 走 `.next-partner`（已在 `.gitignore` 中排除），由 `next.config.ts` 的 `NEXT_DIST_DIR` 环境变量控制。

端口可用环境变量覆盖：

```bash
SITE_PORT=4000 PARTNER_PORT=4001 npm run dev:all
```

### 演示账号

| 场景 | 凭据 |
| --- | --- |
| 会员注册 | 任意手机号或邮箱 + **自设密码**（≥8 位、须含字母和数字、不能包含标识本身）；验证码由数据库实时生成并**直接显示在表单上**。注册第一步要填**真实姓名**（不是昵称）与**居住国家 + 城市**（两级下拉） |
| 会员登录 | 同一标识，**验证码或密码二选一**。库里的演示账号（含 seed 数据）没有密码，只能用验证码登录，页面会提示「该账号尚未设置密码」 |
| 合作伙伴后台 | 账号 `partner` / 密码 `loono2026` |

后台账号大小写不敏感；会员与合作伙伴的 cookie 是独立的（分别 30 天 / 8 小时）。

> 密码用 **scrypt** 加盐哈希后存进 `users.password_hash`，库里不存明文也不存可逆密文。
> 哈希串自带算法参数（`scrypt$N$r$p$salt$hash`），日后调高 `N` 不会让老密码失效。

---

## 双站点架构

生产环境按**域名**分流，本地没有 DNS，按**端口**分流 —— 全部由 `src/middleware.ts` 处理：

```
partner.loono.com/login   →  rewrite  →  /[locale]/partner/login   （地址栏保持 partner 域）
localhost:3001/login      →  rewrite  →  /[locale]/partner/login
localhost:3000/partner/login → redirect 307 → localhost:3001/login  （剥离 /partner 前缀）
```

三个关键实现细节：

1. **rewrite 而非 redirect**：生产下访问 `partner.loono.com` 时地址栏不跳到 `/partner`。
2. **改写后交回 next-intl**：应用树是 `[locale]/partner/...`，裸路径 `/partner/login` 匹配不到任何路由，必须由 intl middleware 补上 locale 段。
3. **跨端口跳转仅在开发环境生效**（`NODE_ENV !== "production"`），避免生产部署恰好监听 3000 端口时劫持自身的 `/partner` 流量。

路由守卫不由 middleware 承担，而在**页面级**：后台每个受保护页面首行调用 `requirePartnerSession()`，无会话则跳转登录页。

---

## 功能清单

### B2C 主站

| 模块 | 路由 | 说明 |
| --- | --- | --- |
| 落地页 | `/` | `<lg` 轻奢单页（暖光晕背景、轮播标题、特性卡、数据条）；`lg+` 长版营销页（Hero / 支柱 / 案例 / 定价 / FAQ / 地区 / 页脚），纯 CSS 切换，无 viewport JS |
| 注册 | `/auth/register` | 手机号或邮箱二选一 + 验证码 + **设置密码**（含确认框与强度条）+ 协议勾选；`/auth` 会重定向到这里 |
| 登录 | `/auth/login` | 「验证码 / 密码」两种方式就地切换；用没注册过的标识登录会被引导去注册，老账号没设密码会提示去用验证码 |
| 注册引导 | `/onboarding/*` | 五步向导：**基本资料** → **个人属性** → 择偶条件 → 实名认证 → 选择套餐，带步骤条。<br>基本资料：多张照片上传（即时预览，首张为头像）、真实姓名（即时校验）、性别、出生日期（手表式滚轮）、**国家 → 城市级联下拉**。<br>个人属性：身高体重拖动滑块、学历职业婚姻子女、语言、生活与信仰、资产、**兴趣标签**、**自我介绍** —— 这一步真的会落库 |
| 搜索（会员目录） | `/catalog` | 卡片网格，Tab 分组（全部 / 附近 / 新加入 / 在线），受层级可见矩阵控制 |
| 会员详情 | `/user/[id]` | 大头像 + 资料；超出可见层级时模糊遮罩 + 升级引导 |
| 聊天列表 | `/chats` | 会话列表，未读角标；桌面端列表移至左侧栏 |
| 聊天详情 | `/chats/[id]` | 双语消息气泡 + 输入框 |
| 个人中心 | `/profile` | 身份卡、当前等级与到期、资料完整度、择偶条件摘要、认证墙、功能入口 |
| 完善个人信息 | `/profile/edit` | 「个人资料」「择偶条件」双 Tab 编辑器（`?tab=partner` 直达后者） |
| 订阅 | `/profile/subscription` | 套餐选择器（月付 / 年付、折扣标注） |
| 设置 | `/settings` | 账号 / 通知 / 隐私分组，含语言切换、注销入口 |
| 注销账号 | `/settings/delete-account` | 独立多步注销流程（刻意移出 Tab 组，避免中途走神） |
| 合伙申请 | `/partners/apply` | **主站唯一的对外合作入口**：四档合作类型 + 联系信息表单 |

### B2B 合作伙伴后台

| 模块 | 路由 | 说明 |
| --- | --- | --- |
| 登录 | `/partner/login` | 账号密码表单，`useActionState` + Server Action |
| 数据看板 | `/partner` | 合作伙伴**自己的**经营看板：KPI 条、收益趋势、转化比值、近期转化表、提现历史 |
| 代理商查询 | `/partner/agents` | 运营视角：按**代理商 × 时间段**检索收益、会员与活动 |

顶栏 `OperatorBar` 在两个板块间切换，并显示当前账号与登出。

### 跨模块能力

| 能力 | 位置 |
| --- | --- |
| 三语文案 | `src/messages/{zh,en,ru}.json`，共 **834 个键**，三语键集完全对齐 |
| 语言切换 | `LocaleSwitcher`，仅主站使用——后台不对会员开放 |
| 主题令牌 | `globals.css` 的 `@theme`：B2C 暖色板 + B2B 冷调浅色板 |
| 响应式三档 | `<md` 全出血 H5 · `md–xl` 居中单列 · `xl+` 桌面画布（侧栏替代底部导航） |
| 会话与守卫 | `lib/auth/*`（会员）、`lib/partner/*`（合作伙伴） |
| 会员认证徽章 | 8 类（实名 / 学历 / 婚姻 / 资产 / 无犯罪 / 职业 / 收入 / 房产），带有效期与状态机 |

---

## 核心业务规则

规则来自 `PRD.md` 与《会员与合伙申请方案》，落地在 `src/lib/` 的纯函数中。

**1. 平等付费（Equal Pay）** — 无论男女，所有会员都必须持有有效订阅才能浏览资料与聊天。见 `lib/tiers.ts` 的 `hasActiveSubscription()`。

**2. 层级可见矩阵** — 会员只能看到不高于自身等级的资料，更高层级的资料模糊显示并提示升级：

```
L1 → L1
L2 → L1, L2
L3 → L1, L2, L3
```

见 `canView()` / `isLocked()` / `visibleLevels()`。

**3. 免费试用** — 推广码激活 Level 1 的 30 天试用（`TRIAL_DURATION_DAYS`）。

**4. 实时翻译的双语消息** — 每条消息同时携带原文与译文。界面采用**主辅文本结合**：

- **主文本（大字，15px）**：翻译为**当前读者语言**的内容
- **辅文本（小字，灰色，11px，带 🈯 图标）**：发送者的原始文本

自己发出的消息不重复显示原文行。见 `components/chat/message-bubble.tsx`。

**5. 合伙体系四档** — 合作类型与分成比例：线上推广 50% / 城市·省级 60% / 国家 70% / 股东 75%，取自《会员与合伙申请方案》，写入申请表单选项与后台 `PartnerTier`。

---

## 路由总表

| 路径 | 组 | 说明 |
| --- | --- | --- |
| `/` | 公开 | 落地页 |
| `/auth/register` · `/auth/login` | 公开 | 注册 / 登录（`/auth` → 重定向到注册页，兼容旧邀请链接） |
| `/onboarding/profile` · `attributes` · `partner` · `kyc` · `subscription` | 公开 | 注册五步 |
| `/partners/apply` | 公开 | 合伙申请 |
| `/agent/join` | — | **重定向** → `/partners/apply`（旧链接与二维码兜底） |
| `/catalog` · `/user/[id]` · `/chats` · `/chats/[id]` · `/profile` · `/profile/edit` · `/profile/subscription` · `/settings` | `(main)` | 登录后主体，共享底部 Tab |
| `/settings/delete-account` | 公开 | 注销流程（无 Tab） |
| `/agent/dashboard` | — | **重定向** → `/partner` |
| `/partner/login` | `/partner` | B2B 登录 |
| `/partner` · `/partner/agents` | `/partner` | B2B 看板与查询（**受守卫保护**） |

`(main)` 是 route group，不进入 URL —— 它让底部导航在所有登录页面上复用，同时保持 URL 与 PRD 站点图一致。

---

## 目录结构

```
db/migrations/                    # 数据库结构定义（权威来源，见 db/README.md）
scripts/                          # migrate.mjs / seed.mjs / load-env.mjs
pg/                               # PC 上 PostgreSQL + pgweb 的 docker-compose
src/
├── app/
│   ├── api/                    # route handlers：chats / messages / read / hide / blocks / reports / profile / uploads
│   ├── globals.css             # 主题令牌（@theme）与 B2C/B2B 两套 surface
│   ├── layout.tsx  · not-found.tsx  · favicon.ico
│   └── [locale]/
│       ├── layout.tsx          # 字体、metadata、viewport、NextIntlClientProvider
│       ├── page.tsx            # 落地页（移动 / 桌面两棵树）
│       ├── (main)/             # 登录后主体（含底部 Tab）
│       ├── onboarding/         # 注册五步
│       ├── partners/apply/     # 合伙申请
│       ├── partner/            # B2B 后台（login / 看板 / agents）
│       ├── agent/              # 旧路径重定向
│       └── settings/           # 注销流程
├── components/
│   ├── ui/                     # 23 个 shadcn 原子组件（含 slider / wheel-picker / wheel-date-picker / native-select）
│   ├── layout/                 # AppShell / AppFrame / 底部导航 / 侧栏 / 页头
│   ├── landing/                # 移动端落地组件 + desktop/ 桌面长页
│   ├── chat/  catalog/  profile/  onboarding/  account/  auth/  agent/
│   └── partner/                # 表单、筛选条、顶栏、面板、图表
├── i18n/                       # routing / request / navigation
├── lib/
│   ├── db/                     # 数据层：pool / members / chat / plans / agent / partner / auth / viewer / types
│   ├── auth/                   # 会话、标识归一化、密码规则与哈希、注册/登录 Action
│   ├── profile/                # 资料写入 Action、年龄换算（age.ts）、真实姓名规则（name.ts）、FormData 解析（form.ts）
│   ├── partner/                # 后台会话、登录 Action、代理商查询层
│   ├── chat-client.ts          # 浏览器侧 fetch 封装 + 4 秒轮询
│   ├── uploads.ts              # 照片落盘：魔数嗅探扩展名、UUID 文件名、严格读取白名单
│   ├── profile-defaults.ts     # 编辑器兜底值 / 重置模板
│   ├── geo.ts                  # 国家 → 城市登记表（两级下拉的唯一数据源）
│   ├── tiers.ts  plans.ts  agent.ts  profile-options.ts  verification.ts  utils.ts
├── messages/                   # zh.json / en.json / ru.json
├── types/                      # user / chat / agent / partner / profile / verification
└── middleware.ts               # 域名 + 端口分流，locale 处理
```

规模：约 177 个源文件、24 个路由页面、10 个 route handler、79 个组件。

---

## 数据层

页面**不再读任何 mock 常量**，全部经 `src/lib/db/*` 查 PostgreSQL。

```
页面 / route handler
        ↓
src/lib/db/*        业务语义（listCatalogMembers / sendMessage / getAgentDashboard …）
        ↓
src/lib/db/pool.ts   唯一连接池（server-only，globalThis 记忆化避免 dev 热重载泄漏连接）
        ↓
PostgreSQL（PC 上的 Docker）
```

- **只有服务端能碰库**。`pool.ts` 顶部 `import "server-only"`，一旦被客户端组件引用，
  构建直接失败 —— 把连接串打进浏览器包等于把库钥匙交给访客。
- **浏览器侧改走 HTTP**。原先是浏览器直连 Supabase，现在统一走 `src/app/api/*`
  的 route handlers；`src/lib/chat-client.ts` 是配套的 fetch 封装。
  实时性用 **4 秒轮询**替代 Supabase Realtime。
- **权限判断在数据层**。`db/chat.ts` 的 `assertChatMember`、`db/viewer.ts` 的
  `requireViewerProfile` 抛带 `status` 的错误对象，由 `src/app/api/_lib/http.ts`
  统一翻译成 HTTP 状态码（401 / 403 / 400 / 500）。
- **产品约束落在 SQL 上**。目录查询写死 `where kind = 'member'`，
  机构账号与推荐位存根永远进不了 B2C 界面，不靠组件自觉。

库结构、建表步骤与常用 SQL 见 **[`db/README.md`](db/README.md)**。

---

## 国际化

- 语言：`zh`（默认）/ `ru` / `en`，配置在 `src/i18n/routing.ts`。
- `localePrefix: "as-needed"` —— 默认语言不带前缀（`/catalog`），其余带前缀（`/ru/catalog`，`/en/catalog`）。
- 文案分命名空间组织，共 20 个（`common` / `nav` / `guest` / `portal` / `auth` / `onboarding` / `catalog` / `user` / `verification` / `chats` / `profile` / `profileForm` / `partnerPref` / `subscription` / `settings` / `deleteAccount` / `agent` / `tier` / `partners` / `partner`）。
- **注意**：`t()` 只能取到字符串叶节点。取对象型命名空间会抛 `INSUFFICIENT_PATH`，且**静默回退成 key 原文而不报错** —— 需要整块取数组时用 `t.raw()`。

新增文案时三语必须同步，键集、占位符都要对齐。

---

## 主题与响应式

**B2C「Warm Blush」**：粉调象牙暖底，顶部一束暖桃光晕配一束真粉光晕；纯白卡片 + 浓缩咖啡—玫瑰墨色 + 玫瑰金点缀（`.loono-surface` / `.glass-card` / `.loono-cta`）。粉色由**光**承载，不落在正文与功能性控件上；色相整体落在 12–52（玫瑰→玫瑰金）。

**B2B 数据风**：冷调浅灰底 + 白色面板 + 32px 工程网格 + 天蓝强调色 + 大号等宽数字（`.partner-surface` / `.partner-panel`）。两套都是浅色，靠**色相**区分而非明度——C 端偏暖、B 端偏冷。`.partner-surface` 为自己的子树重新声明了 shadcn 令牌，所以 `text-foreground` / `border-border` / `Card` 在后台内部自动走冷色，无需逐个组件覆盖。

响应式全部走 **纯 CSS 断点**（`lg:hidden` / `hidden lg:block` 切换两棵树），**不读 viewport 尺寸**，以避免 hydration mismatch。

---

## 演示数据

演示数据现在由 `scripts/seed.mjs` **灌进数据库**，不再是代码里的常量。
内容与原 mock 一致：会员档案与扩展属性、会话与消息、4 个档位、8 家代理商
+ 约 190 天日度流水、付款账本。

其中代理商流水用**种子 PRNG（mulberry32）确定性生成** —— 跨次运行字节稳定
（否则日期筛选看起来像坏了），窗口**锚定今天**（否则「近 7 天」这类预设过几天就落空）。
其中一家中途停业，用来验证区间筛选与空态。

`src/lib/partner/query.ts` 仍是**纯函数**：区间解析（预设 / 自定义 / 边界校验 / 上限 366 天）、
汇总、按天-周-月分桶、花名册汇总。它只负责算，数据从库里取 —— 换真实上报接口时不用动它。

**注册与登录**（`db/migrations/0005_auth.sql` + `src/lib/db/auth.ts`）：
手机号与邮箱两条通道，各自唯一、都允许为空（单通道账号合法）。
标识归一化是纯函数，放在 `src/lib/auth/identifier.ts`，客户端表单与服务端共用同一套规则 ——
否则 `+8613800000000` 与 `+86 138 0000 0000` 会被库当成两个人，唯一约束拦不住。
验证码**落库**（`verification_codes`）而不是放内存：dev 热重载会反复求值模块，
多进程部署更会各存各的。校验与消费是**一条 SQL**（`update ... where id = (select ... limit 1) returning id`），
并发提交同一个码时只有一个能过。

**密码**（`db/migrations/0006_password.sql` + `src/lib/auth/password{,-hash}.ts`）：
注册时密码是**必填**的；登录页可以在「验证码 / 密码」之间就地切换。
规则与哈希都写成纯函数并分成两个文件，因为**哈希要 `server-only`，规则不能** ——
客户端要在用户敲字时实时给出提示，服务端要拿同一套规则做最终裁决，规则只有一份才不会两边打架。

- `password.ts` 只管「合不合法」，导出 `checkPassword()` / `checkNewPassword()` / `passwordStrength()`；
  长度用 `Array.from(value).length` 计，中文密码不会被算成两倍长。
- `password-hash.ts` 只管「怎么存」，scrypt（N=16384 / r=8 / p=1，keylen 32，salt 16 字节）。
  存成**自描述串** `scrypt$N$r$p$salt$hash`，校验时**读串里的参数**重新推导 ——
  所以日后调高 N 只是新密码更强，老哈希照样能验。
  任何格式异常一律返回 `false` 而不是抛错，`null` / `""` 也返回 `false`（即「没设过密码」）。
- 登录失败分两种回执：`passwordNotSet`（演示账号与 seed 数据从没设过密码）与 `passwordWrong`（设过但敲错了），
  页面文案不同 —— 否则老用户会一直以为自己记错了密码。
- `users.password_hash` **可空**：0006 之前建的账号和全部 seed 数据都没有密码，
  强制非空就得给每条老数据编一个假密码，比留空更糟。

校验顺序是 `空 → 长度 → 字母+数字 → 是否包含标识本身`。
最后一条对**纯数字手机号**其实进不去（先被「缺字母」拦下），真正会命中的是邮箱这类字母数字混合标识。

**照片上传**（`src/lib/uploads.ts` + `app/api/uploads/*`）：
图片写本地文件系统（默认 `<cwd>/var/uploads`，可用 `UPLOAD_DIR` 覆盖），库里只存 URL。
三个安全点是刻意的：

- **文件名由服务端生成**（UUID + 扩展名），用户给的名字只用来判断「像不像图片」，不进磁盘；
- **扩展名靠魔数嗅探**而不是信 `Content-Type`，把 HTML 改名成 `.jpg` 传上去会被拒；
- **读取路径用白名单正则**，`../../.env`、绝对路径、内嵌空字节、多重扩展名全部拦下。

`GET /api/uploads/[name]` 回不可变缓存（`max-age=31536000, immutable`）并带 `nosniff`，
所以 `next/image` 对这类同源 URL 直接传 `unoptimized` 就够了 —— 字节已经是对的类型、也不会再变。
上传接口本身**不写库**：它只把文件放好并返回 URL，由后续的资料保存动作一并落库。
这样「传了图但没点保存」只会留下一个孤儿文件，不会留下半条脏资料（孤儿文件的清理是可接受的遗留项）。

**表单交互**（`components/ui/{slider,wheel-picker,wheel-date-picker}.tsx`）：

- **身高体重用滑块**（`@base-ui/react/slider`）：值为数组，`name` 会渲出一个隐藏 input 供表单直接提交。
  滑块停在「中性位置」但显示**未设置**，另给一个明确的「清除」入口 ——
  否则「没填」和「填了中间值」在界面上长得一模一样。
  择偶条件的区间（年龄段、身高段）用双滑块，两个端点**首次拖动时一起写入**，
  避免出现「只设了下限、上限无限制」这种没人要的中间态。
- **出生日期用手表式滚轮**：三列（年 / 月 / 日），靠原生 `scroll-snap-type: y mandatory`
  加首尾各 `PAD_ITEMS` 行撑高，让第一项和最后一项都能滚到中线。
  「停下」判定用的是 90ms 防抖而不是 `scrollend` 事件（Safari 支持不全）。
  年份列**降序**排列（用户多数在近几十年），月份/年份变化时统一走一个 `commit()` 夹取日期，
  所以不会出现 2 月 31 日。高亮条是滚动容器的**兄弟节点**而不是子节点，
  这样它不跟着内容滚；列标题也因此必须放在高亮条之外，否则中线对不上。
- **出生日期必须原样往返**：PG 的 `date` 让 node-postgres 解析成 JS `Date` 再 `.toISOString()`，
  在东八区会**往前掉一天**。所以读的时候直接 `to_char(birth_date, 'YYYY-MM-DD')` 拿字符串，
  不经过 `Date`。年龄换算用 `Date.UTC` 并回验各分量，`2023-02-31` 会返回 `null` 而不是悄悄滚到 3 月 3 日。

---

## 注册引导：字段归属与两级下拉

注册分五步，其中**第一步「完善个人资料」与第二步「个人属性」都会真的落库**。

### 姓名：真实姓名，不是昵称

`displayName` 存的就是**真实姓名**。数据库列仍叫 `profiles.display_name` ——
这一列是会员姓名在全站的**唯一来源**（目录卡片、会员详情、聊天气泡都读它），
再开一个 `real_name` 列只会让两者渐渐不一致。法定证件姓名属于 KYC 环节，不在这一步。

校验规则在 `src/lib/profile/name.ts`，是**纯函数且不带 `server-only`**，
所以客户端能在用户敲字时实时提示，服务端拿同一份规则做最终裁决：

- 长度按**码点**算（`Array.from(value).length`），2–40；`𠀀` 这类代理对算 1 个字符而不是 2 个。
- 允许字母 / 组合符 / 空格 / 间隔号（`·` `・`）/ 连字符 / 撇号 / 句点。
  间隔号是给维吾尔、哈萨克、藏语名准备的；含点号是给 `J. R. Smith` 这类名字。
- **词数上限 6**。这一条是为了拦住「整段粘贴」，不是拦长名字 ——
  `Mary Jane van der Berg`（5 段）和 `María de los Ángeles García`（5 段）都是合法姓名，
  真正的长度闸门是那个 40 字符上限。
- `normalizeRealName` 顺手清掉复制粘贴带进来的零宽字符（`\u200b-\u200d`、BOM、NBSP）并把连续空白压成一个空格。
- 报错顺序是 `空 → 长度 → 有数字 → 有符号 → 无字母 → 词数过多`；
  数字排在符号前，因为对 `abc123` 说「不要数字」比说「不要符号」更有用。

### 居住地：国家先选，城市从属于国家

`src/lib/geo.ts` 是「国家 → 城市」登记表的唯一数据源，也是 `COUNTRY_CODES` 的城市侧补充。
**城市名存的是拉丁正词**（`Shanghai` / `Moscow` / `Tokyo`），不走 i18n 键，三个理由：

1. 已有种子数据就是这个形状，改成键要迁移全部历史数据；
2. `profiles.city` 在**五个地方被直接渲染**（目录卡片、会员详情、落地页地区）；
3. 同一个会员的城市必须在切换语言时保持同一个字符串 ——
   否则同一个人会变成两个不同的值，按城市筛选会漏掉人。代价是中文界面里显示 `Shanghai`，这个取舍是刻意接受的。

两级的控制件是**一个组件**（`components/onboarding/country-city-field.tsx`）而不是两个独立字段，
这样「改国家后必须清掉不属于新国家的城市」这条不变量只有一处实现。
少了它，库里就会出现「国家 = GB、城市 = Shanghai」，按国家筛选时这个人会被静默丢掉。
服务端不能只验「国家在列表里」—— 城市是两个隐藏字段随表单上来的，
`countryCode=GB&city=Shanghai` 可以被伪造，所以两者用 `isKnownCity` 成对校验。

用的是**原生 `<select>`**（`components/ui/native-select.tsx`）而不是 base-ui 的自定义弹层：
主战场是手机 H5（微信内浏览器），国家 15 项、城市最多 8 项，原生选择器白送系统滚轮、
惯性和首字母跳转，表单集成也只要 `name` / `value` / `onChange` 三件套。

### 兴趣与自我介绍挪到第二步

`interests` 与 `bio` 从第一步移到第二步「个人属性」。这带来一个必须显式处理的回归风险：
第一步的表单**不再包含**这两个字段，所以它的提交动作一旦顺手写这两列，
每次重填第一步都会把用户在第二步填好的内容清空。
因此 `saveProfileBasics` 的 SQL 里**刻意不出现** `interests` / `bio`（代码里有注释锁住这一点），
并由一条端到端断言专门守门。

### 同一个事实只存一处（迁移 0008）

`profile_attributes` 曾经也有一份 `country_code` / `city`，与 `profiles` 上的完全重复。
读取路径写的是 `attr_country_code ?? country_code ?? ""`（属性表优先、主表兜底），
但那两列是 `not null default ''` —— **空字符串不是 NULL**，
所以 `??` 永远轮不到兜底，会员存好的居住地在界面上显示为空白。
`db/migrations/0008_attributes_move.sql` 删掉了这两个重复列。
删除前已核对全部 7 行属性表的取值与主表逐行一致，所以**不丢数据**；
删除理由与核验结论都写在迁移的 `comment on column` 里。
现在居住地只有 `profiles.country_code` / `profiles.city` 一个来源。

### 字段归属速查

| 字段 | 落在哪张表 | 哪一步写 |
| --- | --- | --- |
| 真实姓名 / 性别 / 出生日期 | `profiles.display_name` / `gender` / `birth_date` | 第一步 |
| 居住国家 + 城市 | `profiles.country_code` / `city` | 第一步 |
| 照片 / 头像 | `profiles.photo_urls` / `avatar_url` | 第一步 |
| 兴趣标签 | `profiles.interests` | **第二步** |
| 自我介绍 | `profiles.bio` | **第二步** |
| 身高 / 体重 / 学历 / 职业 / 婚史 / 子女 / 语言 / 生活方式 / 信仰 / 资产 | `profile_attributes`（13 列） | **第二步** |

第二步的属性写入把 `profile_attributes` 的 upsert 与 `profiles` 上 `interests` / `bio` 的更新
**放在同一个事务里**（`lib/db/pool.ts` 导出的 `transaction`），避免只写成功一半。

第一步的年龄、第二步的性别等每个枚举都经白名单校验（`lib/profile/form.ts` 的
`readChoice` / `readChoiceList` / `readInteger`）；`readInteger` 越界返回 `null` 而不是夹取 ——
把 250 悄悄存成 250 会让用户以为「我填过了」。

---

## 开发脚本

```bash
npm run dev            # 启动 B2C（:3000）
npm run dev:partner    # 启动 B2B（:3001，独立构建目录）
npm run dev:all        # 同时启动两者
npm run build          # 生产构建
npm run start          # 生产启动
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run format         # Prettier 写入
npm run format:check   # Prettier 校验

npm run db:migrate     # 建表 / 应用新增迁移
npm run db:seed        # 灌演示数据（幂等）
npm run db:reset       # 清空 + 重灌
npm run db:status      # 干跑迁移，只报告还剩哪些没执行
```

首次使用见 **[`db/README.md`](db/README.md)** 的「第一次跑起来」。

工程约定：

- 路径别名 `@/*` → `src/*`（`tsconfig.json`）。
- Prettier 带 `prettier-plugin-tailwindcss`，会自动按 `globals.css` 排序类名；`.md` 不在格式化范围内。
- shadcn 组件配置见 `components.json`（style `base-nova`，图标 lucide，CSS 变量模式）。
- `@base-ui/react` 组件的受控写法：`RadioGroup` 用 `value` / `onValueChange`，`Checkbox` 用 `checked` / `onCheckedChange`。
- Next.js 会自动把 `.next-partner/types/**/*.ts` 写进 `tsconfig.json` 的 `include`，属正常现象。

---

## 还需替换的位置

数据库已经接通，剩下的都是外围能力：

| 位置 | 现状 | 待办 |
| --- | --- | --- |
| `lib/auth/*` + `lib/db/auth.ts` | 会员登录已支持「验证码 / 密码」双方式，密码是 **scrypt 加盐哈希**（不是明文）；但**会话仍是未签名 cookie** | 会话改签名 token（`httpOnly` + `Secure` + 轮换） |
| `lib/db/auth.ts` 的验证码 | 验证码**明文**入库并回显在表单上 | 验证码改加盐哈希 + 接真实短信/邮件通道 + 发送频次限流 |
| `lib/auth/*` 的密码 | 已做长度/复杂度/包含标识校验，**没有**错误次数限制 | 登录失败计数与锁定、弱口令库比对、改密与找回流程 |
| `app/api/uploads/*` + `lib/uploads.ts` | 落**本机文件系统**，只有魔数与路径白名单校验 | 换对象存储（S3/OSS 兼容，只存 key + 签名 URL）；补图片重编码（去掉 EXIF 与潜在载荷）与内容审核 |
| `lib/partner/{constants,session,actions}.ts` | 硬编码账号密码 | 合作伙伴身份服务 + 限流 + 锁定 |
| `lib/chat-client.ts` | 4 秒轮询 | 换成 SSE / WebSocket 推送 |
| `components/partner/apply-form.tsx` | `handleSubmit` 为本地 stub | `POST /partners/applications`，并加服务端限流与验证码（该接口公开） |
| `components/agent/promo-tools.tsx` | 推广链接与推广码为占位 | 推广工具接口 |
| `var/uploads/` 里的孤儿文件 | 传了图但没保存资料会留下一张没人引用的图 | 定时清理任务（按 `mtime` + 引用计数） |
| `lib/geo.ts` 的国家/城市表 | 是**前端内置字典**（15 国 + 各自城市），改一处要发一次版 | 改由后端下发字典（可配置、可增删），前端降级为兜底缓存 |
| `lib/profile/name.ts` | 只做**格式**校验，无法判断名字是否真属于本人 | 与国家证件校验 / 人脸核身串起来（KYC 环节） |
| `lib/db/members.ts` 的 `getMember` | 第二步页面为了拿 `countryCode` / `city` 读了全量会员视图 | 拆一个只读属性的窄查询 |
| `db/migrations/*` | 结构与业务规则已就位 | 生产前补：分区策略（按数据主体属地）、备份与恢复演练 |

---

## 相关文档

- `PRD.md` —— 产品需求与技术栈基线（含站点图与核心规则）。
- `db/README.md` —— 库结构总览、建表步骤、常用 SQL、名词速查。

