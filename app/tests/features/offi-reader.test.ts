import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// readOffiFile n'utilise pas Prisma, mais ingest.ts importe @/server/db au chargement.
vi.mock('@/server/db', () => ({ prisma: {} }))

import { readOffiFile } from '@/features/offi-import/server/ingest'

const tmpFiles: string[] = []
function writeJsonl(lines: string[]): string {
  const file = path.join(os.tmpdir(), `offi-reader-${process.pid}-${tmpFiles.length}.jsonl`)
  fs.writeFileSync(file, lines.join('\n'))
  tmpFiles.push(file)
  return file
}
const validLine = (n: number) =>
  JSON.stringify({ url: `https://www.offi.fr/theatre/x/${n}.html`, title: `Pièce ${n}`, section: 'theatre' })

afterEach(() => {
  for (const f of tmpFiles.splice(0)) fs.rmSync(f, { force: true })
})

describe('readOffiFile (lecture JSONL réelle)', () => {
  it('parse des lignes valides et ignore les lignes vides', async () => {
    const records = await readOffiFile(writeJsonl([validLine(1), '', validLine(2), '   ']))
    expect(records).toHaveLength(2)
    expect(records[0].url).toContain('/1.html')
  })

  it('rejette un doublon d’URL dans le fichier', async () => {
    const file = writeJsonl([validLine(1), validLine(1)])
    await expect(readOffiFile(file)).rejects.toThrow(/duplicate url/)
  })

  it('rejette un fichier sans aucun enregistrement', async () => {
    await expect(readOffiFile(writeJsonl(['', '   ']))).rejects.toThrow(/No records found/)
  })

  it('rejette une ligne JSON invalide avec le numéro de ligne', async () => {
    await expect(readOffiFile(writeJsonl([validLine(1), '{not json']))).rejects.toThrow(/Line 2/)
  })

  it('rejette une URL hors du domaine offi.fr (allowlist)', async () => {
    const evil = JSON.stringify({ url: 'https://evil.com/x.html', title: 'X', section: 'theatre' })
    await expect(readOffiFile(writeJsonl([evil]))).rejects.toThrow(/Expected an Offi URL/)
  })
})
