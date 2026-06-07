// @vitest-environment node
//
// Tests d'INTÉGRATION sur un vrai moteur Postgres (pglite), pas des mocks.
// Ils valident ce que les tests `vi.mock('@/server/db')` ne peuvent PAS voir :
// la justesse du SQL réellement exécuté, l'anti-jointure, la transition d'état.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createDb, seed, commonCurrent, commonProposed, commonPure, discover } from '../perf/harness'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
  await seed(db, { works: 300, users: 12, reactionsPerUser: 25, powerUsers: 2, powerUserLikes: 40 })
}, 30_000)

afterAll(async () => {
  await db?.close()
})

describe('Œuvres communes — équivalence des stratégies (vrai PG)', () => {
  it('actuelle, proposée et SQL pure renvoient EXACTEMENT la même intersection', async () => {
    const ids = (x: { rows: any[] }) => x.rows.map((r) => r.id).sort()
    const a = await commonCurrent(db, 'u_0', 'u_1')
    const b = await commonProposed(db, 'u_0', 'u_1')
    const c = await commonPure(db, 'u_0', 'u_1')
    expect(a.rows.length).toBeGreaterThan(0)
    expect(ids(a)).toEqual(ids(b))
    expect(ids(a)).toEqual(ids(c))
  })

  it('preuve du sur-transfert : la stratégie actuelle ramène plus de lignes que le résultat', async () => {
    const a = await commonCurrent(db, 'u_0', 'u_1')
    expect(a.transferred).toBeGreaterThan(a.rows.length)
  })

  it('résultat vide et cohérent entre non-amis sans likes communs', async () => {
    const a = await commonCurrent(db, 'u_0', 'u_11')
    const c = await commonPure(db, 'u_0', 'u_11')
    expect(a.rows.map((r) => r.id).sort()).toEqual(c.rows.map((r) => r.id).sort())
  })
})

describe('Discover — anti-jointure NOT EXISTS (vrai PG)', () => {
  it('ne renvoie jamais une œuvre déjà réagie par l’utilisateur', async () => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const { items } = await discover(db, 'u_0', 'theatre', today.toISOString())
    const reacted = await db.query<{ workId: string }>(`SELECT "workId" FROM "Reaction" WHERE "userId"='u_0'`)
    const reactedSet = new Set(reacted.rows.map((r) => r.workId))
    expect(items.length).toBeGreaterThan(0)
    for (const it of items as { id: string }[]) {
      expect(reactedSet.has(it.id)).toBe(false)
    }
  })

  it('exclut les œuvres dont la date de fin est passée', async () => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const { items } = await discover(db, 'u_7', 'cinema', today.toISOString())
    for (const it of items as { endDate: string | null }[]) {
      if (it.endDate !== null) expect(new Date(it.endDate).getTime()).toBeGreaterThanOrEqual(today.getTime())
    }
  })
})

describe('Réaction — unicité (user, work) et transition d’état (vrai PG)', () => {
  it('un upsert LIKE→DISLIKE garde une seule ligne et met à jour le statut', async () => {
    const up = (status: string) =>
      db.exec(
        `INSERT INTO "Reaction"(id,"userId","workId",status,"createdAt","updatedAt")
         VALUES('rt_${status}','u_9','w_290','${status}',now(),now())
         ON CONFLICT ("userId","workId") DO UPDATE SET status=EXCLUDED.status,"updatedAt"=now()`,
      )
    await up('LIKE')
    await up('DISLIKE')
    const r = await db.query<{ status: string }>(`SELECT status FROM "Reaction" WHERE "userId"='u_9' AND "workId"='w_290'`)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].status).toBe('DISLIKE')
  })
})

describe('Suppression en cascade (vrai PG) — valide la migration onDelete: Cascade', () => {
  it('supprimer un User efface ses réactions ET ses amitiés', async () => {
    await db.exec(`INSERT INTO "User"(id,email,"passwordHash") VALUES('u_cas','cas@ex.com','x')`)
    await db.exec(
      `INSERT INTO "Reaction"(id,"userId","workId",status,"createdAt","updatedAt") VALUES('r_cas','u_cas','w_10','LIKE',now(),now())`,
    )
    await db.exec(`INSERT INTO "Friendship"(id,"userId","friendId","createdAt") VALUES('f_cas','u_cas','u_0',now())`)

    await db.exec(`DELETE FROM "User" WHERE id='u_cas'`)

    const reactions = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM "Reaction" WHERE "userId"='u_cas'`)
    const friendships = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM "Friendship" WHERE "userId"='u_cas'`)
    expect(reactions.rows[0].c).toBe(0)
    expect(friendships.rows[0].c).toBe(0)
  })
})

describe('Ingestion — merge non-destructif (vrai PG) — garde C5', () => {
  it('un upsert avec update partiel ne nullifie pas les champs absents', async () => {
    await db.exec(
      `INSERT INTO "Work"(id,title,section,venue,"sourceUrl","createdAt","updatedAt")
       VALUES('wi1','T1','theatre','Théâtre A','ingest://x',now(),now())`,
    )
    // Re-ingest : buildWorkUpsert omet venue (null) → l'update ne touche que title/section.
    await db.exec(
      `INSERT INTO "Work"(id,title,section,"sourceUrl","createdAt","updatedAt")
       VALUES('wi1b','T2','cinema','ingest://x',now(),now())
       ON CONFLICT ("sourceUrl") DO UPDATE SET title=EXCLUDED.title, section=EXCLUDED.section, "updatedAt"=now()`,
    )
    const r = await db.query<{ title: string; section: string; venue: string | null }>(
      `SELECT title, section, venue FROM "Work" WHERE "sourceUrl"='ingest://x'`,
    )
    expect(r.rows[0].title).toBe('T2')
    expect(r.rows[0].section).toBe('cinema')
    expect(r.rows[0].venue).toBe('Théâtre A') // préservé, pas écrasé par NULL
  })
})

describe('Undo de swipe — clearReaction renvoie l’œuvre au deck (vrai PG)', () => {
  it('réagir retire l’œuvre du deck, effacer la réaction l’y réintègre', async () => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const iso = today.toISOString()

    const before = await discover(db, 'u_0', 'theatre', iso)
    const target = (before.items as { id: string }[])[0]
    expect(target).toBeTruthy()

    // Swipe "passer" (DISLIKE) → l'œuvre quitte le deck (anti-jointure NOT EXISTS).
    await db.exec(
      `INSERT INTO "Reaction"(id,"userId","workId",status,"createdAt","updatedAt")
       VALUES('undo_r','u_0','${target.id}','DISLIKE',now(),now())`,
    )
    const during = await discover(db, 'u_0', 'theatre', iso)
    expect((during.items as { id: string }[]).some((w) => w.id === target.id)).toBe(false)

    // Undo = clearReaction (DELETE) → l'œuvre redevient éligible au deck.
    await db.exec(`DELETE FROM "Reaction" WHERE "userId"='u_0' AND "workId"='${target.id}'`)
    const after = await discover(db, 'u_0', 'theatre', iso)
    expect((after.items as { id: string }[]).some((w) => w.id === target.id)).toBe(true)
  })
})
