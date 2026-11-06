# Sophia Forum CMS: Faculty and HOD architecture (planning document)

**Revision 6, 2026-11-05 (archive correction):** the archive statement of Revision 5 is corrected below, and references to deleted QA files are marked as archived in the §2 source table and in §14.3, §18.7 and §18.10.
**Revision 5, 2026-11-05 (repository freeze):** previous-project references removed; current names updated (demo cookie `sophia_demo_session`, demo store `sophia-demo-store-v1`, no third-party image hosts). Historical records cited below (`qa/sophia-migration/`, `qa/sophia-plan/`, `qa/sophia-content/`, `qa/pce-audit/`, the planning-era `qa/suites/` scripts, `qa/phase6a–6c/`, `qa/ingenious-backup/`, the earlier root reports such as `FINAL_QA_REPORT.md`, and the superseded `supabase/held/` migrations) were removed from the repository and are kept in the external project archive `sophia-forum-archive-2026-11-05/`, at the same relative paths. The only exception is `qa/suites/lib/cdp.mjs`, which stays in the repository because the `qa/cms-*` suites import it. The active migrations are only those in `supabase/migrations/`, and the active tests are in `tests/` and `qa/cms-*`.

> **Archive note (factual record).** The cleanup removed 1,397 tracked files. When they were removed, only 841 had an external copy, in `sophia-forum-archive-2026-11-05/` (the quarantine folder `sophia-cleanup-quarantine/` holds only untracked browser profiles). The remaining 556 files, which included all of `qa/pce-audit/`, `qa/suites/` (except `lib/cdp.mjs`), `qa/phase6a–6c/` and `qa/ingenious-backup/`, were then recovered byte-for-byte from Git history (commit `eec6d49`) into the same archive. Each recovered file was verified against its original Git blob: 556 recovered, 556 verified, 0 failures. All 1,397 now exist outside the repository. The record of this recovery is `RECOVERY_MANIFEST_2026-11-05.tsv` and `RECOVERY_README_2026-11-05.md` in the archive root. Archived material is not part of the distributable project.

**Revision 4, 2026-11-01:** P1 applied to staging and closed (§19.12).
**Revision 3, 2026-11-01:** P1 decisions D1–D5, the six corrections from the P1 review, and the P1 implementation record added (§19). The SQL in `supabase/migrations/` is now authoritative where it differs from the draft SQL in §5, §6.2, §8.2 and §9.2.
**Revision 2, 2026-11-01:** locked decisions recorded (§0), and P0 implementation readiness added (§18). Revision 1 (same day) was the initial architecture plan.

**Status (revision 4):**
- **P0 complete:**
  - Git baseline `f7e922f`;
  - Supabase client dependencies `6b17865`;
  - staging project `sophia-cms-staging` confirmed.
- **P1 complete on staging only** (§19.12):
  - migrations 1–6 applied on 2026-11-01;
  - schema verification 14 true / 2 expected false;
  - database tests 57/57 PASS;
  - pre- and post-P1 backups taken and verified.
- **Migration 7 (storage) is still held** in `supabase/held/`. No bucket or storage policy exists.
- **Production has never been connected to**, and no production project exists yet.
- **Unchanged:** no application code, frontend, auth setting or M3 content was changed. Nothing was built, served or deployed.

**Audience:** the project owner and future implementers.

**How to read this document:**
- **[VERIFIED]** marks facts read from the project as it is today; file and line references are given.
- **[LOCKED]** marks decisions made by the owner on 2026-11-01.
- **[PROPOSED]** marks architecture that does not exist yet and needs separate approval.
- **[DECISION]** marks a choice still open.
- **[MANUAL]** marks an action only the owner can take (accounts, credentials, approvals).

---

## Contents

0. Locked decisions
1. Verified facts about the current project
2. Requirements and constraints
3. Backend options compared
4. Target architecture
5. Data model
6. HOD as a faculty record, and the single active HOD
7. Authentication (one pre-created admin)
8. Authorization
9. Image storage and uploads
10. APIs
11. Moving from the demo store to real persistence
12. Backups and rollback
13. Security checklist
14. Files likely to change
15. Phased implementation and testing roadmap
16. Open decisions
17. Risks
18. **P0 implementation readiness**
19. **P1 database foundation: decisions, corrections and implementation record**

---

## 0. Locked decisions [LOCKED, 2026-11-01]

| # | Decision | Consequence in this plan |
|---|---|---|
| L1 | **Backend: a new Sophia-owned Supabase project** | §3 option A is chosen. Options B–E are kept for the record only. |
| L2 | **Authentication: one pre-created Admin account, email + password** | One `admin` user, created by the owner (§18.5). No manager accounts in this release. The `manager` value stays in the role type for later, but is unused. |
| L3 | **Public sign-up disabled** | Both Supabase projects have sign-ups turned off (§18.2). There is no sign-up UI, and none is added. |
| L4 | **Secure server-verified sessions; protected backend operations** | httpOnly cookie sessions verified on the server; every write is checked server-side and by RLS (§7, §8) |
| L5 | **The existing Sophia Admin Dashboard is the permanent interface; no separate dashboard or redesign** | R1/R2 (§2). All CMS work happens inside `/admin/faculty` and the existing shell. |
| L6 | **CMS scope: Faculty and HOD management only** | Events, Gallery, Team and Users keep today's demo store (localStorage) and are **not** connected to the backend in this release (§11.4) |
| L7 | **HOD and Principal messages may both be supported only if existing UI slots permit it without UI changes** | Assessed in §5.5. **Result: the public site has exactly one message slot, and the admin has no non-faculty editor, so release 1 supports the HOD message only.** The Principal message is deferred. |
| L8 | **Faculty and HOD photo uploads are included in the first usable CMS release** | Storage bucket, policies, upload endpoint, and an image field in the existing Faculty form (§9). The upload control is a visible addition inside the existing dialog, so its exact form needs approval (§9.4, §16 D9). |
| L9 | **No reuse of another project's Supabase credentials, database or storage** | Nothing from a previous project (its Supabase URL, keys, data or storage) may appear in config, code, scripts or docs used by the app (§13) |

---

## 1. Verified facts about the current project [VERIFIED]

### 1.1 Stack

| Fact | Source |
|---|---|
| Next.js App Router, React 19, TypeScript, Tailwind 3, framer-motion, lucide-react. Installed Next.js is 15.5.28. | `package.json`; build log `qa/sophia-migration/qa-fixture-fix/full-run/build.log` (archived) |
| **No backend, database, auth or upload dependency** | `package.json` (dependencies: `clsx`, `framer-motion`, `lucide-react`, `next`, `react`, `react-dom`, `tailwind-merge`) |
| Remote images are allowed only from `img.youtube.com` and this project's Supabase storage (`site-media`) | `next.config.ts` (`images.remotePatterns`) |
| `/about`, `/admin` and every `/admin/*` screen are prerendered static pages (○). The admin screens are client components. | Production build, 2026-10-31 (`build.log`) |
| The frozen files include `src/lib/**`, `src/hooks/**`, `src/components/ui/**`, `src/middleware.ts`, `next.config.ts`, `package.json` and `package-lock.json` | `qa/pce-audit/scripts/static-fingerprint.cjs` (`FROZEN`; archived) |
| `.gitignore` ignores `.env*.local` (and `.vercel`, `*.pem`). **A plain `.env` file is not ignored.** | `.gitignore` |
| The project folder is **not a git repository** | Session environment |
| On the development machine: Node v24.19.0. **Docker is not installed.** Supabase CLI 2.122.0 runs via `npx` (not installed in the project). **`pg_dump`/`pg_restore`/`psql` 18.6 are installed at `D:PostgreSQLin`** (a system PostgreSQL 18 service), but **not on PATH**; an earlier PATH-only check wrongly reported them absent. | `node -v`; `docker --version` (not found); `npx supabase@2.122.0 --version`; `D:PostgreSQLinpg_dump.exe --version` |

### 1.2 The dashboard UI (to be preserved)

| Component | What it does today | Source |
|---|---|---|
| `AdminShell` | Admin frame: demo notice, breadcrumb, "<Section> Manager" heading, BACK TO SITE and sign-out, section tabs from `ADMIN_TABS` (Overview, Events, Gallery, Team, **Faculty**, Users [admin only]). Redirects to `/login` without a session. `RequireRole` shows a role-denied card. | `src/components/admin/AdminShell.tsx` (lines 12–19, 130) |
| `CrudManager<T>` | Generic, **data-agnostic** manager: search, table, ADD dialog, edit dialog, field validation, delete confirmation. Props `items`, `onChange(items)`, `fields: FieldSpec[]`, `columns`, `titleField`, `createItem`, `validate?`, `deleteBlockedReason?`. | `src/components/admin/CrudManager.tsx` lines 9–47 |
| `CrudManager` save paths | Create, update, inline patch and delete are separate paths that each end in a call handing back the **whole array** | `CrudManager.tsx` lines 244, 274, 281 |
| `CrudManager` field types | `text`, `textarea`, `select`, `number`, `date`, `url`, `email`, `checkbox`, `tags`. **There is no file or upload type.** | `CrudManager.tsx` lines 9, 104 |
| Delete dialog text | "…will be removed from this browser's demo data. The public site is not affected." | `CrudManager.tsx` line 413 |
| Faculty Manager | `/admin/faculty`: name\*, id (create only), designation\*, department, **Photo URL\* (required)**, quote, sortOrder\*. New records default to department "Computer Science & Engineering". The table shows #, Name, Designation, Quote. **There is no LinkedIn field.** | `src/app/admin/faculty/page.tsx` |
| Overview | Counts per collection (the Faculty card says "mentors") and "Reset demo data" | `src/app/admin/page.tsx` lines 12–26, 79 |
| Login screens | `LoginForm`, `LoginPanel`, `LoginModal`, `AccountButton`, `/login` | `src/components/auth/*`, `src/app/login/page.tsx` |
| Initials fallback | `FallbackImage` shows initials when `src` is empty or fails | `src/components/ui/FallbackImage.tsx` |

### 1.3 Demo data and demo authentication (to be replaced for Faculty/HOD)

| Fact | Source |
|---|---|
| **Data seam.** Every manager page reads with `useDemoCollection(key)` and writes with `setDemoCollection(key, items)` | `src/lib/demoStore.ts`; `src/app/admin/*/page.tsx` |
| The demo store lives in the browser's localStorage (`sophia-demo-store-v1`; rebuilt once when the seed changes) | `src/lib/demoStore.ts` |
| **Demo auth.** Public demo accounts (`admin@demo.local`, `manager@demo.local`). The session is a readable cookie `sophia_demo_session` ("role\|email"). | `src/lib/demoAuth.ts` lines 24–29 |
| The middleware's own comment: "The demo cookie is forgeable; this is a UX guard, not access control." | `src/middleware.ts` |
| The client session comes from `useDemoSession()`, used by `AdminShell`, `AccountButton`, `LoginPanel`, `Navbar`, `admin/page.tsx` and `admin/users/page.tsx` | `src/hooks/useDemoSession.ts`; import search |
| **Public pages never read the dashboard.** `FacultyGrid` imports `STATIC_FACULTY`; `PrincipalCard` imports `PRINCIPAL_INFO`. | `FacultyGrid.tsx` line 3; `PrincipalCard.tsx` line 2 |
| `PRINCIPAL_INFO` is a single object (name, designation, image, quote) with **no manager**. `PrincipalCard` is the **only** message slot on the public site, with the screen-reader heading "A word from the Principal". | `src/data/staticFaculty.ts` lines 12–18; `PrincipalCard.tsx` |
| `FacultyMember` = `{ id, name, designation, department?, image, quote?, linkedin?, sortOrder }` | `src/data/staticFaculty.ts` lines 1–10 |

### 1.4 Precedent and related records

| Fact | Source |
|---|---|
| Department faculty photos are PCE-hosted, with **no permission to reuse** them | `qa/sophia-plan/sources/pce-official-extract.md` §7 (archived, see the note at the top) |
| The HOD biography must not be used as a quote. The message must be the person's own approved words. | `qa/sophia-migration/M3-prep/M3_DECISION_RECORD.md` §5 (archived) |

---

## 2. Requirements and constraints

| # | Requirement | Origin |
|---|---|---|
| R1 | The existing dashboard is the only CMS UI; no separate admin panel | L5 |
| R2 | Preserve `AdminShell`, the Faculty Manager, `CrudManager`, the login screens and the overall UI; no redesign | L5 |
| R3 | Faculty and HOD management live inside `/admin/faculty` and the existing `ADMIN_TABS` | L5, L6 |
| R4 | Real authentication and persistent storage for Faculty/HOD | L2–L4 |
| R5 | Only one active HOD at any time | User |
| R6 | A published HOD message is the HOD's own approved words; no biography as a quote | Decision record §5 |
| R7 | Visible changes only with approval (UI freeze). Additions inside the existing form reuse the existing field components and styles. | UI freeze |
| R8 | The public site keeps working if the backend is unreachable | Precedent |
| R9 | No backend, credentials or assets of another project; no PCE-hosted photos without permission | L9, §1.4 |
| R10 | Photo uploads for Faculty and HOD in release 1 | L8 |
| R11 | Both messages only if existing slots allow without UI change | L7 (§5.5) |

---

## 3. Backend options compared

**Chosen: A (L1).** The comparison is kept for the record.

| Option | Data and constraints | Auth and roles | Images | Separate admin UI? | Effort | Assessment |
|---|---|---|---|---|---|---|
| **A. Supabase (PostgreSQL + Auth + Storage + RLS)** | Full SQL: unique partial index for one HOD, checks, transactions | Built in; role via `profiles` + RLS | Built-in buckets with policies | No (its dashboard is for operators only) | Low; official Next.js SSR helper `@supabase/ssr`; SQL migrations in the repo | **Chosen.** Same model as the original site; standard PostgreSQL underneath (portable). |
| B. PostgreSQL (e.g. Neon) + Auth.js + S3-compatible storage | Full SQL | Assembled; more code to secure | Separate service | No | Medium to high | Sound, least lock-in, more moving parts |
| C. Firebase | Document store; one HOD only via transactions or rules | Built in | Built in | No | Low to medium | Weaker integrity guarantees |
| D. Headless CMS (Strapi, Payload, Sanity, Directus) | Varies | Built in | Built in | **Yes** | Medium | Conflicts with R1/R2 |
| E. Git-based CMS (Decap, Tina) | Repo files | Git host | Repo or external | **Yes** | Low runtime cost; every edit rebuilds | Conflicts with R1 |

**To verify on the Supabase pricing and docs pages when creating the projects** (nothing is assumed here):
- free-plan inactivity pausing;
- the number of free projects allowed;
- backup retention per plan;
- storage, bandwidth and upload size limits;
- the available regions.

R8 makes the public site independent of backend availability.

---

## 4. Target architecture [PROPOSED]

```
 Admin (browser): existing /admin UI           Visitors (browser): existing public pages
   │                                             │
   ▼                                             ▼
 Next.js server ─────────────────────────────────────────────────────────────
   • middleware: refreshes and verifies the Supabase session for /admin/**
   • /api/admin/faculty/**, /api/admin/hod-messages/**, /api/admin/uploads/**
       route handlers: verified session + admin role + validation, then DB/Storage
   • after each write: revalidatePath("/about")
   • /about: server components read PUBLISHED data (static + on-demand revalidation),
     falling back to src/data when the backend is unreachable
   │ server-side Supabase client acting AS THE SIGNED-IN USER (publishable/anon key + session cookie)
   ▼
 Supabase project "sophia-cms-prod" (Sophia-owned; separate "sophia-cms-staging" for tests)
   • PostgreSQL: profiles, faculty, hod_messages, audit_log (RLS on every table)
   • Auth: email + password, sign-up disabled, one admin user
   • Storage: bucket faculty-photos (public read; admin write; type and size limits)
```

**Principles:**
1. **The UI stays and only the data source changes** (Faculty Manager only, L6).
2. **All writes go through the Next.js server**, as the signed-in user, so RLS applies. **The app runtime never needs the secret/service-role key** (§18.3).
3. **The public site reads only published data,** with the static fallback (R8).

---

## 5. Data model [PROPOSED]

> **Revision 3:** the draft SQL in this section is superseded by `supabase/migrations/20261101000001`–`…07` and by the corrections in §19.2. The concepts are unchanged.

### 5.1 `profiles` (one admin in this release)

```sql
create type public.app_role as enum ('admin', 'manager');   -- 'manager' reserved, unused in release 1 (L2)
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         public.app_role not null,
  created_at   timestamptz not null default now()
);
```

### 5.2 `faculty`

```sql
create table public.faculty (
  id            text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   -- same rule as CrudManager SLUG_PATTERN
  name          text not null check (length(trim(name)) > 0),
  designation   text not null check (length(trim(designation)) > 0),
  department    text not null default 'Artificial Intelligence & Data Science',
  image_path    text,                       -- storage object path; null → initials (FallbackImage)
  image_consent text,                       -- where permission for the photo came from (required when image_path is set)
  linkedin      text check (linkedin is null or linkedin ~ '^https://'),
  quote         text,                       -- only a person's own approved words
  sort_order    integer not null check (sort_order >= 0),
  is_published  boolean not null default false,
  is_active_hod boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  check (image_path is null or image_consent is not null)
);
create unique index faculty_one_active_hod on public.faculty (is_active_hod) where is_active_hod;   -- §6
```

**Mapping to the TypeScript type:**

| TypeScript (`FacultyMember`) | SQL column |
|---|---|
| `image` | the public URL of `image_path` (`""` when null) |
| `sortOrder` | `sort_order` |
| — (new, optional) | `isPublished`, `isActiveHod` |

The public components keep receiving today's shape.

### 5.3 `hod_messages`

```sql
create type public.message_status as enum ('draft', 'approved', 'published', 'archived');
create table public.hod_messages (
  id          uuid primary key default gen_random_uuid(),
  faculty_id  text not null references public.faculty(id) on delete restrict,
  message     text not null check (length(trim(message)) > 0),
  status      public.message_status not null default 'draft',
  approved_by text,      -- who confirmed the wording is the HOD's own; required for approved/published
  approved_on date,
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  check (status in ('draft', 'archived') or (approved_by is not null and approved_on is not null))
);
create unique index hod_messages_one_published on public.hod_messages (status) where status = 'published';
```

**Public rule:** `PrincipalCard` shows the single `published` message, only when its `faculty_id` is the active HOD. It uses that faculty record's name, designation and photo. Otherwise it shows the static fallback.

### 5.4 `audit_log`

```sql
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null, record_id text not null,
  action text not null check (action in ('insert','update','delete')),
  actor uuid, at timestamptz not null default now(),
  before jsonb, after jsonb
);   -- filled by AFTER triggers on faculty and hod_messages
```

### 5.5 HOD and Principal messages: can both be supported without UI changes? (L7)

| Slot | Exists today? | Finding |
|---|---|---|
| Public message slot | **One:** `PrincipalCard` on `/about` (one quote card) [VERIFIED] | Two messages at once would need a second card, which is a UI change. **Not allowed** (L7). |
| Admin editor for an HOD message | The Faculty Manager edits faculty records; the HOD is a faculty record | Fits, with fields added to the existing dialog using existing field types (textarea, checkbox), subject to R7 approval |
| Admin editor for a Principal message | **None.** The Principal is not in the department faculty list. | It would need either a fake faculty record (which would also appear in the public faculty grid) or a new editor. Both are UI or behaviour changes. |

**Conclusion [LOCKED by L7]:**
- **Release 1 supports the HOD message only.**
- **The Principal message is deferred.** It can be added later only as an approved change (for example, a choice of which single message the one card shows, plus an editor), or not at all.
- The existing screen-reader heading "A word from the Principal" (`PrincipalCard.tsx`, sr-only, not visible) would need a text change to match an HOD message. This is a non-visual text change to note at approval.

---

## 6. HOD as a faculty record, and the single active HOD [PROPOSED]

### 6.1 Options

| Option | Description | Assessment |
|---|---|---|
| H1 | Flag and message both on the faculty row | Simplest, but no history; an HOD change must destroy or move the message |
| **H2 (chosen for planning)** | `faculty.is_active_hod` flag + a separate `hod_messages` table | One source of truth for the person; history and an approval trail; an HOD change archives the old message. Managed in the existing Faculty Manager. |
| H3 | A separate HOD table copying name and photo | Duplicates personal data; contradicts R3 |

### 6.2 Four layers of enforcement

> **Revision 3:** layer 2 is implemented with **column privileges** instead of a guard trigger (§19.2 C3). Both switch functions also take an advisory lock so concurrent calls run in sequence (§19.3).

1. **Database invariant:** `faculty_one_active_hod`, a unique partial index. A second active HOD is impossible, even under concurrent requests.
2. **Atomic switch:** `set_active_hod(p_faculty_id)`, a `security definer` function with `search_path = public`.
   - It requires `app_role() = 'admin'`.
   - It clears the old flag, sets the new one and archives a published message of the previous HOD, all in one transaction.
   - A guard trigger rejects any direct change to `is_active_hod` made outside this function.
3. **Server:** `POST /api/admin/faculty/{id}/hod` calls the function and returns errors in `CrudManager`'s `Errors` shape.
4. **Existing UI hooks:**
   - `validate` (an existing prop) warns immediately if another record is the HOD. The Events Manager's "only upcoming events can be featured" rule is the same pattern.
   - `deleteBlockedReason` (an existing prop) blocks deleting the active HOD.

**Edge cases covered:** no HOD (fallback shown); a new HOD (the old message is archived); deleting the HOD (blocked); concurrent switches (one wins); a draft never shown publicly.

---

## 7. Authentication: one pre-created admin [LOCKED L2–L4; details PROPOSED]

| Aspect | Design |
|---|---|
| Method | Supabase Auth, email + password |
| Accounts | **Exactly one admin account, pre-created by the owner** in the Supabase dashboard (§18.5). No invitations, no self-service accounts, **sign-up disabled** (L3). |
| Session | `@supabase/ssr` cookie session (httpOnly, Secure in production, SameSite=Lax), refreshed in the middleware. **It replaces the demo cookie (`sophia_demo_session`)** for the admin area. |
| Server verification | Every protected server operation calls `supabase.auth.getUser()`, which verifies the token with Supabase rather than trusting cookie content, and then checks `profiles.role = 'admin'` |
| Middleware | `src/middleware.ts` refreshes the session and redirects signed-out visitors to `/login?next=…` (today's behaviour). `safeAdminPath` is kept as the open-redirect guard. **The middleware is a convenience; the server checks are the security boundary.** |
| Client session hook | Same return shape as `useDemoSession()` (`{ email, name, role } \| null`), so `AdminShell`, `AccountButton`, `LoginPanel` and `Navbar` keep their logic |
| Login screens | Markup unchanged. `findDemoAccount` + `signInDemo` become `signInWithPassword`; `signOutDemo` becomes `signOut`. The demo credentials text (`DemoNotice` in `LoginForm`) is removed or reworded: a visible **text** change (R7). |
| Demo accounts | **Removed when real auth goes live.** `admin@demo.local` / `manager@demo.local` stop working. The non-CMS sections (§11.4) are reached with the real admin session. |
| Hardening | Supabase's built-in sign-in rate limits; a generic error message ("Email or password is incorrect"); a strong password set by the owner; MFA (TOTP) **recommended** for the single admin (an owner decision, D2); session lifetime per Supabase settings |
| Lost access | Recovery through the Supabase dashboard (the owner resets the password or creates a replacement user and `profiles` row). No in-app recovery flow in release 1 (it would add UI). |

---

## 8. Authorization [PROPOSED]

### 8.1 Role matrix (release 1)

| Action | Visitor (anon) | admin |
|---|---|---|
| Read published faculty, photos and the published HOD message | ✔ | ✔ |
| Read unpublished faculty and draft messages | — | ✔ |
| Create, edit and delete faculty; publish or unpublish | — | ✔ |
| Upload, replace and remove photos | — | ✔ |
| Set the active HOD; draft, approve and publish the HOD message | — | ✔ |

### 8.2 Enforcement

> **Revision 3:** RLS is enabled, and explicit grants are set, **in the migration that creates each table** (§19.2 C2, C4). The SQL below is the draft; the migrations are authoritative.

```sql
create function public.app_role() returns public.app_role
  language sql stable security definer set search_path = public
  as $$ select role from public.profiles where user_id = auth.uid() $$;

alter table public.faculty      enable row level security;
alter table public.hod_messages enable row level security;
alter table public.profiles     enable row level security;
alter table public.audit_log    enable row level security;

create policy faculty_public_read on public.faculty for select to anon, authenticated using (is_published);
create policy faculty_admin_all   on public.faculty for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

create policy hod_public_read on public.hod_messages for select to anon, authenticated using (status = 'published');
create policy hod_admin_all   on public.hod_messages for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

create policy profiles_self_read on public.profiles for select to authenticated using (user_id = auth.uid());
-- no insert/update/delete policies on profiles: rows are created by the owner in the SQL editor (§18.5)

create policy audit_admin_read on public.audit_log for select to authenticated using (public.app_role() = 'admin');
-- audit rows are written only by security-definer triggers
```

**The `manager` role** has no policies in release 1, so a future manager account could do nothing until policies are added deliberately.

**UI controls are not the security boundary.** `RequireRole` and the `adminOnly` tabs only hide things.

---

## 9. Image storage and uploads (in release 1, L8) [PROPOSED]

### 9.1 Bucket

| Setting | Value |
|---|---|
| Name | `faculty-photos` |
| Public | **Yes (read).** Photos are shown on the public About page. Object URLs have the form `https://<project-ref>.supabase.co/storage/v1/object/public/faculty-photos/<path>`. |
| File size limit | **2 MB** (bucket setting, also checked on the server) |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`. **No SVG, no HEIC** (convert before upload). |
| Path scheme | `faculty/<faculty_id>/<random-uuid>.<ext>`. Each upload gets a new name (cache-safe). The old object is deleted after the record update succeeds. |

### 9.2 Storage policies (on `storage.objects`)

> **Revision 3:** an admin **select** policy is added (§19.2 C5), and all four policies are restricted to paths under `faculty/`. See migration `…07`.

```sql
create policy faculty_photos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'faculty-photos' and public.app_role() = 'admin');
create policy faculty_photos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'faculty-photos' and public.app_role() = 'admin');
create policy faculty_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'faculty-photos' and public.app_role() = 'admin');
-- public read comes from the bucket being public; no anon write policy exists
```

### 9.3 Upload flow

1. The admin selects a file in the Faculty form.
2. The browser posts it to `POST /api/admin/uploads/faculty-photo` with the faculty id.
3. The server:
   - verifies the session and admin role;
   - checks the type by content sniffing, not just the file extension;
   - checks the size;
   - generates the path;
   - uploads it as the user (RLS applies);
   - returns `image_path`.
4. Saving the form stores `image_path` and `image_consent` on the record.
5. The previous object is removed.
6. `/about` is revalidated.

**Hosting caveat:** some hosts cap request bodies (for example, about 4.5 MB on Vercel serverless functions). That doesn't matter with a 2 MB limit, but confirm it for the chosen host (D7). The alternative is a signed upload URL issued by the server, so the file goes straight from the browser to Storage.

### 9.4 UI impact (needs approval, R7)

`CrudManager` has no file field type [VERIFIED]. Release 1 needs one new **field type, `image`**, rendered inside the existing dialog:
- a file input styled with the existing `inputClass`;
- the current photo previewed with the existing `FallbackImage` (initials when none);
- a "remove photo" action;
- no new layout, colours or components beyond that control.

This is the **only new control** release 1 needs. The other additions use existing field types:

| Addition | Existing field type |
|---|---|
| Consent source | `text` |
| LinkedIn | `url` |
| Published | `checkbox` |
| Active HOD | `checkbox`, calling the HOD endpoint |
| HOD message and its approval fields | `textarea`, `text`, `date`, `select` |

**[DECISION D9]** Approve the exact field list and the image control before P4.

### 9.5 Display

- `next.config.ts` `remotePatterns` gains `{ protocol: "https", hostname: "<prod-project-ref>.supabase.co", pathname: "/storage/v1/object/public/faculty-photos/**" }`, plus the staging host during testing. This is a frozen-file change.
- `next/image` optimises the photos.
- Rights: only photos with permission (`image_consent` is required). PCE-hosted photos are not copied without permission.

---

## 10. APIs [PROPOSED]

Route handlers (recommended, because they can be tested directly with `fetch`; **D8** confirms). All are admin-only.

| Method and path | Purpose |
|---|---|
| `GET /api/admin/faculty` | All records, including unpublished, sorted by `sort_order` |
| `POST /api/admin/faculty` | Create. Returns the saved record, or `{ errors: { field: message } }` (400). |
| `PATCH /api/admin/faculty/{id}` | Update, including the publish toggle |
| `DELETE /api/admin/faculty/{id}` | Delete. 409 if it is the active HOD. Its photo object is deleted as well. |
| `POST /api/admin/faculty/{id}/hod` | Make it the active HOD (`set_active_hod`) |
| `GET / POST /api/admin/hod-messages`, `PATCH /api/admin/hod-messages/{id}` | Draft, approve, publish and archive the HOD message |
| `POST /api/admin/uploads/faculty-photo` | Upload (§9.3) |

**Shared rules:**
- Server validation mirrors `FieldSpec` (required, slug, `https://` URLs, numbers).
- Errors come back in `CrudManager`'s `Errors` shape.
- Each write produces an audit entry (trigger) and `revalidatePath("/about")`.
- Responses never include tokens or secrets.
- A same-origin check guards the state-changing methods.

---

## 11. Moving from the demo store to real persistence [PROPOSED]

### 11.1 The seam

```tsx
// today
const faculty = useDemoCollection("faculty");
<CrudManager items={sorted} onChange={(next) => setDemoCollection("faculty", next)} … />
// release 1
const { items, create, update, remove, pending } = useCmsFaculty();
<CrudManager items={sorted} onCreate={create} onUpdate={update} onDelete={remove} … />
```

- `CrudManager` gains **optional** `onCreate`, `onUpdate` and `onDelete` callbacks that return a promise, at its three existing save paths.
- `onChange` remains for the screens still on the demo store.
- The pending state and server errors use the existing error and disabled styles (R7).

### 11.2 Cut-over

1. A mode flag, `CMS_FACULTY_MODE = demo | backend`, default `demo` until go-live.
2. **Seed:** the `faculty` table is loaded once from the confirmed M3 faculty list in `src/data/staticFaculty.ts`, after the department's confirmation (M3-4), with a reviewed seed script that has a dry-run mode.
3. **Browser demo data is not imported.** The `sophia-demo-store-*` keys stay untouched in every browser.
4. **Public `/about`:** `FacultyGrid` and `PrincipalCard` become async server components that read published data. The markup is identical, with a fallback to `src/data`.

### 11.3 Option A

The Option A demo store stays in use for the non-CMS sections, and for Faculty while `CMS_FACULTY_MODE=demo`. With Faculty in backend mode, the faculty data on the demo dashboard is no longer read from localStorage. Option A itself is unchanged.

### 11.4 Non-CMS sections in release 1 (L6)

- **Events, Gallery, Team and Users keep the demo store.** They are reached through the real admin session.
- Their screens and the existing demo notices must say clearly that those sections are demo-only.
- The `AdminShell` notice text becomes something like "Faculty is live; Events, Gallery, Team and Users are a local demo." That is a text change (R7).
- The **Users** screen keeps showing mock accounts. It must not suggest that it manages the real admin login, so its notice text needs a correction (text only).
- "Reset demo data" on the Overview keeps resetting **only the demo store**, never the backend. Its confirmation text must say so (text only).

---

## 12. Backups and rollback [PROPOSED]

### 12.1 Backups

| Layer | Procedure |
|---|---|
| Platform | The plan's automated backups. **Verify on the plan page what the chosen plan includes** (retention, point-in-time). |
| Own database dump | `pg_dump` (or `supabase db dump`) of the `public` schema plus the data, run from the owner's machine or a scheduled job. Uses `SUPABASE_DB_URL` (secret, never in the app). Output encrypted, plus a SHA-256 manifest. |
| Storage | A script lists and downloads `faculty-photos` objects with a server-side secret key, plus a manifest |
| Schema | Versioned SQL migrations in the repo, each with a reviewed rollback script |
| Record level | `audit_log` before and after states |
| Restore drill | Restore the latest dump and storage export into the **staging** project; verify the counts and manifests |
| Retention | At least 30 days of dumps **[DECISION D10]**. Kept off-platform in the owner's chosen location **[MANUAL]**. |

### 12.2 Rollback levels

| Level | Trigger | Action |
|---|---|---|
| 1. Record | Wrong edit | Restore from `audit_log` |
| 2. Feature | Backend fault | Set `CMS_FACULTY_MODE=demo`; `/about` falls back to `src/data`. No data is lost in the database. |
| 3. Code | Faulty release | Restore the pre-implementation snapshot (copies + SHA256SUMS + created-files list, as in `pre-optionA-snapshot/`), then do a clean rebuild |
| 4. Database | Corruption | Restore a verified dump into a fresh project; re-point the environment variables; restore storage from the export |
| 5. Schema | Faulty migration | Run its rollback script; restore from a dump if data was transformed |

---

## 13. Security checklist [PROPOSED]

- **App runtime keys:** only the project URL and the publishable/anon key, which are public by design and safe with RLS. **The secret/service-role key and the database URL are never in the app or in any `NEXT_PUBLIC_` variable.** They are used only by owner-run scripts (seed, backup).
- **Where secrets live:** only in `.env.local` (ignored by git [VERIFIED]) or the host's secret settings. **Never a plain `.env`**, which is not ignored [VERIFIED]. Add `.env.example` with names only, and add `.env` to `.gitignore` in P1 (an approved change).
- **Database:** RLS on every table with default deny. `security definer` functions pin `search_path`.
- **Server checks:** `getUser()` plus a role check on every protected route. Never trust a cookie format or a hidden control.
- **Requests:** same-origin checks on state-changing routes, and SameSite cookies.
- **Uploads:** content-type sniffing, a 2 MB limit, random names, no SVG or HEIC.
- **Output:** React escaping (no `dangerouslySetInnerHTML`).
- **L9:** a repository scan before each release for any other project's Supabase reference and for third-party image hosts. The code must contain neither (the regression suites and `tests/unit/config/production-readiness.test.ts` check this).
- **Demo remnants:** the demo credentials are removed from the client bundle when real auth goes live. Bundle scan: none.
- **Personal data:** only names and designations that are public on the official page. No personal phone numbers or emails.
- **Admin pages:** keep `robots: noindex`.

---

## 14. Files likely to change [PROPOSED]

Scope: Faculty and HOD only (L6). Frozen files need explicit approval.

### 14.1 Modified

| File | Change | Frozen? | Visible? |
|---|---|---|---|
| `src/app/admin/faculty/page.tsx` | Backend data; Photo optional; image upload field; consent; LinkedIn; publish; HOD flag; HOD message fields; default department AI & DS | no | **yes** (approved fields, D9) |
| `src/components/admin/CrudManager.tsx` | Optional per-record async callbacks; the `image` field type (§9.4); server error and pending state; delete-dialog text | no | yes (one new control; text) |
| `src/components/admin/AdminShell.tsx` | Real session; notice text "Faculty live / others demo" | no | text |
| `src/app/admin/page.tsx` | Faculty count from the backend; Reset text clarified; "mentors" label | no | text |
| `src/app/admin/users/page.tsx` | Notice text only (mock accounts ≠ real admin login) | no | text |
| `src/components/auth/LoginForm.tsx`, `LoginPanel.tsx`, `AccountButton.tsx` | Real sign-in and sign-out; demo hints removed | no | text |
| `src/components/layout/Navbar.tsx` | Real session hook | no | no |
| `src/components/about/FacultyGrid.tsx`, `PrincipalCard.tsx` | Read published data with a fallback; the sr-only heading text for the HOD (§5.5) | no | no |
| `src/data/staticFaculty.ts` | Seed source and fallback (content per M3; no CMS-driven change) | no | no |
| `src/lib/demoAuth.ts`, `src/hooks/useDemoSession.ts` | Replaced by real-auth equivalents; the demo account list removed | **yes** | no |
| `src/lib/demoStore.ts` | Unchanged in release 1 (still used by the non-CMS sections) | **yes** | — |
| `src/middleware.ts` | Supabase session refresh and redirect | **yes** | no |
| `next.config.ts` | `remotePatterns` for the Supabase storage host(s) | **yes** | no |
| `package.json`, `package-lock.json` | `@supabase/supabase-js`, `@supabase/ssr` | **yes** | no |
| `.gitignore` | Add `.env` (keep `.env*.local`) | no | no |

### 14.2 New

| File | Purpose |
|---|---|
| `src/lib/cms/supabase-server.ts` | Server client (cookies; acts as the signed-in user) |
| `src/lib/cms/supabase-browser.ts` | Browser client (auth calls only) |
| `src/lib/cms/auth.ts` | `requireAdmin()`: `getUser()` + profile role check |
| `src/lib/cms/faculty.ts` | Data access, mapping, validation shared with the API |
| `src/hooks/useCmsFaculty.ts`, `src/hooks/useSession.ts` | Hooks with the demo hooks' shapes |
| `src/app/api/admin/faculty/route.ts`, `src/app/api/admin/faculty/[id]/route.ts`, `src/app/api/admin/faculty/[id]/hod/route.ts` | Faculty API |
| `src/app/api/admin/hod-messages/route.ts`, `src/app/api/admin/hod-messages/[id]/route.ts` | HOD message API |
| `src/app/api/admin/uploads/faculty-photo/route.ts` | Upload API |
| `supabase/migrations/*.sql` (§18.4) and `supabase/rollback/*.sql` | Schema, policies, bucket |
| `supabase/seed/faculty.seed.mjs` | One-time seed (dry run by default) |
| `scripts/cms-backup.mjs` | Owner-run dump + storage export + manifest |
| `.env.example` | Variable names only |

### 14.3 Tests

| File | Change |
|---|---|
| `qa/suites/admin.mjs` | Faculty in backend mode against **staging** with the staging test admin; the other sections still demo |
| `qa/suites/robustness.mjs` | A forged or expired session is rejected by the API (not just redirected) |
| `qa/suites/lib/data.mjs` | Session and test-account sources for backend mode |
| `qa/suites/run-all.mjs` | Register the new suites |
| New `qa/suites/cms-api.mjs` | Anonymous vs admin access matrix, validation and error shape |
| New `qa/suites/cms-hod.mjs` | One active HOD, atomic and concurrent switches, delete blocked, message publish rules |
| New `qa/suites/cms-rls.mjs` | The anon key sees published rows only and cannot write |
| New `qa/suites/cms-upload.mjs` | Type, size and SVG rejection; permissions; the image renders; the old object is removed |

The `demo-store-migration.mjs` suite stays valid (the demo store remains for the non-CMS sections).

> **Status (2026-11-05):** this table is the original plan. The four existing `qa/suites/` files it lists (`admin.mjs`, `robustness.mjs`, `lib/data.mjs`, `run-all.mjs`), along with `demo-store-migration.mjs`, were removed from the repository and are kept in the external archive. The four "New" `qa/suites/cms-*.mjs` suites were never created. That coverage was built as the `qa/cms-*` staging suites (`qa/cms-api/`, `qa/cms-auth/`, `qa/cms-db/`, `qa/cms-hod/`, `qa/cms-media/`, and others) and the repository tests in `tests/` (Vitest unit tests, database integration tests, and the Playwright smoke test).

---

## 15. Phased implementation and testing roadmap [PROPOSED]

**Every phase:**
1. explicit approval;
2. a pre-change snapshot with SHA256SUMS;
3. the change;
4. `tsc` and lint;
5. a clean production build;
6. the static fingerprint;
7. the 45-capture freeze comparison;
8. the full `run-all.mjs`;
9. a report;
10. **stop**.

**Tests run only against the staging project and its test admin. Never production, never real browser storage.**

| Phase | Scope | Exit tests |
|---|---|---|
| **P0 Readiness** (this document) | Locked decisions; §18; owner's manual setup (§18.9) | Owner confirms that §18.9 items 1–8 are done |
| **P1 Backend foundation** | Dependencies installed (approved), `.gitignore`/`.env.example`, migrations 0001–0008 applied to **staging only**, owner-created staging test admin | SQL and RLS tests; single-HOD (incl. concurrency); message rules; bucket limits; storage policies; audit; rollback scripts |
| **P2 Data layer + API (dark)** | `src/lib/cms/*`, route handlers, upload route; `CMS_FACULTY_MODE=demo` (UI unchanged) | `cms-api`, `cms-hod`, `cms-rls`, `cms-upload` against staging; the existing suites unchanged; 0 UI differences |
| **P3 Real authentication** | Middleware, session hook, login screens; demo accounts removed | Sign-in, sign-out, expiry, forged cookie rejected by the server, open redirect blocked; freeze comparison (approved text changes only) |
| **P4 Faculty Manager on the backend** | `CMS_FACULTY_MODE=backend` (staging); `CrudManager` callbacks; the `image` field; approved fields; HOD controls | `admin` suite (backend mode); upload end-to-end; freeze comparison on `/admin/faculty` (approved additions only), 0 differences elsewhere |
| **P5 Public About reads the backend** | `FacultyGrid` and `PrincipalCard` with a fallback; revalidation | `public` suite; `/about` freeze comparison against its M3 state (0 differences, given the same data); revalidation test; backend-down fallback test |
| **P6 Backups** | `cms-backup.mjs`; manifest; restore drill into staging | Restore verified; rollback levels 1–4 rehearsed |
| **P7 Production go-live** | Migrations applied to **prod**; the owner's prod admin; seed after M3-4; prod environment variables on the host; `remotePatterns` for the prod host | Smoke test with the owner present; `/about` correct; a backup taken immediately after the seed |

**Order relative to M3:**
- **M3 (static content) is independent and stays as approved.**
- P5 and P7 depend on M3 being completed and the faculty list confirmed (M3-4). P1–P4 do not.

---

## 16. Open decisions [DECISION]

| # | Decision | Status |
|---|---|---|
| D1 | Backend | **Closed by L1** |
| D2 | Sign-in method | **Closed by L2** (email + password, one admin). Open sub-question: enable MFA (TOTP) for the admin? |
| D3 | First accounts | **Closed by L2:** one admin, created by the owner |
| D4 | About-page message | **Closed by L7 / §5.5:** HOD only in release 1; Principal deferred |
| D5 | Who confirms that the HOD message is the HOD's own words (`approved_by`) | Open |
| D6 | Photo consent source for each faculty photo | Open; required per photo (`image_consent`) |
| D7 | Deployment host for the Next.js site (where the production environment variables are set; body-size limits) | Open |
| D8 | Route handlers (recommended) or Server Actions | Open |
| D9 | Approval of the visible Faculty Manager additions (§9.4) and the demo-notice texts (§11.4) | Open, needed before P4 |
| D10 | Data region; backup retention and location | Open |
| D11 | Who holds the production admin password, and a recovery plan if that person leaves | Open |

---

## 17. Risks

| Risk | Mitigation |
|---|---|
| Single point of failure: one admin account (L2) | Owner-held recovery through the Supabase dashboard; credentials in a password manager; MFA; D11 |
| Backend unavailable or paused | Static `/about` plus the `src/data` fallback (R8) |
| Weak role enforcement | Server `getUser()` + role check, RLS, definer functions, test matrices |
| Two HODs, or an unapproved message published | Database invariants (§6, §5.3) |
| Photo rights | `image_consent` required; no PCE-hosted copies |
| Accidental reuse of another project's backend (L9) | Repository scan before release; new project only |
| Secret leakage | Secrets only in `.env.local` or host secrets; `.env` ignored; no service key in the app |
| Tests touching production | Separate staging project; separate test admin; prod credentials never on test runs |
| UI drift | The UI freeze procedure in every phase |
| Demo/live confusion in the admin | Notice texts (§11.4); the Reset text says "demo only" |
| Stale page clears the wrong HOD (P2.4, known limitation) | `DELETE /api/admin/hod` clears whichever record is the active HOD. If a Faculty Manager page is stale (another session assigned a different HOD after it loaded), unticking Active HOD there would clear the newer HOD. Acceptable with one admin (L2). **Before multi-admin:** make the clear conditional on the expected record (for example `clear_active_hod(p_expected_id)` or a `facultyId` in the request, refused with 409 when it no longer matches), and refresh the list before HOD changes. |

---

## 18. P0 implementation readiness

### 18.1 Readiness summary

| Area | State |
|---|---|
| Decisions L1–L9 | Recorded (§0) |
| Owner's manual setup | **Not done yet:** projects, settings, admin users, local env files (§18.9) |
| Tooling on the development machine | Node v24 present. **Docker absent** (no local Supabase stack). **Supabase CLI absent** (optional; §18.7). |
| Open decisions blocking P1 | None. D7, D9 and D10 block later phases (P4, P6, P7). |
| Application changes | None made |

### 18.2 Supabase project setup requirements [MANUAL]

Create **two** projects. Both are Sophia-owned and **new**; neither has anything to do with any previous project (L9).

| Item | `sophia-cms-staging` | `sophia-cms-prod` |
|---|---|---|
| Purpose | Development and all automated tests | The live site only |
| Owner account | A Sophia Forum or department-controlled account (not a personal throw-away). Recommended: an organisation with at least two trusted owners, so access isn't lost. | Same |
| Region | The one closest to the users, if available (verify on the region list). Use the same region for both. **D10** | Same |
| Database password | Strong and unique, stored in a password manager, **never shared in chat** | Same, a different password |
| Auth → sign-ups | **Turn off** "Allow new users to sign up" (L3) | **Off** |
| Auth → providers | Email enabled; all others disabled | Same |
| Auth → email confirmation | Irrelevant to sign-up (disabled). Create the admin with "auto-confirm" (§18.5). | Same |
| Auth → URL configuration | Site URL `http://localhost:3000` (development) | Site URL = the production domain (after D7). Redirect URLs restricted to it. |
| Auth → MFA | Optional (D2) | Recommended |
| Storage | The bucket is created by migration 0008 (§18.4); no manual bucket creation needed | Same |
| Data API | Enabled (needed by `supabase-js`). Only the `public` schema is exposed. | Same |
| Plan | Check the current plan limits (§3) | Choose a plan whose backups meet D10 |

### 18.3 Environment variables

**Names only; values are never written into this document or sent in chat.**

| Variable | Used by | Secret? | Where it lives |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | App (browser + server) | No (public) | `.env.local`; host settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the project's *publishable* key, depending on which key type the project shows) | App (browser + server) | No; public by design and safe only because RLS is on | `.env.local`; host settings |
| `CMS_FACULTY_MODE` | App (server) | No | `demo` until go-live, then `backend` |
| `SUPABASE_SERVICE_ROLE_KEY` (or the *secret* key) | **Owner-run scripts only** (seed, storage backup). **Not needed by the app.** | **Yes** | The owner's machine, in `.env.local` only, or a secured CI secret. **Never on the web host, never `NEXT_PUBLIC_`.** |
| `SUPABASE_DB_URL` | Owner-run backup (`pg_dump`) and applying migrations | **Yes** (contains the database password) | The owner's machine only |
| `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, `QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD` | Test suites, **staging only** | Password **yes** | `.env.local` on the test machine; the suites refuse to run if the URL equals the production URL |

**Rules:**
- **Never put production credentials in the `QA_*` variables.**
- **`.env.local` only** (ignored by git); a plain `.env` is not ignored today [VERIFIED].
- `.env.example` lists the names with empty values.

### 18.4 Database schema and migration sequence

> **Revision 3:** the eight-file draft below was replaced by **seven** files. RLS and grants now live in each table's own migration (§19.2 C2), and `pgcrypto` was dropped (§19.2 C1). The authoritative list is §19.4.

**Seed data is not a migration.** `supabase/seed/faculty.seed.mjs` runs separately: dry run by default, `--apply` to write, then staging, then production after M3-4.

**Applying:** to staging first, verified by the P1 tests. To production only in P7, after approval.

**Method [DECISION]:** the Supabase CLI (`supabase db push`, which needs the CLI) or pasting into the dashboard's SQL editor in order, recording each run.

### 18.5 Provisioning the single admin [MANUAL]

Do this per project; staging gets its own **test** admin.

1. **Authentication → Users → Add user → Create new user:** enter the admin email, a strong password (password manager), and tick **Auto-confirm user**. Do not use "Send invitation" (sign-ups are off).
2. **Copy the new user's UUID** from the user list. It is not secret, but there's no need to share it.
3. **SQL editor** (after migration 0002 exists):

   ```sql
   insert into public.profiles (user_id, display_name, role)
   values ('<the-user-uuid>', 'Sophia Forum Admin', 'admin');
   ```

4. Optionally enrol MFA for the admin (D2).
5. **Verify:** sign in to `/admin` locally against staging (P3). Faculty Manager writes succeed, and an anonymous request to the API is refused.

**Never:**
- share the password in chat or commit it;
- create additional users (L2);
- re-enable sign-ups.

### 18.6 Storage bucket and access policies

Created by migration 0008; see §9.1–9.2:
- `faculty-photos`, public read, 2 MB, JPEG/PNG/WebP;
- admin-only insert, update and delete through `app_role() = 'admin'`.

**Verification tests (P1):**
- anon upload → denied;
- admin upload of a 3 MB file → denied;
- SVG → denied;
- admin upload of a valid JPEG → its public URL loads.

### 18.7 Local development and the separate test project

| Topic | Strategy |
|---|---|
| Local Supabase stack | **Not available** (Docker absent [VERIFIED]). Installing Docker for `supabase start` is optional and a manual decision; not required. |
| Development backend | **`sophia-cms-staging`** (cloud), via `.env.local` on the development machine |
| Tests | All automated suites target staging with the **staging test admin**. A guard refuses to run if the target is missing or is not staging. As built, that guard is `qa/cms-db/lib/env.mjs` (S4) for the `qa/cms-*` suites; Tier 2 tests use `tests/integration/supabase/allowlist.mjs`, which always refuses the staging and production projects. The `qa/suites/lib/` guard named in the plan was never created. Test data uses a `qa-` id prefix and is removed by the suite afterwards. |
| Production | Touched only in P7 and later operations, by the owner or with the owner present. Never by test runs. |
| Supabase CLI | Optional (`npx supabase`, a development dependency; installing it needs approval). It's useful for `db push` and `db dump`. Without it, migrations go through the SQL editor and backups through `pg_dump`. |
| Browser storage | Unaffected: the CMS uses cookies for the session, and the demo store keys stay as they are |

### 18.8 Backup and rollback procedure (operational)

| When | Action |
|---|---|
| Before each migration on any project | `pg_dump` (schema + data) with a SHA-256 manifest |
| After the production seed (P7) | Full dump + storage export; recorded as the "go-live baseline" |
| Regularly (D10) | Scheduled dump + storage export; retention per D10; a restore drill into staging after setup, then periodically |
| Code changes | The pre-change snapshot procedure (as in `pre-optionA-snapshot/`) |
| Incidents | Rollback levels 1–5 (§12.2). The quickest safe step is `CMS_FACULTY_MODE=demo` plus the static About fallback. |

### 18.9 Manual actions required from the owner [MANUAL]

| # | Action | Needed before |
|---|---|---|
| 1 | Create (or choose) the Sophia-owned Supabase account or organisation, ideally with a second trusted owner (D11) | P1 |
| 2 | Create projects `sophia-cms-staging` and `sophia-cms-prod`; choose the region (D10); store both database passwords in a password manager | P1 (staging), P7 (prod) |
| 3 | In both projects: turn sign-ups **off**; email provider only; set the URL configuration (§18.2) | P1 / P7 |
| 4 | Create the **staging test admin** (§18.5 steps 1–2; step 3 after migration 0002) | P1 |
| 5 | Put the staging values into `.env.local` on the development machine yourself (names from §18.3). **Don't send them in chat.** Then confirm "done". | P1 |
| 6 | Approve installing `@supabase/supabase-js` and `@supabase/ssr` (and optionally the Supabase CLI as a development dependency) | P1 |
| 7 | Choose the migration method (CLI or SQL editor) (§18.4) | P1 |
| 8 | Confirm the project can be turned into a git repository, or accept that it isn't one (it isn't today [VERIFIED]); this affects `.gitignore` protection and CI backups | P1 |
| 9 | Approve the visible Faculty Manager additions and the notice texts (D9) | P4 |
| 10 | Provide photo consent for each faculty photo uploaded (D6), and the HOD-message approver (D5) | P4 / P7 |
| 11 | Decide the deployment host (D7) and set the production environment variables there yourself | P7 |
| 12 | Create the **production admin** (§18.5) and keep the credentials offline | P7 |
| 13 | Choose the backup location and retention (D10) | P6 |
| 14 | Complete M3 and obtain the department's faculty-list confirmation (M3-4) before the production seed | P5 / P7 |

### 18.10 Exact implementation order and files (release 1)

> **Status (2026-11-05):** the `qa/suites/…` test files below are the original plan. None of them is in the repository now: the existing ones are kept in the external archive, and the `cms-*` ones and `lib/cms-env.mjs` were never created. The tests were built as `qa/cms-*` and `tests/` instead (see the §14.3 status note).

1. **P1-a (repo hygiene):** `.gitignore` (+ `.env`); new `.env.example`.
2. **P1-b (dependencies, approved):** `package.json`, `package-lock.json` (`@supabase/supabase-js`, `@supabase/ssr`).
3. **P1-c (schema):**
   - `supabase/migrations/0001…0008` (§18.4) plus `supabase/rollback/0001…0008`;
   - applied to staging;
   - then the staging admin's `profiles` row (§18.5).
4. **P1-d (tests):** `qa/suites/lib/cms-env.mjs` (staging guard); `qa/suites/cms-rls.mjs`; the SQL-level checks inside `cms-hod.mjs`.
5. **P2 (dark API):**
   - `src/lib/cms/supabase-server.ts`, `src/lib/cms/auth.ts`, `src/lib/cms/faculty.ts`;
   - the route handlers under `src/app/api/admin/faculty/**`, `src/app/api/admin/hod-messages/**` and `src/app/api/admin/uploads/faculty-photo/route.ts`;
   - `qa/suites/cms-api.mjs`, `cms-hod.mjs`, `cms-upload.mjs`;
   - `qa/suites/run-all.mjs`.
6. **P3 (auth):**
   - `src/lib/cms/supabase-browser.ts`, `src/hooks/useSession.ts`;
   - `src/middleware.ts`;
   - `src/components/auth/LoginForm.tsx`, `LoginPanel.tsx`, `AccountButton.tsx`, `src/components/layout/Navbar.tsx`, `src/components/admin/AdminShell.tsx`;
   - retire `src/lib/demoAuth.ts`'s account list and `src/hooks/useDemoSession.ts`;
   - `qa/suites/robustness.mjs`, `qa/suites/lib/data.mjs`.
7. **P4 (Faculty Manager):**
   - `src/components/admin/CrudManager.tsx` (callbacks, `image` field type, pending/error);
   - `src/hooks/useCmsFaculty.ts`;
   - `src/app/admin/faculty/page.tsx`;
   - the notice texts in `src/app/admin/page.tsx` and `src/app/admin/users/page.tsx`;
   - `qa/suites/admin.mjs`.
8. **P5 (public):** `src/components/about/FacultyGrid.tsx`, `src/components/about/PrincipalCard.tsx`; `next.config.ts` (`remotePatterns`).
9. **P6 (backups):** `scripts/cms-backup.mjs`; restore drill.
10. **P7 (go-live):** apply the migrations to prod; owner creates the prod admin; `supabase/seed/faculty.seed.mjs --apply` (after M3-4); host environment variables; smoke test; baseline backup.

Each step stops for review, per the project's established procedure.

---

## 19. P1 database foundation: decisions, corrections and implementation record

### 19.1 Decisions and safeguards [LOCKED, 2026-11-01]

| # | Decision |
|---|---|
| P1-D1 | Migrations are applied by **the owner with the Supabase CLI**, following guided steps (§19.7). Database passwords and access tokens are typed only into the owner's own terminal or browser. **They are never requested in chat.** |
| P1-D2 | **Restrict:** a faculty record with HOD message history can't be deleted (`ON DELETE RESTRICT`) |
| P1-D3 | QA credentials live in a separate **`.env.test.local`** (Git-ignored by `.env.*` and `.env*.local` [VERIFIED]). Values are never printed. |
| P1-D4 | This document is updated with the six P1 review corrections (§19.2) |
| P1-D5 | **All audit entries are kept**; there is no automatic retention limit |
| S1 | A genuine concurrent-execution test of `set_active_hod()` (§19.5, section D) |
| S2 | The staging backup is verified before any rollback test, and the expected data loss is documented (§19.6) |
| S3 | Every migration enables RLS and sets explicit grants in the same file that creates each table |
| S4 | Never connect to or modify production. This is enforced in `qa/cms-db/lib/env.mjs` (staging ref only; refuses secret keys and `PROD` variables). |

### 19.2 The six corrections from the P1 review

| # | Correction | Where |
|---|---|---|
| C1 | **No `pgcrypto`:** `gen_random_uuid()` is built into PostgreSQL 13+ | Migration 1 |
| C2 | **RLS enabled in the migration that creates each table.** The draft's separate RLS migration would have left tables open between migrations. | Migrations 2, 3, 4, 6 |
| C3 | **Column privileges instead of a guard trigger** protect `is_active_hod`. It is in no insert or update grant, so only the owner-rights functions `set_active_hod()`/`clear_active_hod()` can change it. | Migrations 3, 5 |
| C4 | **Explicit `revoke all` + minimal grants** for `anon`/`authenticated` on every table. Supabase's default privileges would otherwise grant everything. | Migrations 2, 3, 4, 6 |
| C5 | **An admin `select` policy on `storage.objects`**, needed to list, replace and delete through the API. All four policies are limited to `faculty/` paths. | Migration 7 |
| C6 | **A published message must belong to the current, published active HOD** (a new trigger) | Migration 4 |

### 19.3 Additional hardening added while writing the SQL

| # | Measure |
|---|---|
| H1 | `set_active_hod()` and `clear_active_hod()` take a transaction-scoped **advisory lock**, so concurrent calls run in sequence, all succeed, and the last one wins. Without it, a racing call could fail on the unique index (the invariant would still hold, but the admin would see an error). |
| H2 | **`clear_active_hod()`** (admin only), for when an HOD leaves without a successor; it archives the published message |
| H3 | **The active HOD must be published,** can't be unpublished and can't be deleted (a guard trigger). `set_active_hod()` rejects unpublished records. |
| H4 | **The public key reads only the displayed columns:** never `image_consent`, `updated_by`, `approved_by` or `approved_on`. The public site must select explicit columns (no `select *` with the public key). |
| H5 | The `audit_log` identity sequence: default grants revoked |
| H6 | `image_path` must be `faculty/<this record's id>/<uuid>.(jpg\|png\|webp)`, and a photo requires `image_consent` |
| H7 | `faculty.id` can't be changed after insert. Messages can't be deleted or moved to another faculty record. |
| H8 | Trigger functions aren't executable by API roles. Every function sets `search_path = ''` and qualifies every name. |
| H9 | `profiles` has no write grants or policies: rows are created by the owner in the SQL editor, so nobody can grant themselves a role. A missing profile means no access. |

### 19.4 Files

| File | Purpose |
|---|---|
| `supabase/migrations/20261101000001_types_and_helpers.sql` | Enums `app_role`, `message_status`; `set_updated_fields()` |
| `supabase/migrations/20261101000002_profiles.sql` | `profiles` + RLS + grants; `app_role()` |
| `supabase/migrations/20261101000003_faculty.sql` | `faculty`, checks, single-HOD index, guard trigger, RLS, column grants |
| `supabase/migrations/20261101000004_hod_messages.sql` | `hod_messages`, approval check, one-published index, publish guard, RLS, column grants |
| `supabase/migrations/20261101000005_set_active_hod.sql` | `set_active_hod(text)`, `clear_active_hod()` |
| `supabase/migrations/20261101000006_audit.sql` | `audit_log`, RLS, audit triggers |
| `supabase/held/20261101000007_storage_faculty_photos.sql` (+ its `.down.sql`) | **Held** (owner decision): bucket `faculty-photos` + four admin policies. Not read by the CLI. |
| `supabase/rollback/<same version>_*.down.sql` (×6) | Undo migrations 6→1 (reverse order); headers state the data loss |
| `supabase/tests/verify_schema.sql` | **Read-only** catalogue checks for the SQL editor (RLS, grants, column grants, function rights, `search_path`, indexes, FK rule, bucket) |
| `supabase/tests/cleanup_qa_data.sql` | Staging only, owner: removes `qa-` test records (audit kept, D5) |
| `qa/cms-db/lib/env.mjs` | Loads `.env.test.local`; staging-only guard; redaction |
| `qa/cms-db/cms-db.test.mjs` | Database tests (§19.5) |
| `qa/cms-db/cms-storage.test.mjs` | Storage tests (after migration 7) |
| `qa/cms-db/backup-staging.mjs` | API export of the CMS data + storage objects, with a SHA-256 manifest |
| `.gitignore` | + `qa/cms-db/backups/` |

**`.env.test.local`** (created by the owner, never committed) needs:
- `QA_SUPABASE_URL` (the staging URL);
- `QA_SUPABASE_ANON_KEY` (the staging publishable key);
- `QA_ADMIN_EMAIL`, `QA_ADMIN_PASSWORD` (the **staging** test admin).

### 19.5 Tests

**`cms-db.test.mjs`**, run as the public key ("anon") and as the staging test admin:

| Section | What it checks |
|---|---|
| **Preflight** | Admin sign-in; the admin profile row; the tables exist |
| **A. Public key (12)** | Reads published rows only. Can't insert, update or delete. Can't read profiles or the audit log. Can't call the HOD functions or `app_role`. Can't read the hidden columns. Can't write messages. |
| **B. Admin and constraints (15)** | Insert, update and delete. Defaults; `updated_by` stamped. Slug, LinkedIn and photo-path/consent checks. `id` and `is_active_hod` not writable. Can't change its own role, insert profiles or write the audit log. Audit entries present. |
| **C. HOD rules (7)** | Unpublished or unknown records can't become HOD. Switching works; exactly one HOD at a time. Can't delete or unpublish the active HOD. Clearing works. |
| **D. Concurrency (7)** | 5 rounds × 24 **parallel** `set_active_hod()` HTTP calls across 3 candidates: all succeed, exactly one active HOD after each round, and the test proves that calls overlapped in time. Then a mixed set/clear round: never more than one active HOD. |
| **E. Messages (11)** | Draft; publishing without approval rejected; publishing with approval; public read; a second published message rejected; a non-HOD message can't be published; switching HOD archives the old message; no deletion; no re-assignment; D2 delete blocked; audit entries |
| **Restore** | No active HOD and no published `qa-` rows left |

**`cms-storage.test.mjs` (11 checks):**
- the bucket settings;
- the public key can't upload, delete or list;
- the admin can upload a JPEG, which is then publicly readable;
- SVG, a file over 2 MB and uploads outside `faculty/` are rejected;
- the admin can delete; nothing is left behind.

**Results** are written to `qa/cms-db/results/`, with check names only and no credentials.

**Data left in staging by design:**
- `qa-` faculty with message history, and their archived messages (D2: the API can't delete them);
- all audit entries (D5).

`supabase/tests/cleanup_qa_data.sql` removes the `qa-` faculty and messages. Audit entries are kept.

**Verified offline:**
- all four scripts pass a syntax check;
- the environment guard refuses: a missing file, missing variables, another project, a secret key, a service-role JWT, and a `PROD` variable. Valid staging settings are accepted, and values are redacted.

**SQL validation:** done on a disposable local PostgreSQL 17.11 (§19.9). The earlier note that no PostgreSQL was available was wrong: `pg_dump`/`psql` exist at `D:PostgreSQLin` (not on PATH), and a disposable server was run from the scratchpad.

### 19.6 Backups: what each method can and cannot restore

**Corrected fact [VERIFIED]:** `pg_dump`, `pg_restore` and `psql` **18.6 are installed** at `D:\PostgreSQL\bin`, as part of a system PostgreSQL 18 service (`postgresql-x64-18`). They aren't on PATH, which is why the earlier check reported them absent. Docker is still absent (so `supabase db dump` won't work). The system PostgreSQL service is not used or touched by any procedure here.

| Method | Covers | Doesn't cover | Can restore? |
|---|---|---|---|
| **`pg_dump --schema=public --format=custom`** (owner-run, staging, §19.10) | Tables, data, sequences (incl. the audit sequence value), enums, functions (incl. `security definer` and `search_path`), triggers, indexes, constraints, RLS flags, policies, table and **column** grants | `auth.users` (the admin account), the `storage` schema (bucket row and storage policies), the photo **files** (Storage keeps them outside the database), the CLI migration history (`supabase_migrations`) | **Yes, for the public schema.** Verified on disposable PostgreSQL 17 (§19.9): pg_dump 18.6 → pg_restore reproduced data, policies, table and column grants, functions, triggers, indexes, constraints and RLS **identically**, and the restored database still hid `image_consent` from anon and still refused a second active HOD. |
| **`node qa/cms-db/backup-staging.mjs`** (API export) | Rows of `faculty`, `hod_messages`, `audit_log`; **only the admin's own** `profiles` row (RLS); the bucket settings (`bucket.json`); the photo files (when the bucket exists) | Schema, functions, triggers, policies, grants, enums, the sequence value, auth users, the storage policies | **No.** It is a data snapshot for reference and comparison. Verified: the API refuses to write back `is_active_hod`, `created_at`/`updated_by`, original message ids, audit rows and profiles (all 42501). A restore from it would need owner-run SQL that doesn't exist yet. |
| The migrations in Git | The complete schema, functions, policies and grants | Any data | Re-creates the schema only |

**A complete staging backup** is therefore:
1. `pg_dump` of `public` (schema + data);
2. the API export (photo files and bucket settings);
3. the migrations in Git;
4. a note of the auth user, which is recreated in the dashboard.

Neither tool alone is a complete backup.

**Before any rollback test:**
1. Take the `pg_dump`, then run `pg_restore --list` on it to confirm it's readable.
2. Take the API export and check its SHA256SUMS.
3. Confirm the manifest's row counts against the live counts.
4. Only then run a rollback script.

**Expected data loss per rollback script** (staging):

| Rollback | Lost |
|---|---|
| 6 | All audit entries |
| 5 | Nothing (the functions only) |
| 4 | All HOD messages |
| 3 | All faculty records |
| 2 | All role assignments (`profiles`); auth users are kept |
| 1 | Nothing (types and a helper function) |
| 7 (held) | Not applicable while migration 7 is held. Its bucket removal is an **open issue** (see the held rollback file). |

**After a rollback rehearsal:** re-apply, re-insert the admin's `profiles` row, and re-run the tests. Data can be restored from the `pg_dump`.

### 19.7 Guided migration steps (owner, staging only): EXECUTED 2026-11-01

**Status: executed for migrations 1–6 (§19.12).** The text below is kept as the procedure that was approved. Migration 7 is held in `supabase/held/`, which the CLI never reads, so `supabase/migrations/` contains **only migrations 1–6**. **There is no dashboard fallback:** all schema and policy changes stay migration-controlled.

| # | Who | Step |
|---|---|---|
| 0 | Owner | Create `.env.test.local` with the four `QA_*` variables (§19.4); I verify it without printing values |
| 1 | Owner | `npx supabase@2.122.0 login` |
| 2 | Owner | `npx supabase@2.122.0 init` (decline the optional prompts; it must not touch `supabase/migrations/`) |
| 3 | Owner | `npx supabase@2.122.0 link --project-ref <staging-project-ref>` (placeholder: the staging project ID; the database password only at the terminal prompt) |
| 4 | Owner | Restorable baseline: the `pg_dump` command in §19.10 (expected: an almost-empty `public` schema) |
| 5 | Claude or owner | `node qa/cms-db/backup-staging.mjs` (expected: all tables "absent", storage "absent") |
| 6 | Owner | `npx supabase@2.122.0 migration list` (expected: 6 local, 0 remote) |
| 7 | Owner | `npx supabase@2.122.0 db push --dry-run` (expected: exactly the 6 files). **This only lists what would run; it is not SQL validation** (that was done in §19.9). |
| 8 | Owner | `npx supabase@2.122.0 db push` |
| 9 | Owner | SQL editor: insert the staging test admin's `profiles` row (§18.5 step 3) |
| 10 | Owner | SQL editor: `supabase/tests/verify_schema.sql`. Expected: 14 rows `true`, and the 2 storage rows `false` (migration 7 is held). |
| 11 | Claude | `node qa/cms-db/cms-db.test.mjs` and a report. The storage tests are not run while migration 7 is held. |

### 19.8 Migrations 1–6 are independent of migration 7

| Check | Result |
|---|---|
| References | Migrations 1–6 never reference the `storage` schema. Migration 7 depends on `app_role()` (migration 2), not the other way round. |
| Applied without a storage schema | **Verified:** migrations 1–6 applied cleanly on disposable PostgreSQL 17 with **no `storage` schema present** |
| Folder | The CLI reads only `supabase/migrations/`; `supabase/held/` is ignored |
| Later | When migration 7 is approved, moving it back gives version `20261101000007`, which sorts after 1–6, so `db push` applies only it |
| `verify_schema.sql` | Its two storage rows report `false` while migration 7 is held; that is expected |

### 19.9 SQL validation on disposable PostgreSQL 17.11

- **Environment:**
  - `embedded-postgres` 17.11, a real PostgreSQL server, installed only in the session scratchpad (not the project);
  - multi-connection, on its own port, with a temporary data folder that is deleted afterwards;
  - **never connected to Supabase.**
- **Compatibility layer (an approximation of Supabase):**
  - the roles `anon`, `authenticated`, `service_role`;
  - `auth.users`, and `auth.uid()` reading `request.jwt.claim.sub`;
  - Supabase's **default privileges** (all on tables, sequences and functions to the API roles), so the explicit revokes are tested against the real threat;
  - a control check proves the default privileges would otherwise have made a new table writable by anon.
- **Result: 95/95 checks passed:**
  - migrations apply in order with no storage schema;
  - `verify_schema.sql` (16 rows as expected);
  - anon (16 checks);
  - a signed-in user **without** a profile (7);
  - admin grants, column privileges, constraints and triggers (17);
  - HOD rules (8), including that **even the owner can't create a second active HOD**;
  - messages (11);
  - audit (4);
  - **concurrency (6);**
  - rollback (3);
  - re-apply (2).
- **Concurrency, at database level:**
  - 12 calls were observed in `pg_locks` **waiting on the advisory lock** while one transaction held it. After release, all 12 succeeded, with exactly one active HOD.
  - 3 rounds of 60 parallel set/clear calls on 30 connections: no errors, never more than one HOD.
  - **Negative control:** the same function *without* the lock fails a racing call with 23505. So the test detects the race, and the lock removes it; the unique index holds in both cases.
- **Rollback:**
  - Rollback 3 run before 4–6 is **refused by dependencies** (2BP01), and nothing is dropped.
  - 6→1 removes every CMS object, and `auth.users` is untouched.
  - A full re-apply succeeds, and `verify_schema.sql` passes again.
- **Backup:** 19/19 checks for pg_dump/pg_restore and API-export restorability (§19.6).
- **What this does not validate:** Supabase's own internals (PostgREST request handling, the real `auth` implementation and JWT signing, Supabase's role ownership, the Storage service) and migration 7. Those are covered only by the staging tests (`cms-db.test.mjs`) once the migrations are approved and applied.
- **Encoding:** Supabase databases are UTF-8. The migrations contain non-ASCII characters in **comments only** (→, …, ·, —), which are harmless in UTF-8. On a non-UTF-8 database they would fail; that was seen once in the harness before it was set to UTF-8.

### 19.10 Commands for later (not to be run until approved)

Owner, staging only. The connection string comes from the dashboard (Connect → **Session pooler**, which works over IPv4) **without** the password; `pg_dump`/`pg_restore` ask for it with `-W`.

```powershell
# Restorable backup of the public schema (before applying, and before any rollback test)
& "D:\PostgreSQL\bin\pg_dump.exe" --dbname "<session-pooler connection string, no password>" -W --schema=public --format=custom --file "qa\cms-db\backups\staging-public-<date>.dump"
& "D:\PostgreSQL\bin\pg_restore.exe" --list "qa\cms-db\backups\staging-public-<date>.dump"   # readable? lists the objects

# CLI (each asks for login/password in the terminal or browser; nothing is typed into chat)
npx supabase@2.122.0 login
npx supabase@2.122.0 init
npx supabase@2.122.0 link --project-ref <staging-project-ref>   # placeholder: the staging project ID
npx supabase@2.122.0 migration list
npx supabase@2.122.0 db push --dry-run
npx supabase@2.122.0 db push

# Claude (reads .env.test.local; prints no values)
node qa/cms-db/backup-staging.mjs
node qa/cms-db/cms-db.test.mjs

# Rollback rehearsal (separate approval): SQL editor, run supabase/rollback/…06 → …01 in that order, then for each version:
npx supabase@2.122.0 migration repair --status reverted <version>
```

`qa\cms-db\backups\` is Git-ignored.

### 19.11 Remaining risks

| Risk | Status |
|---|---|
| Supabase-specific behaviour (PostgREST, the real `auth.uid()`, role ownership) is not covered by the local validation | Covered by `cms-db.test.mjs` on staging after approval |
| The API concurrency test (D) shows only client-side overlap | The database-level proof is §19.9. D is a smoke test that the invariant holds through the API. |
| One admin account (L2) means a no-profile user can't be tested on staging | Covered locally (7 checks in §19.9) |
| The staging rollback rehearsal hasn't been run | Rehearsed locally (§19.9); on staging only with separate approval and a verified `pg_dump` first |
| **Migration 7: removing the bucket in a migration-controlled rollback is unresolved**, and creating storage policies by migration isn't validated (there is no Storage service locally) | Open; blocks approval of migration 7 |
| The test data can't be removed through the API | `cleanup_qa_data.sql` (owner, staging) |
| Backups exclude the auth user and the photo files from `pg_dump` | Documented (§19.6); the API export covers the files |

---

### 19.12 P1 closure record (staging, 2026-11-01)

| Item | Record | Source |
|---|---|---|
| Project | `sophia-cms-staging`, ref `<staging-project-ref>` (placeholder; the real ID is kept only in the safety guards, e.g. `qa/cms-db/lib/env.mjs`); CLI linked to this ref only | Owner; `supabase/.temp/project-ref` |
| Pre-P1 backup | `qa/cms-db/backups/staging-public-pre-p1-2026-11-01.dump`. 5,692 bytes; CUSTOM, from PostgreSQL 17.11 by pg_dump 18.6; 16 TOC entries (empty `public` schema + Supabase default privileges); SHA-256 `6923c7b77a49ce477f267121f58af2c0b2c9b4ebafcec1a2914bd630ce3b87b6` | Owner run; independently verified (`pg_restore --list`, SHA-256) |
| CLI checks before applying | `migration list`: 6 local, 0 remote. `db push --dry-run`: exactly migrations 1–6. | Owner |
| Applied | `db push`: `20261101000001`–`20261101000006` applied; confirmed remotely | Owner |
| Admin profile | Staging admin's `profiles` row inserted by the owner in the SQL editor (role `admin`) | Owner; confirmed read-only |
| Schema verification | `supabase/tests/verify_schema.sql` in the SQL editor: **14 true, 2 false** (the storage rows, expected while migration 7 is held) | Owner |
| Database tests | `qa/cms-db/cms-db.test.mjs`: **57/57 PASS**, exit 0 (result file `qa/cms-db/results/cms-db-2026-11-01T09-01-33-257Z.json`; historical QA result files were excluded from the clean repository and are kept only in the original history backup) | This session |
| Post-P1 backup | `qa/cms-db/backups/staging-public-post-p1-2026-11-01.dump`. 43,380 bytes; CUSTOM, from 17.11 by pg_dump 18.6; 98 TOC entries (4 tables + data, 7 functions, 6 triggers, 11 policies, RLS enabled on 4 tables, 5 indexes, 2 enums, 30 ACL entries); SHA-256 `57ba08d02445c8dce77d7a10cfc57d4a3a908e3f614d4c28ecd9cf4449d3364e` | Owner run; independently verified |
| Migration 7 | Held in `supabase/held/`; the `faculty-photos` bucket is absent on staging | Read-only check |
| Test data kept for review (not cleaned) | `faculty`: 1 row `qa-hod-a` (unpublished, not HOD; kept by D2). `hod_messages`: 1 archived test message. `audit_log`: 215 entries, all by the staging admin, all for `qa-` records or the test message, 09:01:06–09:01:31 UTC. No non-test faculty rows; no active HOD. | Read-only check |
| Local CLI config | `supabase/config.toml`: `enable_signup = false` (both settings), to match L3. It is **local only**: `supabase config push` must never be run. | This session |
| Production | Never connected to; no production project exists | — |

**Open after P1:**
- the test-data clean-up decision (`supabase/tests/cleanup_qa_data.sql`, owner);
- the rollback rehearsal (separate approval);
- migration 7's open issues (§19.11);
- P2 (data layer + API, dark).

---

*End of planning document (revision 4). P1 is complete on staging. Migration 7 is held. Each further step requires separate explicit approval.*
