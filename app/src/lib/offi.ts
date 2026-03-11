import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeString(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function nullableString(max: number) {
  return z.preprocess(normalizeString, z.string().max(max).nullable());
}

function nullableHttpUrl(max: number) {
  return z.preprocess(
    normalizeString,
    z
      .string()
      .url()
      .max(max)
      .refine((value) => value.startsWith("http://") || value.startsWith("https://"), "Expected an HTTP URL")
      .nullable(),
  );
}

const NullableIsoDate = z.preprocess(
  normalizeString,
  z
    .string()
    .regex(ISO_DATE_RE, "Expected YYYY-MM-DD")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Invalid calendar date")
    .nullable(),
);

const NullableDateTime = z.preprocess(
  normalizeString,
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid datetime")
    .nullable(),
);

const NullableInt = z.preprocess(
  (value) => (value === undefined || value === null || value === "" ? null : value),
  z.number().int().positive().max(600).nullable(),
);

const NullableMoney = z.preprocess(
  (value) => (value === undefined || value === null || value === "" ? null : value),
  z.number().nonnegative().max(500).nullable(),
);

export const OffiWorkSchema = z
  .object({
    url: z.string().url().max(500).refine((value) => value.startsWith("https://www.offi.fr/"), "Expected an Offi URL"),
    title: z.preprocess(normalizeString, z.string().min(1).max(280)),
    category: nullableString(120),
    venue: nullableString(160),
    address: nullableString(240),
    arrondissement: nullableString(80),
    date_start: NullableIsoDate,
    date_end: NullableIsoDate,
    duration_min: NullableInt,
    price_min_eur: NullableMoney,
    price_max_eur: NullableMoney,
    image: nullableHttpUrl(500),
    description: nullableString(20_000),
    crawled_at: NullableDateTime,
  })
  .transform((record) => {
    let dateStart = record.date_start;
    let dateEnd = record.date_end;
    let priceMin = record.price_min_eur;
    let priceMax = record.price_max_eur;

    if (dateStart && dateEnd && dateEnd < dateStart) {
      [dateStart, dateEnd] = [dateEnd, dateStart];
    }

    if (priceMin != null && priceMax != null && priceMin > priceMax) {
      [priceMin, priceMax] = [priceMax, priceMin];
    }

    return {
      ...record,
      date_start: dateStart,
      date_end: dateEnd,
      price_min_eur: priceMin,
      price_max_eur: priceMax,
    };
  });

export type OffiWorkRecord = z.infer<typeof OffiWorkSchema>;

export function parseOffiJsonLine(line: string, lineNumber: number): OffiWorkRecord {
  let raw: unknown;

  try {
    raw = JSON.parse(line) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Line ${lineNumber}: invalid JSON (${message})`);
  }

  const parsed = OffiWorkSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
    throw new Error(`Line ${lineNumber}: invalid Offi record (${details})`);
  }

  return parsed.data;
}

function toDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function buildWorkUpsert(record: OffiWorkRecord): {
  create: Prisma.WorkCreateInput;
  update: Prisma.WorkUpdateInput;
} {
  const create: Prisma.WorkCreateInput = {
    title: record.title,
    category: record.category ?? null,
    venue: record.venue ?? null,
    address: record.address ?? null,
    description: record.description ?? null,
    startDate: toDate(record.date_start),
    endDate: toDate(record.date_end),
    durationMin: record.duration_min ?? null,
    priceMin: record.price_min_eur ?? null,
    priceMax: record.price_max_eur ?? null,
    imageUrl: record.image ?? null,
    sourceUrl: record.url,
  };

  const update: Prisma.WorkUpdateInput = {
    title: record.title,
  };

  if (record.category != null) update.category = record.category;
  if (record.venue != null) update.venue = record.venue;
  if (record.address != null) update.address = record.address;
  if (record.description != null) update.description = record.description;
  if (record.date_start != null) update.startDate = toDate(record.date_start);
  if (record.date_end != null) update.endDate = toDate(record.date_end);
  if (record.duration_min != null) update.durationMin = record.duration_min;
  if (record.price_min_eur != null) update.priceMin = record.price_min_eur;
  if (record.price_max_eur != null) update.priceMax = record.price_max_eur;
  if (record.image != null) update.imageUrl = record.image;

  return { create, update };
}
