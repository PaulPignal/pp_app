import fs from 'node:fs'
import readline from 'node:readline'
import { prisma } from '@/server/db'
import { buildWorkUpsert } from '@/features/offi-import/mappers'
import { parseOffiJsonLine, type OffiWorkRecord } from '@/features/offi-import/schemas'

export async function readOffiFile(file: string) {
  const records: OffiWorkRecord[] = []
  const seenUrls = new Set<string>()
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  let lineNumber = 0
  for await (const rawLine of rl) {
    lineNumber += 1
    const line = rawLine.trim()
    if (!line) continue

    const record = parseOffiJsonLine(line, lineNumber)
    if (seenUrls.has(record.url)) {
      throw new Error(`Line ${lineNumber}: duplicate url ${record.url}`)
    }

    seenUrls.add(record.url)
    records.push(record)
  }

  if (records.length === 0) {
    throw new Error(`No records found in ${file}`)
  }

  return records
}

export async function ingestOffiFile(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier introuvable: ${file}`)
  }

  const records = await readOffiFile(file)
  let imported = 0

  try {
    for (const record of records) {
      const { create, update } = buildWorkUpsert(record)

      await prisma.work.upsert({
        where: { sourceUrl: record.url },
        update,
        create,
      })

      imported += 1
    }

    await prisma.importJob.create({
      data: {
        source: file,
        imported,
      },
    })
  } finally {
    await prisma.$disconnect()
  }

  return { imported, validated: records.length }
}
