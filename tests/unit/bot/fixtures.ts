/**
 * Test-only knowledge documents. Every value is fictional (example.org sources, invented names); none of it describes
 * the real college and none of it is ever written to knowledge/.
 */
export const AS_OF = "2026-11-12";

export const BASE_FIELDS: Record<string, string> = {
  title: "Example admission process",
  category: "admissions",
  scope: "pce",
  source_url: "https://example.org/admissions",
  verified_by: "Example office",
  verified_on: "2026-11-01",
  review_by: "2027-06-30",
  status: "verified",
};

export const BASE_BODY = "Applications for the example programme open in June.\n\nSee the [official notice](https://example.org/notice).";

/** A knowledge file's text: front matter from BASE_FIELDS with overrides (undefined removes a field), then the body. */
export function docText(overrides: Record<string, string | undefined> = {}, body: string = BASE_BODY): string {
  const fields = { ...BASE_FIELDS, ...overrides };
  const front = Object.entries(fields)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${front}\n---\n${body}\n`;
}
