import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve(__dirname, '../../prisma/migrations/20261107120000_add_work_direct_sources')

describe('migration des sources directes', () => {
  const sql = fs
    .readFileSync(path.join(dir, 'migration.sql'), 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  it('est additive : colonnes nullables et index, rien d’autre', () => {
    expect(sql).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME|SET NOT NULL|SET DATA TYPE|DEFAULT)\b/i)
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean)
    for (const statement of statements) {
      expect(statement).toMatch(/^(ALTER TABLE "Work" ADD COLUMN|CREATE (UNIQUE )?INDEX)/)
    }
    expect(sql).not.toMatch(/NOT NULL/i)
  })

  it('ajoute les quatre colonnes attendues', () => {
    for (const column of ['bookingUrl', 'performances', 'dataSource', 'directKey']) {
      expect(sql).toContain(`"${column}"`)
    }
  })
})
