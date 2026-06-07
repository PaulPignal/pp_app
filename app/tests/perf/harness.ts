/**
 * Banc d'essai performance — Postgres réel (pglite, WASM in-process).
 *
 * Pourquoi pglite : pas de Postgres local dispo, et on refuse de bencher la base
 * Neon de prod (réseau + pollution de données). pglite = vrai moteur Postgres 16
 * compilé en WASM → vrai planificateur, vrais index, EXPLAIN ANALYZE.
 *
 * Limite assumée : pglite tourne IN-PROCESS → coût de round-trip réseau ≈ 0.
 * En prod (Neon distant), chaque requête/statement paie le RTT. Le scénario
 * d'ingestion modélise donc explicitement ce surcoût (cf. run.ts).
 */
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// tests/perf/ → remonte de deux niveaux jusqu'à app/, puis prisma/migrations
const MIGRATIONS = path.resolve(here, '..', '..', 'prisma', 'migrations')

/** Boote une base éphémère et applique les migrations Prisma dans l'ordre (= migrate deploy). */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite()
  const dirs = fs
    .readdirSync(MIGRATIONS)
    .filter((d) => fs.existsSync(path.join(MIGRATIONS, d, 'migration.sql')))
    .sort()
  for (const dir of dirs) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, dir, 'migration.sql'), 'utf-8')
    await db.exec(sql)
  }
  return db
}

export type SeedSpec = {
  works: number
  users: number
  reactionsPerUser: number
  powerUsers: number
  powerUserLikes: number
}

function lit(v: string | number | null): string {
  if (v === null) return 'NULL'
  if (typeof v === 'number') return String(v)
  return `'${v.replace(/'/g, "''")}'`
}

async function bulk(
  db: PGlite,
  table: string,
  cols: string[],
  rows: (string | number | null)[][],
  chunk = 1000,
  conflict = '',
) {
  const colSql = cols.map((c) => `"${c}"`).join(',')
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows
      .slice(i, i + chunk)
      .map((r) => `(${r.map(lit).join(',')})`)
      .join(',')
    await db.exec(`INSERT INTO "${table}" (${colSql}) VALUES ${values} ${conflict}`)
  }
}

/** Seed à l'échelle. Crée 2 "power users" (u_0, u_1) amis, aux LIKE volontairement chevauchants. */
export async function seed(db: PGlite, spec: SeedSpec) {
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const DAY = 86_400_000

  // --- Works ---
  const works: (string | number | null)[][] = []
  for (let i = 0; i < spec.works; i++) {
    const section = i % 2 === 0 ? 'theatre' : 'cinema'
    const bucket = i % 3
    const endDate =
      bucket === 0 ? null : bucket === 1 ? iso(now - ((i % 30) + 1) * DAY) : iso(now + ((i % 60) + 1) * DAY)
    const created = iso(now - i * 60_000)
    works.push([
      `w_${i}`, `Oeuvre ${i}`, section, section === 'theatre' ? 'théâtre' : 'drame',
      `Lieu ${i % 200}`, `Adresse ${i}`, `Desc ${i}`, null, endDate,
      (i % 180) + 30, i % 50, (i % 50) + 20, `https://files.offi.fr/${i}.jpg`,
      `https://www.offi.fr/x/${i}.html`, created, created,
    ])
  }
  await bulk(db, 'Work',
    ['id','title','section','category','venue','address','description','startDate','endDate','durationMin','priceMin','priceMax','imageUrl','sourceUrl','createdAt','updatedAt'],
    works, 500)

  // --- Users ---
  const users: (string | number | null)[][] = []
  for (let i = 0; i < spec.users; i++) users.push([`u_${i}`, `user${i}@ex.com`, 'x'])
  await bulk(db, 'User', ['id', 'email', 'passwordHash'], users, 1000)

  // --- Reactions ---
  const reactions: (string | number | null)[][] = []
  let rid = 0
  const ts = iso(now)
  // power users: LIKE chevauchants sur w_0..powerUserLikes
  for (let p = 0; p < spec.powerUsers; p++) {
    for (let w = 0; w < spec.powerUserLikes; w++) {
      reactions.push([`r_${rid++}`, `u_${p}`, `w_${w}`, 'LIKE', ts, ts])
    }
  }
  // utilisateurs réguliers: sous-ensemble pseudo-aléatoire
  const statuses = ['LIKE', 'DISLIKE', 'SEEN']
  for (let u = spec.powerUsers; u < spec.users; u++) {
    const seen = new Set<number>()
    for (let k = 0; k < spec.reactionsPerUser; k++) {
      const w = Math.floor(Math.random() * spec.works)
      if (seen.has(w)) continue
      seen.add(w)
      reactions.push([`r_${rid++}`, `u_${u}`, `w_${w}`, statuses[k % 3], ts, ts])
    }
  }
  await bulk(db, 'Reaction', ['id', 'userId', 'workId', 'status', 'createdAt', 'updatedAt'], reactions, 1000)

  // --- Friendships (bidirectionnelles) : u_0<->u_1 + une chaîne sur les 50 premiers ---
  const friends: (string | number | null)[][] = []
  let fid = 0
  const limit = Math.min(50, spec.users)
  const push = (a: number, b: number) => {
    friends.push([`f_${fid++}`, `u_${a}`, `u_${b}`, ts])
    friends.push([`f_${fid++}`, `u_${b}`, `u_${a}`, ts])
  }
  push(0, 1)
  for (let a = 0; a < limit; a++) push(a, (a + 1) % limit)
  await bulk(db, 'Friendship', ['id', 'userId', 'friendId', 'createdAt'], friends, 1000,
    'ON CONFLICT ("userId","friendId") DO NOTHING')

  // Stats planificateur — indispensable pour des EXPLAIN ANALYZE réalistes.
  await db.exec('ANALYZE;')

  return { works: works.length, users: users.length, reactions: reactions.length }
}

const WORK_COLS =
  'id,title,section,"imageUrl",category,venue,address,description,"startDate","endDate","durationMin","priceMin","priceMax","sourceUrl"'

/* ---------- COMMON LIKED WORKS : 3 stratégies ---------- */

// Stratégie ACTUELLE — cf. src/features/common/server/queries.ts:23-52
// Charge TOUTES les réactions LIKE des 2 users, intersecte en JS, puis fetch les works.
export async function commonCurrent(db: PGlite, me: string, friend: string) {
  const r = await db.query<{ userId: string; workId: string }>(
    `SELECT "userId","workId" FROM "Reaction" WHERE status='LIKE' AND "userId" IN ($1,$2)`,
    [me, friend],
  )
  const map = new Map<string, Set<string>>()
  for (const row of r.rows) {
    const s = map.get(row.workId) ?? new Set<string>()
    s.add(row.userId)
    map.set(row.workId, s)
  }
  const ids = [...map.entries()].filter(([, u]) => u.has(me) && u.has(friend)).map(([w]) => w)
  if (ids.length === 0) return { rows: [], transferred: r.rows.length }
  const works = await db.query(
    `SELECT ${WORK_COLS} FROM "Work" WHERE id = ANY($1::text[]) ORDER BY "createdAt" DESC`,
    [ids],
  )
  return { rows: works.rows, transferred: r.rows.length }
}

// Stratégie PROPOSÉE (mon §7.1) — mes likes, puis works filtrés par EXISTS côté ami.
export async function commonProposed(db: PGlite, me: string, friend: string) {
  const mine = await db.query<{ workId: string }>(
    `SELECT "workId" FROM "Reaction" WHERE "userId"=$1 AND status='LIKE'`,
    [me],
  )
  const ids = mine.rows.map((r) => r.workId)
  if (ids.length === 0) return { rows: [], transferred: mine.rows.length }
  const works = await db.query(
    `SELECT ${WORK_COLS} FROM "Work" w WHERE w.id = ANY($1::text[])
       AND EXISTS (SELECT 1 FROM "Reaction" r WHERE r."workId"=w.id AND r."userId"=$2 AND r.status='LIKE')
     ORDER BY w."createdAt" DESC`,
    [ids, friend],
  )
  return { rows: works.rows, transferred: mine.rows.length }
}

// Stratégie SQL PURE — une seule requête, double EXISTS, rien chargé inutilement.
export const COMMON_PURE_SQL = `SELECT ${WORK_COLS} FROM "Work" w
   WHERE EXISTS (SELECT 1 FROM "Reaction" r WHERE r."workId"=w.id AND r."userId"=$1 AND r.status='LIKE')
     AND EXISTS (SELECT 1 FROM "Reaction" r WHERE r."workId"=w.id AND r."userId"=$2 AND r.status='LIKE')
   ORDER BY w."createdAt" DESC`
export async function commonPure(db: PGlite, me: string, friend: string) {
  const works = await db.query(COMMON_PURE_SQL, [me, friend])
  return { rows: works.rows, transferred: 0 }
}

/* ---------- DISCOVER : anti-jointure NOT EXISTS ---------- */
export function discoverWhere() {
  return `(("endDate" IS NULL OR "endDate" >= $1) AND section = $2
     AND NOT EXISTS (SELECT 1 FROM "Reaction" r WHERE r."workId" = "Work".id AND r."userId" = $3))`
}
export async function discover(db: PGlite, userId: string, section: string, todayIso: string, per = 200) {
  const w = discoverWhere()
  const count = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM "Work" WHERE ${w}`, [todayIso, section, userId])
  const items = await db.query(
    `SELECT ${WORK_COLS} FROM "Work" WHERE ${w} ORDER BY "createdAt" DESC LIMIT ${per}`,
    [todayIso, section, userId],
  )
  return { total: count.rows[0].c, items: items.rows }
}

/* ---------- Timing ---------- */
export type Stat = { label: string; med: number; p95: number; mean: number; min: number; max: number }
export async function bench(label: string, iters: number, fn: () => Promise<unknown>): Promise<Stat> {
  await fn() // warmup
  const t: number[] = []
  for (let i = 0; i < iters; i++) {
    const s = performance.now()
    await fn()
    t.push(performance.now() - s)
  }
  t.sort((a, b) => a - b)
  const mean = t.reduce((a, b) => a + b, 0) / t.length
  return { label, med: t[(t.length >> 1)], p95: t[Math.floor(t.length * 0.95)], mean, min: t[0], max: t[t.length - 1] }
}

export async function explain(db: PGlite, sql: string, params: unknown[]): Promise<string> {
  const res = await db.query<Record<string, string>>(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`, params)
  return res.rows.map((r) => r['QUERY PLAN']).join('\n')
}

export const fmt = (n: number) => n.toFixed(3).padStart(9)
