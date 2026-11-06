// Sophia CMS P1 storage tests for bucket faculty-photos (run only after migration 7 is applied to staging).
// sophia-cms-staging ONLY (lib/env.mjs). Uploads go to faculty/qa-storage/…, and every object is removed again.
//   node qa/cms-db/cms-storage.test.mjs
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQaEnv, redact } from "./lib/env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = loadQaEnv(ROOT);
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const anon = createClient(env.url, env.key, opts);
const admin = createClient(env.url, env.key, opts);
const BUCKET = "faculty-photos";

let pass = 0, total = 0;
const check = (name, ok, detail) => {
  total++; if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  — " + redact(JSON.stringify(detail), env).slice(0, 240)}`);
};
// 1×1 JPEG (test bytes only)
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
const BIG = Buffer.concat([JPEG, Buffer.alloc(2.5 * 1024 * 1024)]);
const path = (ext = "jpg") => `faculty/qa-storage/${randomUUID()}.${ext}`;

const s = await admin.auth.signInWithPassword({ email: env.adminEmail, password: env.adminPassword });
if (s.error) { console.log("FAIL  staging test admin sign-in"); process.exit(1); }

const bucket = await admin.storage.getBucket(BUCKET);
check("S1 bucket exists: public, 2 MB limit, JPEG/PNG/WebP only", !bucket.error && bucket.data.public === true && bucket.data.file_size_limit === 2097152
  && JSON.stringify([...(bucket.data.allowed_mime_types ?? [])].sort()) === JSON.stringify(["image/jpeg", "image/png", "image/webp"]), bucket.error ?? bucket.data);

const p1 = path();
check("S2 anon cannot upload", !!(await anon.storage.from(BUCKET).upload(path(), JPEG, { contentType: "image/jpeg" })).error);
const up = await admin.storage.from(BUCKET).upload(p1, JPEG, { contentType: "image/jpeg" });
check("S3 admin uploads a JPEG under faculty/<id>/", !up.error, up.error);
const pub = await fetch(anon.storage.from(BUCKET).getPublicUrl(p1).data.publicUrl);
check("S4 the photo is publicly readable by URL", pub.status === 200 && (pub.headers.get("content-type") ?? "").startsWith("image/jpeg"), { status: pub.status });
check("S5 SVG is rejected", !!(await admin.storage.from(BUCKET).upload(path("svg"), SVG, { contentType: "image/svg+xml" })).error);
check("S6 a file over 2 MB is rejected", !!(await admin.storage.from(BUCKET).upload(path(), BIG, { contentType: "image/jpeg" })).error);
check("S7 uploads outside faculty/ are rejected", !!(await admin.storage.from(BUCKET).upload(`elsewhere/${randomUUID()}.jpg`, JPEG, { contentType: "image/jpeg" })).error);
const anonDel = await anon.storage.from(BUCKET).remove([p1]);
const stillThere = (await admin.storage.from(BUCKET).list("faculty/qa-storage")).data?.some((o) => p1.endsWith(o.name));
check("S8 anon cannot delete", stillThere === true, anonDel.error ?? anonDel.data);
const anonList = await anon.storage.from(BUCKET).list("faculty/qa-storage");
check("S9 anon cannot list objects", !!anonList.error || (anonList.data ?? []).length === 0);
const del = await admin.storage.from(BUCKET).remove([p1]);
const gone = await fetch(anon.storage.from(BUCKET).getPublicUrl(p1).data.publicUrl);
check("S10 admin deletes the photo; its URL stops working", !del.error && gone.status !== 200, { error: del.error, status: gone.status });

// leave nothing behind
const leftovers = (await admin.storage.from(BUCKET).list("faculty/qa-storage")).data ?? [];
if (leftovers.length) await admin.storage.from(BUCKET).remove(leftovers.map((o) => `faculty/qa-storage/${o.name}`));
check("S11 no qa-storage objects left", ((await admin.storage.from(BUCKET).list("faculty/qa-storage")).data ?? []).length === 0);
await admin.auth.signOut();
console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
