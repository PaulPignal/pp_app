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

  it('ignore un doublon d’URL (dédoublonnage, sans interrompre)', async () => {
    const records = await readOffiFile(writeJsonl([validLine(1), validLine(1)]))
    expect(records).toHaveLength(1)
  })

  it('rejette un fichier sans aucun enregistrement valide', async () => {
    await expect(readOffiFile(writeJsonl(['', '   ']))).rejects.toThrow(/No records found/)
    const evilOnly = JSON.stringify({ url: 'https://evil.com/x.html', title: 'X', section: 'theatre' })
    await expect(readOffiFile(writeJsonl([evilOnly]))).rejects.toThrow(/No records found/)
  })

  it('ignore une ligne JSON invalide et garde les lignes valides', async () => {
    const records = await readOffiFile(writeJsonl([validLine(1), '{not json', validLine(2)]))
    expect(records).toHaveLength(2)
  })

  it('ignore une URL hors du domaine offi.fr (allowlist) sans tout abandonner', async () => {
    const evil = JSON.stringify({ url: 'https://evil.com/x.html', title: 'X', section: 'theatre' })
    const records = await readOffiFile(writeJsonl([validLine(1), evil, validLine(2)]))
    expect(records).toHaveLength(2)
    expect(records.every((r) => r.url.includes('offi.fr'))).toBe(true)
  })
})
