/**
 * Demo-store resolution (local demo mode only). Pure functions with no React or browser globals.
 *
 * The store ("sophia-demo-store-v1") records the hash of the seed it was built from. When the seed in src/data
 * changes, the store is rebuilt once: current seed + records the user created. Edits to seed records, invalid
 * records, duplicates and records whose ID is taken by the current seed are not carried.
 */

export const COLLECTION_KEYS = ["events", "gallery", "team", "faculty", "users"] as const;
export type CollectionKey = (typeof COLLECTION_KEYS)[number];
type Collections = { [K in CollectionKey]: { id: string }[] };

/** Stored alongside the collections; not a collection itself. */
export const SEED_HASH_FIELD = "__seedHash";

// Fields each admin screen relies on; stored records missing them are dropped
const REQUIRED_FIELDS: Record<CollectionKey, { strings: string[]; numbers?: string[] }> = {
  events: { strings: ["id", "name", "date", "venue", "status"] },
  gallery: { strings: ["id", "title", "category", "event", "url"], numbers: ["year"] },
  team: { strings: ["id", "name", "role", "category"], numbers: ["sortOrder"] },
  faculty: { strings: ["id", "name", "designation", "image"], numbers: ["sortOrder"] },
  users: { strings: ["id", "email", "name", "role"] },
};

export function isValidRecord(key: CollectionKey, item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  const { strings, numbers = [] } = REQUIRED_FIELDS[key];
  return (
    strings.every((f) => typeof record[f] === "string") &&
    numbers.every((f) => typeof record[f] === "number") &&
    record.id !== ""
  );
}

/** FNV-1a over the seed JSON: changes whenever src/data changes, which re-runs the carry-over once. */
export function hashSeed(seed: unknown): string {
  const text = JSON.stringify(seed);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A stored entry as an object, or null when it is missing, not JSON, or not an object. */
export function parseStore(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface CollectionReport {
  seed: number;
  stored: number;
  kept: number;
  droppedInvalid: number;
  droppedCollision: number;
  droppedDuplicate: number;
  result: number;
}

/** Current seed plus the user-created records of `stored`, with a per-collection account of every stored record. */
export function carryOver<S extends Collections>(seed: S, stored: Record<string, unknown>) {
  const report = {} as Record<CollectionKey, CollectionReport>;
  const collections = Object.fromEntries(
    COLLECTION_KEYS.map((key) => {
      const seedIds = new Set(seed[key].map((r) => r.id));
      const records = Array.isArray(stored[key]) ? (stored[key] as unknown[]) : [];
      const seen = new Set<string>();
      const kept: S[CollectionKey] = [];
      const r: CollectionReport = { seed: seed[key].length, stored: records.length, kept: 0, droppedInvalid: 0, droppedCollision: 0, droppedDuplicate: 0, result: 0 };
      for (const item of records) {
        if (!isValidRecord(key, item)) { r.droppedInvalid++; continue; }
        const id = (item as { id: string }).id;
        if (seedIds.has(id)) r.droppedCollision++;
        else if (seen.has(id)) r.droppedDuplicate++;
        else { seen.add(id); kept.push(item as S[CollectionKey][number]); }
      }
      r.kept = kept.length;
      r.result = seed[key].length + kept.length;
      report[key] = r;
      return [key, [...seed[key], ...kept]];
    })
  ) as S;
  return { collections, report };
}

/** Stored collections as read today: valid records kept; the seed when a collection is missing or has none valid. */
function readStored<S extends Collections>(seed: S, stored: Record<string, unknown>): S {
  return Object.fromEntries(
    COLLECTION_KEYS.map((key) => {
      const records = stored[key];
      if (!Array.isArray(records)) return [key, seed[key]];
      const valid = records.filter((item) => isValidRecord(key, item));
      return [key, valid.length === 0 && records.length > 0 ? seed[key] : valid];
    })
  ) as S;
}

export type StoreSource = "current" | "current-outdated" | "current-unreadable" | "none";

export interface Resolution<S> {
  collections: S;
  source: StoreSource;
  /** True when the result must be written to the store key (a carry-over happened). */
  persist: boolean;
  report: Record<CollectionKey, CollectionReport> | null;
}

/**
 * Decides what the admin shows from the raw localStorage entry. Never writes; the caller persists when told to.
 * - entry built from this seed: used as stored;
 * - entry built from another seed (or without a hash): carried over onto the new seed;
 * - entry unreadable: seed in memory, nothing written (the entry is replaced only by the next admin edit);
 * - no entry: the plain seed (nothing written until the first edit).
 */
export function resolveStore<S extends Collections>(raw: string | null, seed: S, seedHash: string): Resolution<S> {
  if (raw === null) return { collections: seed, source: "none", persist: false, report: null };
  const current = parseStore(raw);
  if (!current) return { collections: seed, source: "current-unreadable", persist: false, report: null };
  if (current[SEED_HASH_FIELD] === seedHash) return { collections: readStored(seed, current), source: "current", persist: false, report: null };
  return { ...carryOver(seed, current), source: "current-outdated", persist: true };
}
