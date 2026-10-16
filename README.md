# LOONO

> 中文版：[README_CN.md](./README_CN.md)

Front-end for a cross-border matchmaking and dating platform. One codebase carries two surfaces that have nothing in common:

| Surface | Audience | Look | Entry |
| --- | --- | --- | --- |
| **B2C consumer site** | Ordinary members | Warm light luxury | `loono.com` · locally `:3000` |
| **B2B partner console** | Authorised partners / operators | Cool light data surface | `partner.loono.com` · locally `:3001` |

The consumer site **never mentions agents or agencies**. Its bottom navigation is fixed at three core tabs (Search, Chats, Me); the only outward-facing offer is "Partners", reached through an application form. The partner console is **behind an account login** and is not linked from the consumer site in either direction.

> This repository is a **working prototype**: business data now persists to a self-hosted PostgreSQL database, and sign-up / sign-in are backed by it too (phone **or** email, one-time codes, and **a password chosen at sign-up** — sign-in accepts either the code or the password). Photo uploads land on the local filesystem and are served back through `/api/uploads/*`. Three things are still emulated — the session is an **unsigned** cookie, verification codes have no real delivery channel (they are echoed back on the form), and message liveness uses 4-second polling. Each module's comments mark where those get replaced.

---

## Tech stack

| Layer | Choice | Version |
| --- | --- | --- |
| Framework | Next.js (App Router / RSC / Server Actions) | 15 |
| Runtime | React | 19 |
| Language | TypeScript (`strict`) | 5 |
| Styling | Tailwind CSS (`@theme` tokens / `oklch()` colour space) | 4 |
| Components | shadcn/ui (`base-nova` style, on top of `@base-ui/react`) | — |
| Icons | lucide-react | — |
| i18n | next-intl (`zh` / `ru` / `en`) | 4 |
| Fonts | Geist / Geist Mono / Noto Sans SC (`next/font`) | — |
| Checks | ESLint (`next/core-web-vitals` + `next/typescript`), Prettier (with `prettier-plugin-tailwindcss`) | 9 / 3 |

Design constraint: a **mobile-first H5** app, tuned for WeChat's in-app browser (zoom disabled, `safe-area-inset` handled), while also scaling up to a desktop canvas.

---

## Getting started

### Requirements

Node.js 20 or newer (Next.js 15 requires 18.18+), npm, and a reachable PostgreSQL instance —
see [Database setup](#database-setup).

### Install and run

```bash
npm install

# Two terminals (recommended)
npm run dev            # B2C consumer site → http://localhost:3000
npm run dev:partner    # B2B console       → http://localhost:3001

# Or both at once
npm run dev:all
```

The two dev servers **cannot share a build directory**, so `dev:partner` uses `.next-partner` (already excluded in `.gitignore`), driven by the `NEXT_DIST_DIR` environment variable in `next.config.ts`.

The ports can be overridden:

```bash
SITE_PORT=4000 PARTNER_PORT=4001 npm run dev:all
```

### Demo credentials

| Context | Credentials |
| --- | --- |
| Member sign-up | any phone number or email plus **a password you choose** (8+ characters, must mix letters and digits, must not contain the identifier itself); the code is generated in the database and **shown right on the form**. The first onboarding step asks for your **real name** (not a nickname) and your **country of residence + city** (two cascading dropdowns) |
| Member sign-in | the same identifier, with **either the code or the password**. The demo and seed accounts have no password, so they can only sign in by code — the form says "this account has no password set" when you try |
| Partner console | account `partner` / password `loono2026` |

The partner account is case-insensitive; member and partner cookies are separate (30 days and 8 hours respectively).

> Passwords are salted and hashed with **scrypt** into `users.password_hash`; neither the plaintext nor anything reversible is stored.
> The hash string carries its own parameters (`scrypt$N$r$p$salt$hash`), so raising `N` later does not invalidate existing passwords.

---

## Two-site architecture

In production the split is by **domain**; locally there is no DNS, so it is by **port** — all of it handled in `src/middleware.ts`:

```
partner.loono.com/login      →  rewrite  →  /[locale]/partner/login   (address bar keeps the partner host)
localhost:3001/login         →  rewrite  →  /[locale]/partner/login
localhost:3000/partner/login → redirect 307 → localhost:3001/login    (the /partner prefix is dropped)
```

Three implementation details matter:

1. **Rewrite, not redirect** — visiting `partner.loono.com` in production never changes the address bar to `/partner`.
2. **The rewrite is handed back to next-intl** — the app tree is `[locale]/partner/...`, so a bare `/partner/login` matches no route at all and the intl middleware has to supply the locale segment.
3. **The cross-port bounce is development-only** (`NODE_ENV !== "production"`), so a deployment that happens to listen on port 3000 cannot hijack its own `/partner` traffic.

Route guarding is not done in middleware but at the **page level**: every protected console page calls `requirePartnerSession()` on its first line and bounces to the sign-in screen when there is no session.

---

## Feature list

### B2C consumer site

| Module | Route | Notes |
| --- | --- | --- |
| Landing | `/` | Below `lg`: a light-luxury single page (warm glow backdrop, rotating headline, feature cards, stats row). From `lg` up: a long-form marketing page (Hero / pillars / stories / pricing / FAQ / regions / footer). Pure CSS swap, no viewport JS |
| Sign-up | `/auth/register` | Phone **or** email, a verification code, **a password with a confirmation field and a strength bar**, and a terms checkbox. `/auth` redirects here |
| Sign-in | `/auth/login` | Toggles between **code and password** in place; an identifier nobody has registered is sent to the sign-up page instead, and an existing account with no password is told to use a code |
| Onboarding | `/onboarding/*` | Five-step wizard: basics → personal attributes → partner preferences → KYC → plan, with a stepper.<br>**Basics**: multi-photo upload (instant preview, first photo is the avatar), **real name** with live validation, gender, date of birth via a **watch-style wheel**, and a **country → city cascading dropdown**.<br>**Personal attributes**: height and weight **drag sliders**, education / occupation / marital status / children, languages, lifestyle and faith, assets, **interests**, and **about me** — this step genuinely persists to the database |
| Search (member catalogue) | `/catalog` | Card grid, tab groups (All / Nearby / New / Online), governed by the tier visibility matrix |
| Member profile | `/user/[id]` | Large portrait plus details; a blurred overlay with an upgrade prompt when the tier is out of range |
| Chat list | `/chats` | Conversation list with unread badges; on desktop the list moves into the left rail |
| Chat thread | `/chats/[id]` | Bilingual message bubbles plus composer |
| Me | `/profile` | Identity card, current tier and expiry, profile completeness, preference summary, verification wall, shortcuts |
| Edit profile | `/profile/edit` | Two-tab editor ("Profile" / "Preferences"); `?tab=partner` opens the second directly |
| Subscription | `/profile/subscription` | Plan picker (monthly / yearly, discount badge) |
| Settings | `/settings` | Account / notifications / privacy groups, plus the locale switcher and the deletion entry |
| Delete account | `/settings/delete-account` | A standalone multi-step flow (deliberately outside the tab group so users do not wander off mid-way) |
| Partner application | `/partners/apply` | **The consumer site's only outward-facing partnership door**: four tracks plus a contact form |

### B2B partner console

| Module | Route | Notes |
| --- | --- | --- |
| Sign-in | `/partner/login` | Account and password form, `useActionState` + Server Action |
| Dashboard | `/partner` | The partner's **own** performance board: KPI strip, revenue trend, conversion ratios, recent conversions, payout history |
| Partner lookup | `/partner/agents` | The operator's view: revenue, members and activities for **any partner over any window** |

The `OperatorBar` in the header switches between the two sections and carries the current account and sign-out.

### Cross-cutting capabilities

| Capability | Location |
| --- | --- |
| Three-language copy | `src/messages/{zh,en,ru}.json`, **834 keys**, with identical key sets across locales |
| Locale switcher | `LocaleSwitcher`, consumer site only — the console is not exposed to members |
| Theme tokens | The `@theme` block in `globals.css`: a warm B2C palette plus a cool light B2B palette |
| Three responsive tiers | `<md` full-bleed H5 · `md–xl` centred single column · `xl+` desktop canvas (side rail replaces the bottom nav) |
| Sessions and guards | `lib/auth/*` (members), `lib/partner/*` (partners) |
| Verification badges | 8 kinds (real name / education / marital / assets / criminal record / occupation / income / property), each with a validity window and a state machine |

---

## Core business rules

The rules come from `PRD.md` and the membership and partnership plan, and live as pure functions under `src/lib/`.

**1. Equal Pay** — every member, regardless of gender, needs an active subscription to browse profiles or chat. See `hasActiveSubscription()` in `lib/tiers.ts`.

**2. Tier visibility matrix** — a member can only see profiles at or below their own level; higher levels stay reachable but are blurred behind an upgrade prompt:

```
L1 → L1
L2 → L1, L2
L3 → L1, L2, L3
```

See `canView()` / `isLocked()` / `visibleLevels()`.

**3. Free trial** — a promo code activates a 30-day Level 1 trial (`TRIAL_DURATION_DAYS`).

**4. Real-time translated, bilingual messages** — every message carries both its original text and a translation. The UI pairs a **primary line with a secondary one**:

- **Primary (large, 15px)** — the text translated into the **current reader's** language
- **Secondary (small, grey, 11px, with a 🈯 icon)** — the sender's original wording

Messages you sent yourself do not repeat the original line. See `components/chat/message-bubble.tsx`.

**5. Four partnership tracks** — track and revenue share: online promoter 50% / city·provincial 60% / country 70% / shareholder 75%, taken from the membership and partnership plan and reflected both in the application form options and in the console's `PartnerTier`.

---

## Route reference

| Path | Group | Notes |
| --- | --- | --- |
| `/` | public | Landing |
| `/auth/register` · `/auth/login` | public | Sign-up / sign-in (`/auth` → redirects to sign-up, so old invite links keep working) |
| `/onboarding/profile` · `attributes` · `partner` · `kyc` · `subscription` | public | The five onboarding steps |
| `/partners/apply` | public | Partner application |
| `/agent/join` | — | **Redirect** → `/partners/apply` (keeps old links and printed QR codes alive) |
| `/catalog` · `/user/[id]` · `/chats` · `/chats/[id]` · `/profile` · `/profile/edit` · `/profile/subscription` · `/settings` | `(main)` | Signed-in body, sharing the bottom tab bar |
| `/settings/delete-account` | public | Deletion flow (no tab bar) |
| `/agent/dashboard` | — | **Redirect** → `/partner` |
| `/partner/login` | `/partner` | B2B sign-in |
| `/partner` · `/partner/agents` | `/partner` | B2B dashboard and lookup (**guarded**) |

`(main)` is a route group and never appears in the URL — it lets the bottom navigation be reused across every signed-in screen while keeping the URLs identical to the PRD sitemap.

---

## Directory layout

```
db/migrations/                    # Authoritative schema (see db/README.md)
scripts/                          # migrate.mjs / seed.mjs / load-env.mjs
pg/                               # docker-compose for PostgreSQL + pgweb on the PC
src/
├── app/
│   ├── api/                    # Route handlers: chats / messages / read / hide / blocks / reports / profile / uploads
│   ├── globals.css             # Theme tokens (@theme) and both surfaces
│   ├── layout.tsx  · not-found.tsx  · favicon.ico
│   └── [locale]/
│       ├── layout.tsx          # Fonts, metadata, viewport, NextIntlClientProvider
│       ├── page.tsx            # Landing (mobile and desktop trees)
│       ├── (main)/             # Signed-in body (with the bottom tabs)
│       ├── onboarding/         # The five onboarding steps
│       ├── partners/apply/     # Partner application
│       ├── partner/            # B2B console (login / dashboard / agents)
│       ├── agent/              # Legacy path redirects
│       └── settings/           # Account deletion
├── components/
│   ├── ui/                     # 23 shadcn primitives (including slider / wheel-picker / wheel-date-picker / native-select)
│   ├── layout/                 # AppShell / AppFrame / bottom nav / side rail / headers
│   ├── landing/                # Mobile landing pieces + desktop/ long-form page
│   ├── chat/  catalog/  profile/  onboarding/  account/  auth/  agent/
│   └── partner/                # Forms, filter bar, operator bar, panel, chart
├── i18n/                       # routing / request / navigation
├── lib/
│   ├── db/                     # Data layer: pool / members / chat / plans / agent / partner / auth / viewer / types
│   ├── auth/                   # Session, identifier normalisation, password rules and hashing, sign-up / sign-in actions
│   ├── profile/                # Profile write actions, age arithmetic (age.ts), real-name rules (name.ts), FormData parsing (form.ts)
│   ├── partner/                # Console session, sign-in action, partner query layer
│   ├── chat-client.ts          # Browser-side fetch wrapper + 4s polling
│   ├── uploads.ts              # Photo storage: magic-byte sniffing, UUID filenames, a strict read whitelist
│   ├── profile-defaults.ts     # Editor fallbacks / reset templates
│   ├── geo.ts                  # Country → city registry (the single source for the cascading dropdown)
│   ├── tiers.ts  plans.ts  agent.ts  profile-options.ts  verification.ts  utils.ts
├── messages/                   # zh.json / en.json / ru.json
├── types/                      # user / chat / agent / partner / profile / verification
└── middleware.ts               # Domain + port routing, locale handling
```

Roughly 177 source files, 24 routed pages, 10 route handlers and 79 components.

---

## Data layer

Pages **no longer read any mock constants** — everything goes through `src/lib/db/*` to PostgreSQL.

```
pages / route handlers
        ↓
src/lib/db/*          Domain semantics (listCatalogMembers / sendMessage / getAgentDashboard …)
        ↓
src/lib/db/pool.ts    The single connection pool (server-only; memoised on globalThis so dev HMR cannot leak connections)
        ↓
PostgreSQL (Docker on the PC)
```

- **Server only.** `pool.ts` starts with `import "server-only"`; the moment a client component imports it the build fails — which is exactly what we want, since shipping the connection string to the browser is handing visitors the keys to the database.
- **The browser talks HTTP.** Where it used to hit Supabase directly it now calls the route handlers under `src/app/api/*`, wrapped by `src/lib/chat-client.ts`. Liveness comes from **4-second polling** instead of Supabase Realtime.
- **Authorisation lives in the data layer.** `assertChatMember` (db/chat.ts) and `requireViewerProfile` (db/viewer.ts) throw errors carrying a `status`, which `src/app/api/_lib/http.ts` maps onto HTTP codes (401 / 403 / 400 / 500).
- **Product rules are enforced in SQL.** The catalog query hard-codes `where kind = 'member'`, so agency accounts and referral stubs can never surface in the B2C UI — no component has to remember.

Schema, setup steps and handy SQL: **[`db/README.md`](db/README.md)**.

---

## Internationalisation

- Locales: `zh` (default) / `ru` / `en`, configured in `src/i18n/routing.ts`.
- `localePrefix: "as-needed"` — the default locale carries no prefix (`/catalog`), the others do (`/ru/catalog`, `/en/catalog`).
- Copy is grouped into 20 namespaces (`common` / `nav` / `guest` / `portal` / `auth` / `onboarding` / `catalog` / `user` / `verification` / `chats` / `profile` / `profileForm` / `partnerPref` / `subscription` / `settings` / `deleteAccount` / `agent` / `tier` / `partners` / `partner`).
- **Careful**: `t()` only resolves string leaves. Asking for an object-shaped namespace throws `INSUFFICIENT_PATH` and then **silently falls back to the raw key without reporting anything** — use `t.raw()` to pull a whole array or object.

When adding copy, all three locales must move together: key sets and placeholders have to stay aligned.

---

## Theme and responsive behaviour

**B2C "Warm Blush"** — a blush-ivory canvas lit by one peach pool and one true-pink pool, pure white cards, espresso-rose text and rose-gold accents (`.loono-surface` / `.glass-card` / `.loono-cta`). Pink arrives through light, never through body type or functional chrome; the whole ramp sits in hues 12–52 (rose through rose-gold).

**B2B data surface** — a cool light grey canvas, white panels, a 32px engineering grid, a sky-blue accent and large tabular figures (`.partner-surface` / `.partner-panel`). Both products are light: the two are separated by **hue**, warm for consumers and cool for operators, not by luminance. `.partner-surface` re-declares the shadcn tokens for its subtree, so `text-foreground` / `border-border` / `Card` resolve cool inside the cabinet with no per-component overrides.

Responsiveness runs entirely on **CSS breakpoints** (`lg:hidden` / `hidden lg:block` swapping two trees) and **never reads the viewport size**, which keeps hydration from mismatching.

---

## Database setup

Every screen — members, threads, messages, plans, the partner ledger — reads from
PostgreSQL. There is no mock path left.

```bash
npm install                    # resolves pg and @types/pg
cp .env.example .env.local     # then set DATABASE_URL
npm run db:migrate             # create the schema
npm run db:seed                # load the demo dataset
npm run dev
```

`DATABASE_URL` points at the PostgreSQL running on the PC
(`postgresql://loono:<password>@192.168.31.37:5432/loono`; the compose file is in
`pg/`). It is deliberately **not** prefixed `NEXT_PUBLIC_` — the pool module is
guarded with `server-only`, so the connection string can never reach the browser.

| Order | File | Does |
| --- | --- | --- |
| 1 | `db/migrations/0001_core.sql` | `users`, `profiles`, attributes, preferences, badges, `plans`, subscriptions, promo codes, agents, payouts |
| 2 | `db/migrations/0002_chat.sql` | `chats`, `messages`, visibility, blocks, reports, and the four business triggers |
| 3 | `db/migrations/0003_partner.sql` | Partner roster, daily records, activities, the `partner_roster` view |
| 4 | `db/migrations/0004_ledger.sql` | The append-only payment ledger and the two earnings views |
| 5 | `db/migrations/0005_auth.sql` | Phone / email credentials, `verification_codes`, referral attribution |
| 6 | `db/migrations/0006_password.sql` | `users.password_hash` and `password_updated_at` |
| 7 | `db/migrations/0007_profile_extras.sql` | `profile_attributes.weight_kg` |

Full schema notes, handy SQL and a glossary: **[`db/README.md`](db/README.md)**.

> The older `supabase/migrations/*.sql` are kept for reference only. They depend on
> `auth.users`, `auth.uid()` and RLS policies, none of which exist in a stock
> PostgreSQL, so they cannot be loaded here.

### A note on `chats.slug`

`chats.slug` is **not** a conversation identity. `c_01` means "Mei ↔ whoever is currently looking", so two members opening `/chats/c_01` are looking at two different conversations that share a name. Uniqueness is therefore `(slug, owner_id)`, enforced by the `chats_slug_owner_key` index.

Once both participants have `profiles` rows, the natural key becomes the canonical participant pair (sorted member ids, hashed) and a thread should resolve by that pair rather than by whoever opened it. The peer has no profile row today, so a pair key has nothing to pair.

### Where the conversation list reads from

The list is served from `chats`, and the three values it shows are columns that triggers maintain on every message write:

| Column | Maintained by | Written when |
| --- | --- | --- |
| `last_message_text` | `messages_touch_chat` | A message is inserted |
| `last_message_at` | `messages_touch_chat` | A message is inserted |
| `unread_count` | `messages_touch_chat` / `messages_refresh_unread` | A message arrives from the peer / messages are marked read |

Nothing on the client recomputes any of it. `ThreadList` polls `GET /api/chats` every four seconds, which is what keeps the red badge clearing on open and the preview following a sent message from being two things that have to be remembered separately.

Two details worth keeping:

- **The badge trigger is statement-level over a transition table.** Marking 200 messages read costs one recount, not 200, and a derived count cannot drift from the rows it summarises.
- **A member can only mark a thread read through `POST /api/chats/[id]/read`**, which authorises via `assertChatMember` first. There is no general-purpose UPDATE route, so nothing lets a member rewrite the body of a message somebody else sent.

### Referral links

Every profile owns a `ref_code`, assigned once by a database trigger. A member shares `https://loono.app/auth/register?ref=CODE`; the profile created from that link gets `referred_by` pointing at the sharer. Invite links point at sign-up rather than sign-in, because the only thing they are for is bringing somebody new in.

```
 /auth/register?ref=ALEX60
      │
      ├─ middleware sees ?ref= on ANY page, not just /auth/register
      │     and writes the loono_ref cookie (30 days)
      │
      └─ on first profile creation the server calls attributeReferral(),
            which resolves CODE → profiles.id and writes referred_by
```

Design points worth knowing:

- **Attribution is first-touch.** `ref_code` is immutable (a trigger rejects changes) and `referred_by` is only written when the profile row is first created, so a member who later clicks a different link keeps their original referrer.
- **An unknown code is discarded, not fatal.** Plenty of links in the wild are dead; refusing to register someone over a stale one would be the wrong trade.
- **The cookie survives redirects.** Capture happens in middleware specifically so it also survives the next-intl locale hop (`/auth/register?ref=X` → `/ru/auth/register?ref=X`) and the cross-port partner bounce.
- The code is *not* a credential — it authorises nothing, it only selects a row.
- `lib/referral.ts` holds the cookie name, TTL, format validation and the share-link builder; it is imported by both the middleware and the browser, which is why it has no `"server-only"` marker.

### How it fits together

| File | Role |
| --- | --- |
| `lib/db/pool.ts` | The one connection pool. `server-only`, memoised on `globalThis` so dev HMR cannot leak connections until `max_connections` runs out |
| `lib/db/types.ts` | Row shapes for `chats` / `messages` / `profiles`, plus `REPORT_REASONS`. Replaces the old PostgREST-shaped `Database` generic |
| `lib/db/members.ts` | Member reads and writes. One `left join`-heavy query per member rather than N+1 — invisible locally, obvious against a remote database |
| `lib/db/chat.ts` | Threads, messages, moderation. Authorises through `assertChatMember`, which throws an error carrying `status: 403` |
| `lib/db/viewer.ts` | Who is looking: `getViewerProfile`, `requireViewerProfile` (401), `signInWithPhone`, `attributeReferral` |
| `lib/chat-client.ts` | Browser-side fetch wrapper and the 4-second poll. Replaces Supabase Realtime |
| `app/api/*` | The HTTP boundary. `_lib/http.ts` maps data-layer errors and PostgreSQL SQLSTATEs onto status codes |
| `components/chat/message-thread.tsx` | Client component owning the message list: loads history via the API, polls, sends optimistically |
| `lib/referral.ts` | Referral cookie, code validation and share-link builder — unchanged. Capture stays in middleware, the only place that can act before React runs |
| `components/profile/referral-link.tsx` | Reads the member's `ref_code` from the database. Still needs a share/copy affordance for WeChat and Telegram, and stats ("3 friends joined") once payouts exist |

Notes:

- `chats.slug` preserves the existing `/chats/c_01` URLs while the primary key stays a uuid.
- The viewer is resolved server-side from the session cookie, falling back to the `u_current` reading identity. A conversation partner who has not signed up has no profile row — they ride along as denormalised peer columns on `chats`.
- Conversations start empty for a newly signed-in member: history is per-chat, and a chat is created on first open. The empty state says so.

---

## Demo data

The demo dataset is now loaded **into the database** by `scripts/seed.mjs` rather than
compiled into the bundle: member profiles and attributes, threads and messages, the four
tiers, eight partners with roughly 190 days of ledger, and the payment ledger.

The partner ledger is still **generated deterministically from a seeded PRNG (mulberry32)** —
byte-stable across runs (a ledger that reshuffled would make the date filter look broken),
with the window **anchored to today** (a fixed end date would leave presets like
"last 7 days" empty within days). One partner stops trading mid-window, which gives the
range filter and the empty state something real to prove themselves against.

`src/lib/partner/query.ts` is still **pure functions**: window parsing (presets / custom /
bounds checking / a 366-day cap), summarising, day-week-month bucketing and roster totals.
It only computes; the rows come from the database, so a real reporting endpoint can drop in
behind it without touching the maths.

**Sign-up and sign-in** (`db/migrations/0005_auth.sql` + `src/lib/db/auth.ts`) run on two
channels — phone and email — each unique and each nullable, so a single-channel account is
legal. Identifier normalisation is a pure function in `src/lib/auth/identifier.ts`, shared by
the client form and the server so both apply the same rules; without it `+8613800000000` and
`+86 138 0000 0000` would look like two different people and the unique index would not help.
Codes live **in the database**, not in memory: dev-mode HMR re-evaluates the module on every
save, and any multi-process deployment would keep a separate map per instance. Checking and
consuming a code is a **single statement**
(`update ... where id = (select ... limit 1) returning id`), so two simultaneous submissions
of the same code cannot both succeed.

**Passwords** (`db/migrations/0006_password.sql` + `src/lib/auth/password{,-hash}.ts`): a
password is **required** at sign-up, and the sign-in page toggles between code and password in
place. The rules and the hashing live in two separate files for one reason — **hashing needs
`server-only`, the rules must not**. The client wants to advise while the user is still typing,
and the server wants the final say, so there has to be exactly one copy of the rules.

- `password.ts` only answers "is this acceptable": `checkPassword()` / `checkNewPassword()` /
  `passwordStrength()`. Length counts `Array.from(value).length`, so a CJK password is not
  counted twice.
- `password-hash.ts` only answers "how is it stored": scrypt at N=16384 / r=8 / p=1, keylen 32,
  16-byte salt. The stored string is **self-describing** (`scrypt$N$r$p$salt$hash`) and
  verification re-derives using **the parameters found in that string** — so raising N later
  only makes new passwords stronger and leaves every old hash verifiable. Anything malformed
  returns `false` rather than throwing, and `null` / `""` also return `false` (meaning "no
  password has ever been set").
- A failed sign-in reports `passwordNotSet` (demo and seed accounts never had one) and
  `passwordWrong` (it was set and typed wrong) as **two different outcomes** with different
  copy — otherwise a returning user just concludes they misremembered.
- `users.password_hash` is **nullable**: accounts created before 0006 and the entire seed
  dataset have no password. Forcing `not null` would mean inventing fake ones for every legacy
  row, which is worse than an empty column.

Validation runs in the order `empty → length → letters + digits → contains the identifier itself`.
The last check is effectively unreachable for a **pure-digit phone number** (the missing-letter
rule fires first); it is email-style alphanumeric identifiers that actually hit it.

**Photo upload** (`src/lib/uploads.ts` + `app/api/uploads/*`): images are written to the local
filesystem (default `<cwd>/var/uploads`, overridable with `UPLOAD_DIR`) and only the URL is
stored in the database. Three security choices are deliberate:

- **The server picks the filename** (UUID plus extension); the user-supplied name is only used
  to judge whether it looks like an image, and never reaches the disk;
- **The extension comes from magic bytes**, not from `Content-Type` — an HTML file renamed
  `.jpg` is rejected;
- **The read path uses a whitelist regex**, so `../../.env`, absolute paths, embedded null
  bytes and multi-extension names are all refused.

`GET /api/uploads/[name]` serves immutable bytes (`max-age=31536000, immutable`) with
`nosniff`, which is why `next/image` can pass `unoptimized` for these same-origin URLs — the
bytes are already the right type and will never change. The upload endpoint itself **does not
write to the database**: it stores the file and returns a URL, and the subsequent profile save
records it alongside everything else. Uploading a photo and never pressing save therefore
leaves one orphaned file rather than half a dirty profile; sweeping orphans is a known,
acceptable leftover.

**Form interaction** (`components/ui/{slider,wheel-picker,wheel-date-picker}.tsx`):

- **Height and weight are sliders** (`@base-ui/react/slider`). Values are arrays and `name`
  renders a hidden input, so the form submits them like any other field. The slider rests at a
  neutral position while displaying **not set**, with an explicit clear affordance — otherwise
  "never filled in" and "filled in at the midpoint" look identical. Range metrics (age band,
  height band) use two thumbs and write **both** endpoints on the first drag, since "lower bound
  set, upper bound unlimited" is a state nobody asked for.
- **Date of birth is a watch-style wheel**: three columns (year / month / day) built on native
  `scroll-snap-type: y mandatory`, with `PAD_ITEMS` spacer rows above and below so the first and
  last entries can still reach the centre. "Settled" is detected with a 90 ms debounce rather
  than the `scrollend` event (Safari support is incomplete). The year column is **descending**
  (most users are in recent decades), and month/year changes all funnel through one `commit()`
  that clamps the day, so 31 February never appears. The highlight band is a **sibling** of the
  scroller rather than a child, so it stays put while the content moves; the column headers
  therefore have to sit outside it too, or the centre line would not line up.
- **The birth date has to survive the round trip.** Node-postgres parses a `date` column into a
  JS `Date`, and `.toISOString()` then shifts it **one day backwards** in UTC+8. The read path
  therefore selects `to_char(birth_date, 'YYYY-MM-DD')` and never touches a `Date`. Age
  arithmetic uses `Date.UTC` and re-validates the parsed components, so `2023-02-31` returns
  `null` instead of quietly rolling over to 3 March.

---

## Onboarding: field ownership and the cascading dropdown

Onboarding has five steps, of which **step 1 (basics) and step 2 (personal attributes) genuinely
persist to the database**.

### Name: a real name, not a nickname

`displayName` holds the member's **real name**. The column is still `profiles.display_name`,
because that column is the **single source of a member's name across the whole app** (catalogue
cards, member detail, chat bubbles all read it); adding a second `real_name` column would only
let the two drift apart. The legal name from an identity document belongs to the KYC step, not here.

Validation lives in `src/lib/profile/name.ts` and is **pure, with no `server-only` marker**, so
the client can advise while the user types and the server still adjudicates with the same rules:

- Length is counted in **code points** (`Array.from(value).length`), 2–40; a surrogate pair such
  as `𠀀` counts as one character, not two.
- Permitted characters: letters, combining marks, spaces, interval dots (`·` `・`), hyphens,
  apostrophes and periods. Interval dots exist for Uyghur, Kazakh and Tibetan names; periods for
  names like `J. R. Smith`.
- **Word limit is 6.** This check exists to catch a pasted sentence, not long names —
  `Mary Jane van der Berg` (5 tokens) and `María de los Ángeles García` (5 tokens) are legitimate.
  The 40-character ceiling is what actually stops a sentence.
- `normalizeRealName` strips zero-width characters that arrive with a paste
  (`\u200b-\u200d`, BOM, NBSP) and collapses runs of whitespace into a single space.
- Problems are reported in the order `empty → length → hasDigit → hasSymbol → noLetter →
  tooManyWords`. Digits come before symbols because "no digits" is the more useful message for `abc123`.

### Residence: pick the country first, then a city belonging to it

`src/lib/geo.ts` is the single source for the country → city registry. **Cities are stored as
Latin proper nouns** (`Shanghai` / `Moscow` / `Tokyo`) rather than i18n keys, for three reasons:

1. the seed data is already in that shape, so keying them would mean migrating history;
2. `profiles.city` is rendered directly in **five places** (catalogue card, member detail, landing regions);
3. one member's city has to stay the same string across UI languages — otherwise the same city
   becomes two different values and filtering by city silently misses people. The accepted cost is
   that a Chinese UI shows `Shanghai`.

The two levels are **one component** (`components/onboarding/country-city-field.tsx`) rather than
two independent fields, so the invariant "changing the country clears a city that does not belong
to it" has exactly one implementation. Without it the database could hold
`country = GB, city = Shanghai` and country filtering would silently drop that member.
The server cannot merely check "the country is in the list": the city arrives as a hidden field,
so `countryCode=GB&city=Shanghai` can be forged. Both are validated together via `isKnownCity`.

It is a **native `<select>`** (`components/ui/native-select.tsx`), not the base-ui popup: the main
battlefield is mobile H5 (the in-app WeChat browser), the country list is 15 entries and city
lists at most 8, so the system wheel, inertia and first-letter jump come for free, and form
integration is just `name` / `value` / `onChange`.

### Interests and about-me move to step 2

`interests` and `bio` moved from step 1 to step 2. That introduces a regression risk worth
handling explicitly: step 1's form **no longer contains** those two fields, so if its save action
happened to write those columns, every re-submit of step 1 would blank out whatever the member
filled in at step 2. `saveProfileBasics` therefore **deliberately omits** `interests` / `bio` from
its SQL (a comment locks this down), and a dedicated end-to-end assertion guards it.

### One fact, one place (migration 0008)

`profile_attributes` used to carry its own `country_code` / `city`, fully duplicating the columns on
`profiles`. The read path was `attr_country_code ?? country_code ?? ""` (attributes first, main
table as fallback), but those attribute columns were `not null default ''` — and **an empty string
is not NULL**, so `??` never fell through and a member's saved residence displayed as blank.
`db/migrations/0008_attributes_move.sql` drops the two duplicates. Before applying it I verified
that all 7 attribute rows matched the main table row for row, so **no data was lost**; the
justification and the verification result are recorded in the migration's `comment on column`.
Residence now has exactly one source: `profiles.country_code` / `profiles.city`.

### Field ownership at a glance

| Field | Table | Written by |
| --- | --- | --- |
| Real name / gender / date of birth | `profiles.display_name` / `gender` / `birth_date` | Step 1 |
| Country + city of residence | `profiles.country_code` / `city` | Step 1 |
| Photos / avatar | `profiles.photo_urls` / `avatar_url` | Step 1 |
| Interests | `profiles.interests` | **Step 2** |
| About me | `profiles.bio` | **Step 2** |
| Height / weight / education / occupation / marital status / children / languages / lifestyle / faith / assets | `profile_attributes` (13 columns) | **Step 2** |

Step 2 wraps the `profile_attributes` upsert and the `profiles` update of `interests` / `bio` in a
**single transaction** (`transaction`, exported from `lib/db/pool.ts`), so it cannot half-succeed.

Every enum in either step is whitelist-validated through `lib/profile/form.ts`
(`readChoice` / `readChoiceList` / `readInteger`); `readInteger` returns `null` when out of range
rather than clamping — silently storing 250 would make the member believe they had filled it in.

---

## Scripts

```bash
npm run dev            # B2C on :3000
npm run dev:partner    # B2B on :3001, separate build directory
npm run dev:all        # both at once
npm run build          # production build
npm run start          # production server
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run format         # Prettier, writing
npm run format:check   # Prettier, checking

npm run db:migrate     # create / apply migrations
npm run db:seed        # load the demo dataset (idempotent)
npm run db:reset       # truncate, then reseed
npm run db:status      # dry-run the migrations and report what is outstanding
```

First run: see the setup steps in [`db/README.md`](db/README.md) (written in Chinese).

Conventions:

- Path alias `@/*` → `src/*` (`tsconfig.json`).
- Prettier ships `prettier-plugin-tailwindcss`, which sorts class names against `globals.css`; `.md` is not in scope.
- shadcn configuration lives in `components.json` (style `base-nova`, lucide icons, CSS variables).
- `@base-ui/react` controlled-component quirks: `RadioGroup` takes `value` / `onValueChange`, `Checkbox` takes `checked` / `onCheckedChange`.
- Next.js writes `.next-partner/types/**/*.ts` into the `include` array of `tsconfig.json` by itself; that is expected.

---

## Still to replace

The database is wired up; what remains is peripheral.

| Location | Today | Todo |
| --- | --- | --- |
| `lib/auth/*` + `lib/db/auth.ts` | Member sign-in already accepts **code or password**, with passwords stored as **salted scrypt hashes** (never plaintext) — but the **session is still an unsigned cookie** | Signed session tokens (`httpOnly` + `Secure` + rotation) |
| Verification codes in `lib/db/auth.ts` | Stored in clear and echoed to the client | Salted hashes plus a real SMS / email provider and per-recipient send throttling |
| Password handling in `lib/auth/*` | Length, complexity and identifier-containment checks — but **no attempt limit** | Failed-attempt counters and lockout, a breached-password check, plus change-password and reset flows |
| `app/api/uploads/*` + `lib/uploads.ts` | Writes to the **local filesystem**, guarded only by magic-byte and path-whitelist checks | Object storage (S3/OSS-compatible, keys plus signed URLs); image re-encoding to strip EXIF and any embedded payload; content moderation |
| `lib/partner/{constants,session,actions}.ts` | Hard-coded credentials | A partner identity service plus rate limiting and lockout |
| `lib/chat-client.ts` | 4-second polling | SSE / WebSocket push |
| `components/partner/apply-form.tsx` | `handleSubmit` is a local stub | `POST /partners/applications`, with server-side rate limiting and a captcha (the endpoint is public by definition) |
| `components/agent/promo-tools.tsx` | Referral link and promo codes are placeholders | The referral tooling API |
| Orphaned files under `var/uploads/` | Uploading a photo and never saving the profile leaves an unreferenced image | A sweep job keyed on `mtime` plus reference counts |
| The country/city lists in `lib/geo.ts` | A **front-end built-in dictionary** (15 countries plus their cities), so any change needs a release | Serve the dictionary from the backend (configurable, addable and removable), leaving the front end as a fallback cache |
| `lib/profile/name.ts` | Checks **format only**; it cannot tell whether the name really belongs to the person | Tie into national identity-document checks / liveness verification (the KYC step) |
| `getMember` in `lib/db/members.ts` | The step-2 page reads the whole member view just to get `countryCode` / `city` | Split out a narrow attributes-only query |
| `db/migrations/*` | Schema and business rules are in place | Before production: partitioning by data-subject residency, plus backups and a restore drill |

---

## Related documents

- `PRD.md` — the product requirements and tech-stack baseline, including the sitemap and the core rules.
- `db/README.md` — schema overview, setup steps, handy SQL and a glossary (Chinese).
