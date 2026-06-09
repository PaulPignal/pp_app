# AGENT.md

## Mission

Keep the existing product working while making the repo easier to understand, change, and upgrade.
Optimize for:

- simple code paths
- explicit boundaries
- low coupling
- small reviewable diffs
- long-term maintenance over short-term cleverness

## Repo Scope

- `app/` is the Next.js application package and owns Prisma.
- `scraper/` is the Python scraper only.
- `data/` contains generated artifacts only. Do not hand-edit data files.
- `scripts/` contains repo-level orchestration.

## Core Architecture Rules

1. `app/src/app/**` is composition only.
   - Pages and layouts compose UI and call server-side feature functions.
   - Route handlers translate HTTP requests into feature calls.
   - Do not keep business rules, Prisma queries, or duplicated validation here.

2. Business logic lives in feature folders, not in generic libs.
   - Preferred target shape inside `app/src/features/<feature>/`:
     - `server/queries.ts` for reads
     - `server/commands.ts` for writes
     - `schemas.ts` for input/output validation
     - `dto.ts` or `mappers.ts` for serialized shapes
     - `ui/` for feature-specific components

3. `app/src/server/**` is infrastructure only.
   - Prisma client wiring
   - auth wiring
   - env loading
   - no product rules

4. Shared helpers must be truly generic.
   - If a helper mentions `Work`, `Reaction`, `Friendship`, `Auth`, or `Offi`, it belongs in a feature folder.
   - Do not add domain code to catch-all helpers like `utils.ts`.

5. Client components stay thin.
   - Allowed: state, events, optimistic UI, browser APIs.
   - Forbidden: Prisma access, auth secrets, server-only imports, business branching that should be shared with the server.

6. Server Components must load data directly from the server layer.
   - Do not call internal `/api/*` routes from Server Components just to reach repo-local logic.
   - Use route handlers for client-side mutations, external consumers, or webhook-style integration boundaries.

7. Keep one source of truth per concept.
   - one validation schema per payload
   - one DTO per public shape
   - one mapper from Prisma model to UI/API shape

8. Prefer explicit functions over abstractions.
   - No base repositories
   - No service locators
   - No generic CRUD wrappers
   - No indirection unless it removes repeated complexity

## Allowed Patterns

- Server Component -> feature query -> Prisma
- Client Component -> route handler -> feature command -> Prisma
- Zod validation at boundaries
- feature-local mappers
- small pure utilities
- optimistic UI only when the rollback or error path is explicit
- `server-only` in server data modules
- focused Vitest tests for route handlers, feature logic, and key UI interactions

## Forbidden Patterns

- internal API fetches from Server Components
- Prisma calls inside client components
- business logic inside `page.tsx`, `layout.tsx`, `app/api/**`, or generic shared components
- duplicated `Work` or payload types across multiple files without a clear boundary reason
- new dependencies to avoid writing a small amount of straightforward code
- silent fallbacks that hide auth, env, or schema errors
- nullable-everywhere models without a domain reason
- large comments that narrate obvious code
- returning internal error text or stack traces to clients (log server-side, return a generic code)
- per-row awaited DB writes in a loop over a remote DB (use bounded concurrency — see "Scraper & ingestion")
- bulk writes via `prisma.$transaction([...])` (the batch array form has a fixed 5s timeout, NOT configurable — only `isolationLevel` is; Neon latency blows past it). Use concurrent upserts without a transaction for bulk.
- relying solely on mocked-DB tests for query logic (they validate wiring, not SQL)

## Current Target Structure

Keep the repo shape small. Do not introduce Nx, Turbo, or extra frameworks.

Recommended direction inside `app/src/`:

- `app/`
- `features/`
- `shared/`
- `server/`

Recommended feature set for this repo:

- `features/auth`
- `features/works`
- `features/reactions`
- `features/friendships`
- `features/common`
- `features/offi-import`

Allowed top-level dirs under `app/`: `src/`, `prisma/`, `tests/`, `public/`, `scripts/`. Do not add new top-level dirs.
Dev tooling lives where it belongs: test infra and benchmarks under `tests/` (e.g. `tests/integration/`, `tests/perf/`), one-off orchestration under `scripts/`. Reuse existing infra (e.g. dotenv via `prisma.config`) instead of hand-rolling parsing.

## Domain Rules For This Repo

- `Reaction` is the single source of truth for swipe state.
- Transitions between `LIKE`, `DISLIKE`, and `SEEN` must be centralized in one server command module.
- `Work.sourceUrl` is the stable external identity for ingestion.
- Ingestion must be idempotent.
- The scraper writes JSONL only.
- The ingestion layer validates every line before touching the database.

## Security Rules

- Validate every external input with Zod at the boundary.
- Never return raw error messages, stack traces, or internal identifiers to clients. Log server-side, return a generic code.
- Rate-limit auth-sensitive endpoints (login, register, invite, friend-add). See `shared/lib/rate-limit.ts`.
- Set security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) in `next.config.mjs`.
- One secret per purpose (do not reuse `NEXTAUTH_SECRET` for invite tokens); minimum 32 bytes; never commit a real `.env`.
- Passwords: min 12 chars with basic complexity. Never log credentials, and never let client responses distinguish "user not found" from "bad password".

## Performance Rules

- Never `await` a DB write per row inside a loop over a remote DB. Use **bounded concurrency** (`Promise.all` over chunks of ~25), NOT `prisma.$transaction([...])`: the batch transaction form has a hard 5s timeout that Neon latency (~125 ms/upsert) exceeds for any non-trivial chunk. Upserts are idempotent, so a transaction buys nothing here. (See ingestion in `features/offi-import/server/ingest.ts`.)
- List endpoints must paginate (cursor on `createdAt`/`id`) — no unbounded `take`.
- Do set operations (intersections, dedup) in SQL, not by loading full sets into the application.

## Dependency Rules

- Use `pnpm` for JavaScript dependencies.
- Do not mix npm, yarn, and pnpm in the same package.
- Keep generated Prisma code out of manual edits.
- Treat `next`, `react`, `react-dom`, `prisma`, `@prisma/*`, and auth packages as coordinated upgrades.
- Prefer built-in Next.js, React, Prisma, and platform capabilities before adding libraries.
- CI must fail on critical production advisories (`pnpm audit --prod --audit-level=critical`) and report high ones (non-blocking). Triage highs via Renovate — some live in transitive tooling deps (e.g. Prisma's config loader) and need an upstream fix. Merge Renovate PRs for `next`/`react`/`prisma`/auth promptly.
- Pin the toolchain: `engines.node`, `.nvmrc`, and CI must agree on the Node major.

## Testing Rules

- Test business rules before testing implementation details.
- Route handlers need request/response tests.
- Add component tests only for meaningful interaction flows.
- Do not add large snapshots.
- Every bug fix should add or update one focused test.
- Tests that mock `@/server/db` validate WIRING ONLY — never query correctness. Every server query/command module needs at least one integration test against a real Postgres (pglite — see `tests/perf/harness.ts`).
- Security primitives (token signing/verification, auth, rate limiting) need dedicated unit tests including tamper/expiry/limit cases.
- For queries on tables expected to grow past ~50k rows, add an `EXPLAIN`/benchmark check under `tests/perf/`.

## Git Workflow

- Start every task by checking `git status --short --branch`.
- Never edit directly on `main`.
- If `HEAD` is `main` and the worktree is clean, create a dedicated branch before editing: `codex/<short-task-slug>`.
- Prefer branching from the current local `main`.
- If `main` is dirty, or if switching branches would risk overwriting local work, stop and ask the user how to handle the existing changes before editing.
- If already on a non-`main` task branch, stay on it unless the user explicitly asks for a fresh branch.
- Do not silently switch branches, pull, merge, rebase, reset, stash, or discard changes.
- Treat user changes as authoritative and leave unrelated modifications untouched.
- In progress updates and in the final summary, state which branch is being used and whether `main` remained untouched.

## Change Workflow

Before editing:

- read nearby files
- identify the boundary that is currently being crossed
- prefer moving logic into an existing feature module over introducing a new abstraction

While editing:

- keep behavior unchanged unless the task explicitly changes behavior
- delete duplication when moving logic
- keep diffs small and reviewable
- split files once they mix responsibilities or become hard to scan

Before finishing:

- run the smallest relevant test set
- note remaining risks clearly
- separate required fixes from optional follow-up refactors

## Strict Anti-Complexity Rules

1. No internal API fetch from Server Components.
2. No feature logic in shared utils.
3. No new dependency to avoid writing 30 lines of code.
4. No duplicate schema or type definitions for the same payload.
5. No route handler over roughly 80 lines without extracting a feature service.
6. No page component mixing auth, data loading, mutation logic, and rendering concerns.
7. No broad `helpers/` or `utils/` folders for domain logic.
8. No magic fallback for env, auth, or data-shape failures.
9. No refactor that moves code without removing duplication.
10. No temporary abstraction without an owner and a reason.

---

# Project knowledge (offi-app)

Hard-won, repo-specific facts. Read before touching scraper, ingestion, CI, or the swipe/likes UI.

## Sections (Work.section)

- Seven sections, free-string column (no DB enum): `theatre`, `cinema`, `streaming`, `exposition`, `concert`, `visite`, `enfants`. All are offi-sourced **except `streaming`** (TMDB — see below).
- **Single source of truth: `app/src/features/works/section.ts`** — `WORK_SECTION_VALUES`, `WORK_SECTION_LABELS` (FR), `inferWorkSectionFromUrl`, `workSectionLabel`, `workDirectorLabel`. Ingestion (`offi-import/schemas`) and the works API import from here; add a section in one place.
- Offi URL shapes: all sections are venue-based `/{section}/{venue}-{id}/{show}-{id}.html` (theatre, exposition `expositions-musees`, concert `concerts`, visite `visites-conferences`, enfants `enfants`) **except cinema** which is `/cinema/evenement/{slug}-{id}.html` (no venue — a film plays in many cinemas).
- UI: section badge + `workDirectorLabel` per section; arrondissement shows for all venue-based sections (not cinema); cinema shows nationality·year + "N salles".

## Scraper & ingestion

- `scraper/parsers.py` holds **pure, unit-tested** functions (no I/O): `extract_credits`, `extract_cinema_meta`, `extract_arrondissement`, `extract_offers`, `extract_description`, `extract_venue`, `extract_cinema_venues`. `offi_scraper.py` delegates to them; `extract_credits_cli.py` re-exposes them for one-off backfills (`app/scripts/backfill-*.ts` pipe page HTML to it).
- **Description**: prioritize `itemprop="description"` (real synopsis, theatre + cinema). The `<meta name=description>` is promotional ("Réservez vos billets…") — last resort only.
- **Offers / availability / structured price** (`extract_offers`): the `offers` microdata (availability `InStock`/`SoldOut`, currency, low/high price) exists mostly on **theatre** pages, and only while a show is **currently bookable**. Past shows have none.
- **Cinema venues** (`extract_cinema_venues`): `.nomSalle` repeats per showtime — dedup. Store a count + a sample of names. Showtimes are too volatile to store (link to offi).
- **Images are already 1000px** in the data (`og:image`); offi serves only `/images/{120,200,1000}/` — other sizes 302 to an error page.
- Cache reuse: `_is_cache_complete` is per-section. An "incomplete" cached entry is re-fetched every run (this is why theatre with missing descriptions never reused cache until the description fix).
- **Ingestion is tolerant** (`readOffiFile`): an invalid or duplicate line is skipped + logged, never aborts the whole run. `nullableMoney` clamps out-of-range prices to `null` (cap 1000) rather than rejecting the record.
- **Bulk upsert uses bounded concurrency, no transaction** (see Performance Rules). Do not reintroduce `$transaction([...])` here.

## Images (next/image)

- Custom loader `app/image-loader.ts` (`images.loader = 'custom'`) rewrites offi URLs to the nearest hosted size (120/200/1000) so images are served **directly by offi**, bypassing the Vercel image optimizer (its Hobby quota was exhausting → broken images in preview/prod).
- `features/works/ui/WorkImage.tsx` wraps `next/image` with an `onError` fallback. It tracks the **failed URL** (`failedSrc`), not a sticky boolean — the SwipeDeck reuses one `WorkImage` instance across cards, so a sticky flag would hide every later image after a single error.

## Venues

- `Venue` model (`kind: theatre | cinema`), `Work.venueId` (nullable, `onDelete: SetNull`). Theatre shows link 1:1; cinema is a catalog only (a film has many venues). `app/scripts/backfill-venues.ts` derives theatre venue URLs from show URLs and relinks; cinema venues are harvested from film pages.

## Source links (Work.officialUrl)

- `Venue.website` = venue official site (offi marks it `rel="external"` on the **venue** page; `parsers.extract_official_website` + social/share host filter). `Work.officialUrl` = the **show-specific** external link when offi exposes one **on the show page** (`rel="external"`) — present for expo/concert, **absent for theatre** (offi handles theatre booking in-house).
- UI priority (`SourceLink`): title → `officialUrl` (dedicated page) when present; venue name → `Venue.website`; else fall back to the offi link. Copy button sits on the primary source.
- **Theatre deep links are discovered, not built**: there is no common URL scheme across venue sites (`/spectacle/`, `/project/`, slug-at-root…). `scraper/discover.py` (`slugify`/`tokens`/`match_titles`, unit-tested) inspects the venue homepage and matches each title **conservatively** (exact-slug, or ≥2 significant tokens) — a wrong link is worse than none. `app/scripts/backfill-official-url-from-venue.ts` fetches the venue site, matches, and writes `officialUrl` **only if the URL returns 200**. Coverage is partial (only shows listed on the homepage; some sites 403/SSL-fail).

## Streaming (TMDB)

- `section='streaming'` films come from **TMDB** (`watch/providers` is JustWatch-powered, FR). No offi. `Work.platforms String[]` (+ GIN index) holds the subscription platforms; `Work.sourceUrl` = TMDB movie URL (stable upsert key), `officialUrl` = TMDB where-to-watch (`/movie/{id}/watch?locale=FR`).
- `app/scripts/ingest-tmdb-streaming.ts` (needs `TMDB_API_KEY`, v3 key): resolves provider IDs **by name** from the FR list, then `/discover/movie` per platform with `with_watch_monetization_types=flatrate|free|ads` (= no extra cost; excludes rent/buy), **aggregating platforms per film**. No per-film detail call (fast, large catalogue). Idempotent: after the run, films not seen get `platforms=[]` (→ hidden, not deleted — reactions preserved).
- Targeted platforms: Netflix, Prime Video, Disney+, Canal+, Arte, TF1+, M6+. **France TV is NOT a TMDB movie provider in FR** (only "France TV Amazon Channel") → absent.
- Query (`listDiscoverWorks`): streaming filters `platforms: { isEmpty: false }` (hide departed) + optional `platforms hasSome` filter; `listStreamingPlatforms()` powers the filter UI (`StreamingPlatformFilter`, state in the URL). Card/modal show platform chips; modal CTA is "Où regarder".
- TMDB poster URLs (`image.tmdb.org`) pass through `image-loader.ts` unchanged (only offi URLs are rewritten).

## Mobile / touch UX

- Swipe (`SwipeDeck`): track horizontal drag via **absolute `clientX - startX`**, never `event.movementX` (unreliable/0 on touch). Capture the pointer on the card; card has `touch-action: none`.
- Global: `touch-action: manipulation` on interactive elements (kills the 300ms double-tap delay), `-webkit-tap-highlight-color: transparent` + `:active` feedback, `overscroll-behavior` on body (limits pull-to-refresh and horizontal back-swipe).

## UI components

- `SegmentedControl` variants: default (panel), `fullWidth` (2-col grid that wraps — `:active` scale), `scroll` (single-row horizontal pill strip, for many items). Likes tabs = `fullWidth`; Discover sections = `scroll`. Container radius is `--radius-lg` (rounded-rect, stays clean on two rows). All inline radii use `--radius-*` tokens — no hard-coded `rounded-[Nrem]`.
- No big `PageHeader` block on pages (removed for vertical space) — pages render a visually-hidden `<h1 className="sr-only">` + the functional controls directly.

## CI / cron runbook

- Two CI workflows, path-filtered: `app-ci.yml` (`app/**`), `scraper-ci.yml` (`scraper/**`). A PR can trigger app-checks **twice** (push + pull_request) — gate merges on **all** runs green.
- **`offi-refresh.yml`** (scheduled + `workflow_dispatch`) runs the pipeline → Neon. Required repo secret: **`DATABASE_URL`** (Neon pooled). Hard-won config:
  - **Node 22** (Prisma 7 imports `node:sqlite`, absent in Node 20 → `ERR_UNKNOWN_BUILTIN_MODULE`).
  - **pnpm 10** via `corepack prepare pnpm@10.0.0 --activate` (project pins `packageManager: pnpm@10`; the pipeline runs `pnpm --dir app` from repo root where corepack would otherwise pick pnpm 11 and refuse).
  - **Preflight `prisma migrate deploy` BEFORE the scrape** (fail-fast: env errors surface in ~10s, not after a ~40min scrape). Pipeline runs with `OFFI_SKIP_DB_DEPLOY=1`.
  - **Cache `data/offi.jsonl`** with `actions/cache/restore` + `actions/cache/save` (`if: always()`) so a failed run's scrape is preserved → incremental retries.
- The pipeline (`scripts/offi-pipeline.sh`) and CLI default to all 6 offi sections. A full 6-section scrape is long; the job `timeout-minutes` is 90.
- **`streaming-refresh.yml`** (weekly, Mon 04:00 UTC + `workflow_dispatch`) runs `ingest-tmdb-streaming.ts` → Neon. Required repo secrets: **`DATABASE_URL`** + **`TMDB_API_KEY`** (the app itself never calls TMDB at runtime — it only reads the DB, so prod/Vercel does NOT need the key).

## Backfill scripts

- Pattern: `app/scripts/backfill-*.ts` select rows where a field is null, fetch the offi page, run it through `extract_credits_cli.py`, update. Run with `pnpm exec tsx --env-file=.env --env-file=.env.local scripts/<x>.ts` (env.ts throws otherwise). Throttle ~350ms (polite).
- **Coverage is naturally partial**: offers/availability, showtimes, and cinema venues only exist for **currently-showing** works — past/repertory entries return nothing. Low backfill counts there are expected, not a bug.

## Local / tooling gotchas

- `gh` is NOT installed. Use the GitHub API with the token from `git credential fill` (host=github.com); the token can create/merge PRs and read checks. Parse JSON with `json.loads(..., strict=False)` (PR bodies contain literal newlines).
- Shell is **zsh**: unquoted `$VAR` does NOT word-split (pass explicit arg lists or use `${=VAR}`); `status` is a read-only builtin (don't name a var `status`); `timeout` is not available; foreground `sleep` is blocked (use background jobs).
- Migrations: hand-write `prisma/migrations/<ts>_<name>/migration.sql`, then `DATABASE_URL=… pnpm exec prisma migrate deploy` (no shadow DB on Neon). Generated client (`src/generated/prisma`) is gitignored — `prisma generate` after any schema change.
