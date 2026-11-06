import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, expect, inject } from "vitest";

// `date` columns as "YYYY-MM-DD" strings, as Supabase's REST API returns them (node-postgres would build a
// local-midnight Date, shifting the day in time zones east of UTC)
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

/** Test identities from seed.sql. "owner" is the database owner (bypasses RLS, like the SQL editor). */
export const USERS = {
  admin: "00000000-0000-4000-a000-000000000001",
  manager: "00000000-0000-4000-a000-000000000002",
  noProfile: "00000000-0000-4000-a000-000000000003",
} as const;
export type Who = "anon" | "owner" | keyof typeof USERS;

export interface Db {
  /** Runs one statement in its own transaction as `who` (API role + JWT subject), committing on success. */
  as<R extends pg.QueryResultRow = Record<string, unknown>>(who: Who, sql: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
  /** Several statements as `who` in ONE transaction (committed). */
  tx(who: Who, fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<void>): Promise<void>;
  /** Expects the statement to fail with this SQLSTATE; returns the error. */
  fails(who: Who, sql: string, params: unknown[] | undefined, code: string): Promise<pg.DatabaseError>;
  pool: pg.Pool;
}

async function begin(client: pg.PoolClient, who: Who) {
  await client.query("begin");
  if (who === "owner") return;
  await client.query(`set local role ${who === "anon" ? "anon" : "authenticated"}`);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [who === "anon" ? "" : USERS[who]]);
}

/** A private copy of the migrated template database for this test file, dropped afterwards. */
export function setupDatabase(): Db {
  const db = {} as Db;
  let name = "";
  let pool: pg.Pool;
  const conn = () => inject("pg");

  beforeAll(async () => {
    const { host, port, user, template } = conn();
    if (host !== "127.0.0.1") throw new Error("integration tests only ever connect to the local disposable cluster");
    name = `t_${randomBytes(6).toString("hex")}`;
    const admin = new pg.Client({ host, port, user, database: "postgres" });
    await admin.connect();
    await admin.query(`create database ${name} template ${template}`);
    await admin.end();
    pool = new pg.Pool({ host, port, user, database: name, max: 20 });
    db.pool = pool;
  });

  afterAll(async () => {
    await pool?.end();
    const { host, port, user } = conn();
    const admin = new pg.Client({ host, port, user, database: "postgres" });
    await admin.connect();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  });

  db.as = async (who, sql, params) => {
    const client = await pool.connect();
    try {
      await begin(client, who);
      const r = await client.query(sql, params as unknown[]);
      await client.query("commit");
      return r;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  };

  db.tx = async (who, fn) => {
    const client = await pool.connect();
    try {
      await begin(client, who);
      await fn((sql, params) => client.query(sql, params as unknown[]));
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  };

  db.fails = async (who, sql, params, code) => {
    let error: pg.DatabaseError | undefined;
    try {
      await db.as(who, sql, params);
    } catch (e) {
      error = e as pg.DatabaseError;
    }
    expect(error, `expected SQLSTATE ${code} for: ${sql}`).toBeDefined();
    expect(error!.code, error!.message).toBe(code);
    return error!;
  };

  return db;
}

// ---------------------------------------------------------------- fixtures (inserted as the owner)
export const fixtures = {
  member: (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Member ${id}`, role: "Member", category: "Technical Team", sort_order: 1, is_published: false, ...over }),
  event: (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Event ${id}`, event_date: "2026-03-01", venue: "Seminar Hall", status: "completed", description: "Fixture event.", poster: "/images/poster.png", is_published: false, ...over }),
  gallery: (id: string, over: Record<string, unknown> = {}) => ({ id, title: `Item ${id}`, category: "photo", event: "Fixture", year: 2026, url: "/images/a.jpg", is_published: false, ...over }),
  faculty: (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Dr. ${id}`, designation: "Assistant Professor", sort_order: 1, is_published: false, ...over }),
};

/** INSERT … RETURNING * built from a plain object. */
export function insertSql(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  return { sql: `insert into public.${table} (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning *`, params: keys.map((k) => row[k]) };
}

export async function insertAs(db: Db, who: Who, table: string, row: Record<string, unknown>) {
  const { sql, params } = insertSql(table, row);
  return (await db.as(who, sql, params)).rows[0];
}
