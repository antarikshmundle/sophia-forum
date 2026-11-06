// Tier 2 target control. Project refs are not secrets.
// The runner refuses every project that is not listed in ALLOWED_TEST_REFS, and always refuses the DENIED refs
// (even if someone adds them to the allowlist). Until the owner supplies the disposable test project's ref,
// ALLOWED_TEST_REFS is empty and every run is refused.

/** @type {Readonly<Record<string, string>>} */
export const DENIED_REFS = Object.freeze({
  mqvhuvtakzrnvuvkkgyt: "sophia-cms-staging",
  mcbsxthyjmptrgfppbsa: "production",
});

/** The disposable Tier 2 test project(s), e.g. "abcdefghijklmnopqrst" (sophia-cms-integration). */
export const ALLOWED_TEST_REFS = Object.freeze([]);

/** Marker row created by setup-test-project.sql; staging and production never have it. */
export const MARKER = Object.freeze({ id: "meta.integration", project: "sophia-cms-integration" });

export const REF_PATTERN = /^[a-z0-9]{20}$/;

/** Every record a Tier 2 run creates has an ID starting with its run ID: it-<yyyymmddhhmm>-<4 hex>-… */
export const RUN_ID_PREFIX = /^it-[0-9]{12}-[0-9a-f]{4}-/;

/** Test-only allowlist overrides are accepted only inside Vitest (which sets VITEST); real runs can't pass one. */
export function testOverride(value, what) {
  if (value === undefined) return undefined;
  if (process.env.VITEST !== "true") throw new Error(`REFUSED: ${what} can only be overridden by the guard's own unit tests.`);
  return value;
}

/**
 * Throws unless ref is an allowlisted, non-denied test project ref. `allowed` exists only for the guard's own unit
 * tests (refused outside Vitest); the denylist is checked first and can't be overridden.
 */
export function assertAllowedRef(ref, source, allowed) {
  allowed = testOverride(allowed, "the allowlist") ?? ALLOWED_TEST_REFS;
  if (!REF_PATTERN.test(ref ?? "")) throw new Error(`REFUSED: ${source} does not contain a valid Supabase project ref.`);
  if (Object.hasOwn(DENIED_REFS, ref)) throw new Error(`REFUSED: ${source} points at ${DENIED_REFS[ref]} (${ref}). Tier 2 tests never run there.`);
  if (!allowed.includes(ref)) {
    throw new Error(allowed.length === 0
      ? `REFUSED: no test project is allowlisted yet. Add the disposable test project's ref to ALLOWED_TEST_REFS in tests/integration/supabase/allowlist.mjs.`
      : `REFUSED: ${source} points at ${ref}, which is not an allowlisted test project.`);
  }
}
