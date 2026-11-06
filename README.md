# Sophia Forum

The website and content management system of **Sophia Forum**, the student forum of the Department of Artificial Intelligence & Data Science at Priyadarshini College of Engineering, Nagpur.

The project has two parts:

- **A public website** for the forum's events, gallery, team and department information.
- **An admin area (CMS)** where signed-in administrators manage that content, backed by Supabase.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Testing](#testing)
- [Supabase setup](#supabase-setup)
- [CMS and admin area](#cms-and-admin-area)
- [Security and configuration notes](#security-and-configuration-notes)
- [Development guidelines](#development-guidelines)

## Features

### Public website

| Route | Content |
|---|---|
| `/` | Home: hero, ticker, about, upcoming events, video, gallery preview and call to action |
| `/about` | Department and forum information: leadership, faculty, pillars, statistics and a timeline |
| `/team`, `/team/[id]` | Team directory, president spotlight and member pages |
| `/events`, `/events/[id]` | Event listing and event detail pages with sharing |
| `/gallery` | Photo and video gallery with a lightbox |
| `/login` | Admin sign-in |

### Admin area (`/admin`)

- Managers for **Events**, **Gallery**, **Team** and **Faculty**, including HOD messages.
- A **Content** manager for editable site text. It's available to administrators in backend mode only.
- A **Users** screen. It's admin-only and still a browser-local demo.
- Image uploads to Supabase Storage, checked on the server.
- Two operating modes, **demo** and **Supabase-backed**, chosen through environment variables. See [CMS and admin area](#cms-and-admin-area).

## Technology stack

| Area | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router), React 19 |
| Language | TypeScript |
| Styling and UI | Tailwind CSS 3, Framer Motion, Lucide icons |
| Backend | [Supabase](https://supabase.com/): PostgreSQL with Row Level Security, Auth, Storage (`@supabase/supabase-js`, `@supabase/ssr`) |
| Quality | ESLint 9 (`eslint-config-next`), TypeScript type checking |
| Testing | Vitest and Testing Library (unit tests), Vitest with a disposable local PostgreSQL (database tests), Playwright (browser smoke tests) |

## Project structure

```text
sophia-forum/
├── src/
│   ├── app/                # Routes: public pages, /admin screens, /api/admin and /api/auth handlers
│   ├── components/         # UI by area: home, about, team, events, gallery, admin, auth, layout, ui
│   ├── data/               # Static site content and demo data
│   ├── hooks/              # Client hooks (sessions, CMS records, uploads)
│   ├── lib/                # Shared logic, build checks, security headers
│   │   └── cms/            # CMS: auth, sessions, collections, validation, media, Supabase access
│   └── middleware.ts       # Admin route protection and session refresh
├── supabase/
│   ├── migrations/         # Database schema, RLS policies and storage (apply in order)
│   ├── rollback/           # Matching rollback script for each migration
│   ├── tests/              # SQL verification scripts
│   └── config.toml         # Local Supabase CLI configuration only
├── tests/
│   ├── unit/               # Vitest unit tests
│   ├── integration/db/     # Database tests on a disposable local PostgreSQL
│   ├── integration/supabase/  # Tooling for a disposable Supabase test project
│   └── e2e/                # Playwright public-page smoke tests
├── qa/                     # Owner-run QA suites and maintenance scripts
├── docs/sophia-cms/        # CMS architecture and implementation record
├── public/                 # Static assets and self-hosted fonts
└── .env.example            # Names of the environment variables (no values)
```

## Getting started

### Prerequisites

- **Node.js 22.12 or later** (Vitest 5 requires `^22.12.0 || ^24.0.0`) and npm.
- **For the Supabase-backed mode:** a Supabase project. Not needed for demo mode.
- **For the database tests:** a local PostgreSQL installation, of which only the `initdb`, `pg_ctl` and `postgres` binaries are used. See [Testing](#testing).

### Installation

```bash
git clone https://github.com/antarikshmundle/sophia-forum.git
cd sophia-forum
npm ci
```

### Run in demo mode

Demo mode needs no backend. Content comes from the static data in `src/data/`. Admin changes are stored only in the browser's local storage.

```bash
cp .env.example .env.local   # optional: the defaults are already demo mode
npm run dev
```

Open <http://localhost:3000>. The admin area at `/admin` accepts the public demo accounts defined in `src/lib/demoAuth.ts`.

### Run against Supabase

1. Set up a Supabase project as described in [Supabase setup](#supabase-setup).
2. Fill in `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
   CMS_AUTH_MODE=supabase
   CMS_FACULTY_MODE=backend
   ```

3. Restart `npm run dev`. `CMS_AUTH_MODE` is read at build and start time.

## Environment variables

`.env.example` lists every variable the application reads, without values. Put real values in `.env.local`, which Git ignores. Never commit real values.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project URL (`https://<project-ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The project's **publishable (anon)** key. It's safe in the browser only because RLS is enabled. Never use a secret or service-role key here. |
| `CMS_AUTH_MODE` | `demo` (default) or `supabase` (real admin sign-in). Fixed at build time, so rebuild after changing it. |
| `CMS_FACULTY_MODE` | `demo` (default) or `backend` (enables the `/api/admin` routes and the database-backed public pages) |

A missing or unrecognised value for either CMS flag means `demo`.

The tooling reads a few more variables. The application itself doesn't use them:

| Variable | Used by |
|---|---|
| `SOPHIA_ALLOW_DEMO_BUILD=1` | Allows a local demo `npm run build` (see [Scripts](#scripts)). Ignored on a Vercel production deployment. |
| `SOPHIA_PG_BIN` | Folder containing the PostgreSQL binaries, for `npm run test:integration` |
| `E2E_BASE_URL`, `E2E_BACKEND=1` | Target server and optional backend checks for `npm run test:e2e` |
| `QA_*` (in `.env.test.local`) | The owner-run `qa/cms-*` suites |
| `INTEGRATION_*` (in `.env.integration.local`) | `npm run test:supabase`. The names are listed in `tests/integration/supabase/env.template`. |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build (see below) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:integration` | Database tests on a disposable local PostgreSQL |
| `npm run test:e2e` | Playwright smoke tests against a running server |
| `npm run test:supabase -- --check` | Guard and connectivity check for a disposable Supabase test project. It writes no data. Only `--check` is implemented. |

**About the production build:** `npm run build` validates its environment (`src/lib/build-env.ts`). It refuses to build unless all of the following hold:

- `CMS_AUTH_MODE=supabase` and `CMS_FACULTY_MODE=backend`;
- a valid Supabase URL;
- a publishable (anon) key;
- no secret value in any `NEXT_PUBLIC_*` variable.

This stops a production deployment from silently shipping the demo site. For a local demo build, set `SOPHIA_ALLOW_DEMO_BUILD=1`:

```bash
SOPHIA_ALLOW_DEMO_BUILD=1 npm run build                 # macOS / Linux
$env:SOPHIA_ALLOW_DEMO_BUILD = "1"; npm run build       # Windows PowerShell
```

## Testing

- **Unit tests** (`npm test`) run in jsdom and need no network or database.
- **Database tests** (`npm run test:integration`):
  - They create a temporary PostgreSQL cluster on a random loopback port, apply every migration with a Supabase stand-in, and delete the cluster afterwards.
  - They cover migrations, CRUD, authorization, visibility, the HOD rules and storage policies.
  - Set `SOPHIA_PG_BIN` to your PostgreSQL `bin` folder.
  - They refuse to run if any Supabase, database, `QA_*` or `CMS_*` variable is set in the shell.
- **Browser smoke tests** (`npm run test:e2e`):
  - Read-only checks of the public pages. They never sign in.
  - Start the app first, then point the tests at it:

    ```powershell
    $env:E2E_BASE_URL = "http://localhost:3000"; npm run test:e2e
    ```

  - Install the browser once with `npx playwright install chromium`.
- **Owner-run QA suites** (`qa/cms-*`) target a dedicated staging project and refuse to run against anything else. They are not part of the standard test commands.

## Supabase setup

The full design, decisions and operating procedures are in [`docs/sophia-cms/FACULTY_HOD_CMS_ARCHITECTURE.md`](docs/sophia-cms/FACULTY_HOD_CMS_ARCHITECTURE.md), especially §18 and §19. In outline:

1. **Create a project.** Keep separate projects for testing and for the live site.
2. **Configure authentication:**
   - turn **off** "Allow new users to sign up";
   - enable only the Email provider;
   - set the Site URL (`http://localhost:3000` for development).
3. **Apply the migrations** in `supabase/migrations/` in filename order. Use either:
   - the Supabase CLI (`npx supabase db push`), or
   - the dashboard's SQL editor.

   The migrations create the following, with RLS enabled on every table:

   | Object | Created |
   |---|---|
   | Tables | `profiles`, `faculty`, `hod_messages`, `audit_log`, `team_members`, `events`, `gallery_items`, `site_content` |
   | Storage | the public `site-media` bucket (JPEG/PNG/WebP, 4 MB limit) with admin-only write policies |

   Do **not** run `supabase config push`. `supabase/config.toml` is for the local CLI only and would overwrite the hosted auth settings.
4. **Create the administrator.**
   - Under **Authentication → Users**, create the user with **Auto-confirm user** ticked.
   - Then give it a profile in the SQL editor:

     ```sql
     insert into public.profiles (user_id, display_name, role)
     values ('<the-user-uuid>', 'Sophia Forum Admin', 'admin');
     ```

5. **Back up first.** Take a `pg_dump` before each migration.
   - Each migration has a matching script in `supabase/rollback/`.
   - Run rollbacks in **reverse** order.
   - Verification queries are in `supabase/tests/`.

## CMS and admin area

| `CMS_AUTH_MODE` | `CMS_FACULTY_MODE` | Behaviour |
|---|---|---|
| `demo` | `demo` | **Demo.** Demo accounts, browser-local data, static public pages. Nothing is stored on a server. |
| `supabase` | `demo` | Real admin sign-in. Content managers still use local demo data. |
| `supabase` | `backend` | **Full CMS.** Admin screens read and write Supabase through `/api/admin/*`, and public pages read published records. |
| `demo` | `backend` | Not supported. The Faculty Manager reports itself unavailable rather than falling back to demo data. |

**In Supabase mode:**
- **Sign-in:** through `/login` with Supabase Auth.
- **Admin access:** `src/middleware.ts` admits only verified sessions whose profile has the `admin` role. Sessions last at most 8 hours. Session cookies are `httpOnly`, `Secure` and `SameSite=Lax`.
- **API routes:** each `/api/admin/*` route checks authorization again on the server.
- **Database:** Row Level Security enforces the same rules.
- **Audit log:** changes are recorded in `audit_log`.
- **Uploads:** they go through `/api/admin/uploads`. The server checks each file's real type from its contents, not its name, and accepts only JPEG, PNG or WebP within the size limit.

## Security and configuration notes

- **Never commit credentials.**
  - `.gitignore` excludes every `.env*` file except `.env.example`, plus keys, certificates, logs and database dumps.
  - The app needs only the public URL and the publishable key. It never needs a service-role or secret key, or a database connection string.
- **Build guard:** production builds reject secret-looking values in `NEXT_PUBLIC_*` variables, and on a production deployment they refuse the staging project.
- **Security headers** are set for every route (`src/lib/security-headers.ts`). The Content Security Policy is currently **report-only**: browsers log violations to the console but block nothing.
- **Demo mode is not secure.** Its accounts are public and its session cookie is forgeable. Use it only for local development and demonstrations.
- **Local-only data:**
  - Some operational scripts in `qa/cms-db/` read personal data from the Git-ignored `local-private/` folder.
  - These scripts refuse to run without it.
  - Never commit that folder or copy its contents into the repository.

## Development guidelines

- **Before opening a pull request**, run:

  ```bash
  npm run lint
  npm run typecheck
  npm test
  npm run test:integration
  ```

- **Schema changes:**
  - Add a new timestamped file to `supabase/migrations/` with a matching rollback in `supabase/rollback/`.
  - Never edit a migration that has already been applied.
  - Apply to a test project before the live one.
- **Tests and secrets:**
  - Keep tests free of real credentials and network access.
  - Database tests must use the disposable local cluster, never a hosted project.
- **Architecture and decisions:** see the [CMS architecture document](docs/sophia-cms/FACULTY_HOD_CMS_ARCHITECTURE.md).
