import type { PGlite } from '@electric-sql/pglite'
import {
  bench, commonCurrent, commonProposed, commonPure, COMMON_PURE_SQL,
  createDb, discover, discoverWhere, explain, fmt, seed, type Stat,
} from './harness'

const SPEC = {
  works: Number(process.env.BENCH_WORKS ?? 20_000),
  users: Number(process.env.BENCH_USERS ?? 400),
  reactionsPerUser: Number(process.env.BENCH_RPU ?? 150),
  powerUsers: 2,
  powerUserLikes: Number(process.env.BENCH_POWER ?? 3_000),
}
const ITERS = Number(process.env.BENCH_ITERS ?? 60)

function row(s: Stat) {
  console.log(`  ${s.label.padEnd(40)} med=${fmt(s.med)}ms  p95=${fmt(s.p95)}ms  mean=${fmt(s.mean)}ms`)
}
function rel(a: number, b: number) {
  return b === 0 ? '∞' : `${(a / b).toFixed(2)}×`
}

async function eq(a: { rows: any[] }, b: { rows: any[] }) {
  const ids = (x: any[]) => x.map((r) => r.id).sort().join(',')
  return ids(a.rows) === ids(b.rows)
}

async function scenarioCommon(db: PGlite) {
  console.log('\n━━━ Scénario A — Œuvres communes (u_0 ∩ u_1, deux power users amis) ━━━')
  const cur = await commonCurrent(db, 'u_0', 'u_1')
  const pro = await commonProposed(db, 'u_0', 'u_1')
  const pur = await commonPure(db, 'u_0', 'u_1')
  console.log(`  Résultat: ${cur.rows.length} œuvres communes`)
  console.log(`  Correctness: actuelle==proposée? ${await eq(cur, pro)} | actuelle==SQLpure? ${await eq(cur, pur)}`)
  console.log(`  Lignes transférées app←DB : actuelle=${cur.transferred} | proposée=${pro.transferred} | SQLpure=0`)

  const s1 = await bench('A1 actuelle (load-all + intersect JS)', ITERS, () => commonCurrent(db, 'u_0', 'u_1'))
  const s2 = await bench('A2 proposée (mes likes + EXISTS ami)', ITERS, () => commonProposed(db, 'u_0', 'u_1'))
  const s3 = await bench('A3 SQL pure (double EXISTS, 1 requête)', ITERS, () => commonPure(db, 'u_0', 'u_1'))
  ;[s1, s2, s3].forEach(row)
  console.log(`  Gain latence médiane: A2 ${rel(s1.med, s2.med)} | A3 ${rel(s1.med, s3.med)} plus rapide que l'actuelle`)
  console.log('\n  EXPLAIN ANALYZE (A3 SQL pure):')
  console.log((await explain(db, COMMON_PURE_SQL, ['u_0', 'u_1'])).split('\n').map((l) => '    ' + l).join('\n'))
}

async function scenarioDiscover(db: PGlite) {
  console.log('\n━━━ Scénario B — Discover (anti-jointure NOT EXISTS, per=200) ━━━')
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const iso = today.toISOString()
  const r = await discover(db, 'u_5', 'theatre', iso)
  console.log(`  total=${r.total}, page=${r.items.length}`)
  const s = await bench('B discover (count + page 200)', ITERS, () => discover(db, 'u_5', 'theatre', iso))
  row(s)
  console.log('\n  EXPLAIN ANALYZE (page items, NOT EXISTS):')
  const w = discoverWhere()
  const sql = `SELECT id FROM "Work" WHERE ${w} ORDER BY "createdAt" DESC LIMIT 200`
  console.log((await explain(db, sql, [iso, 'theatre', 'u_5'])).split('\n').map((l) => '    ' + l).join('\n'))
}

async function scenarioIngest(db: PGlite) {
  console.log('\n━━━ Scénario C — Ingestion (upsert N=5000) ━━━')
  const N = 5000
  const mk = (prefix: string, i: number) =>
    [`'${prefix}_${i}'`, `'Titre ${i}'`, `'theatre'`, `'https://www.offi.fr/${prefix}/${i}'`, `now()`, `now()`].join(',')
  const cols = `(id,title,section,"sourceUrl","createdAt","updatedAt")`
  const onConf = `ON CONFLICT ("sourceUrl") DO UPDATE SET title=EXCLUDED.title, section=EXCLUDED.section, "updatedAt"=now()`

  // C1 — séquentiel (mime la boucle de prisma.work.upsert), keyspace dédié
  let t = performance.now()
  for (let i = 0; i < N; i++) {
    await db.exec(`INSERT INTO "Work" ${cols} VALUES (${mk('seq', i)}) ${onConf}`)
  }
  const c1 = performance.now() - t

  // C2 — batché, chunks de 500 (multi-row INSERT ... ON CONFLICT)
  t = performance.now()
  const CHUNK = 500
  for (let i = 0; i < N; i += CHUNK) {
    const vals: string[] = []
    for (let j = i; j < Math.min(i + CHUNK, N); j++) vals.push(`(${mk('batch', j)})`)
    await db.exec(`INSERT INTO "Work" ${cols} VALUES ${vals.join(',')} ${onConf}`)
  }
  const c2 = performance.now() - t

  // C3 — séquentiel mais dans UNE transaction
  t = performance.now()
  await db.transaction(async (tx) => {
    for (let i = 0; i < N; i++) {
      await tx.exec(`INSERT INTO "Work" ${cols} VALUES (${mk('tx', i)}) ${onConf}`)
    }
  })
  const c3 = performance.now() - t

  console.log(`  C1 séquentiel (${N} statements)        : ${c1.toFixed(0)} ms  (${(c1 / N).toFixed(3)} ms/ligne)`)
  console.log(`  C2 batché 500/req (${Math.ceil(N / CHUNK)} statements)     : ${c2.toFixed(0)} ms  (${rel(c1, c2)} plus rapide)`)
  console.log(`  C3 séquentiel en 1 transaction        : ${c3.toFixed(0)} ms  (${rel(c1, c3)} plus rapide)`)

  console.log('\n  Projection coût RÉSEAU (Neon distant) — pglite est in-process, donc RTT≈0 ici.')
  console.log('  Modèle: temps ≈ temps_local + (nb statements aller-retour) × RTT')
  console.log('  ┌─────────────┬───────────────────────┬───────────────────────┐')
  console.log('  │  RTT Neon   │  C1 séquentiel (5000)  │  C2 batché (10 req)    │')
  console.log('  ├─────────────┼───────────────────────┼───────────────────────┤')
  for (const rtt of [1, 5, 15]) {
    const seqMs = (c1 + N * rtt).toFixed(0).padStart(9)
    const batchMs = (c2 + Math.ceil(N / CHUNK) * rtt).toFixed(0).padStart(9)
    console.log(`  │  ${String(rtt).padStart(2)} ms      │  ${seqMs} ms          │  ${batchMs} ms          │`)
  }
  console.log('  └─────────────┴───────────────────────┴───────────────────────┘')
}

async function main() {
  const t0 = performance.now()
  const db = await createDb()
  console.log(`Seeding: works=${SPEC.works} users=${SPEC.users} ~reactions/user=${SPEC.reactionsPerUser} power=${SPEC.powerUsers}×${SPEC.powerUserLikes} LIKE…`)
  const counts = await seed(db, SPEC)
  console.log(`Seedé en ${((performance.now() - t0) / 1000).toFixed(1)}s → ${counts.reactions} réactions, ${counts.works} works (iters bench=${ITERS})`)

  await scenarioCommon(db)
  await scenarioDiscover(db)
  await scenarioIngest(db)

  await db.close()
  console.log(`\nTotal: ${((performance.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
