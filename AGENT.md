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

## Domain Rules For This Repo

- `Reaction` is the single source of truth for swipe state.
- Transitions between `LIKE`, `DISLIKE`, and `SEEN` must be centralized in one server command module.
- `Work.sourceUrl` is the stable external identity for ingestion.
- Ingestion must be idempotent.
- The scraper writes JSONL only.
- The ingestion layer validates every line before touching the database.

## Dependency Rules

- Use `pnpm` for JavaScript dependencies.
- Do not mix npm, yarn, and pnpm in the same package.
- Keep generated Prisma code out of manual edits.
- Treat `next`, `react`, `react-dom`, `prisma`, `@prisma/*`, and auth packages as coordinated upgrades.
- Prefer built-in Next.js, React, Prisma, and platform capabilities before adding libraries.

## Testing Rules

- Test business rules before testing implementation details.
- Route handlers need request/response tests.
- Add component tests only for meaningful interaction flows.
- Do not add large snapshots.
- Every bug fix should add or update one focused test.

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
