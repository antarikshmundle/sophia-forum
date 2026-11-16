// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateDocument, isCurrent, isSafeLink, parseFrontMatter, todayInIndia } from "@/lib/bot/knowledge/schema";
import { AS_OF, docText } from "./fixtures";

const PATH = "pce/admissions/example-admission.md";
const evaluate = (overrides: Record<string, string | undefined> = {}, body?: string, path = PATH, asOf = AS_OF) =>
  evaluateDocument(path, docText(overrides, body), asOf);

describe("valid metadata", () => {
  it("a complete verified document is included with every field", () => {
    const r = evaluate({ language: "hi", keywords: "pravesh, दाखिला" });
    expect(r).toMatchObject({ id: "pce/admissions/example-admission", included: true, reasons: [], messages: [] });
    expect(r.document).toEqual({
      id: "pce/admissions/example-admission", path: PATH, title: "Example admission process", category: "admissions", scope: "pce",
      sourceUrl: "https://example.org/admissions", verifiedBy: "Example office", verifiedOn: "2026-11-01", reviewBy: "2027-06-30",
      status: "verified", language: "hi", keywords: ["pravesh", "दाखिला"],
      content: "Applications for the example programme open in June.\n\nSee the [official notice](https://example.org/notice).",
    });
  });

  it("language defaults to en, quoted values and CRLF line ends are accepted, a site path is a valid source", () => {
    const raw = docText({ title: '"Quoted: title"', source_url: "/about", scope: "aids" }).replace(/\n/g, "\r\n");
    const r = evaluateDocument(PATH, raw, AS_OF);
    expect(r.included).toBe(true);
    expect(r.document).toMatchObject({ title: "Quoted: title", sourceUrl: "/about", scope: "aids", language: "en" });
  });

  it("every category folder is accepted when the category matches it", () => {
    for (const c of ["college", "departments", "academics", "admissions", "facilities", "contacts", "campus", "policies", "events"]) {
      expect(evaluate({ category: c }, undefined, `pce/${c}/topic.md`).included).toBe(true);
    }
  });
});

describe("invalid metadata", () => {
  it.each<[string, Record<string, string | undefined>, RegExp]>([
    ["unknown field", { author: "x" }, /Unknown field "author"/],
    ["unknown category", { category: "sports" }, /category must be one of/],
    ["unknown scope", { scope: "university" }, /scope must be one of/],
    ["unknown status", { status: "published" }, /status must be one of/],
    ["missing status", { status: undefined }, /status must be one of/],
    ["missing title", { title: undefined }, /title is required/],
    ["missing verifier", { verified_by: undefined }, /verified_by is required/],
    ["impossible date", { verified_on: "2026-02-30" }, /verified_on must be a real date/],
    ["missing review date", { review_by: undefined }, /review_by must be a real date/],
    ["review before verification", { verified_on: "2026-11-01", review_by: "2026-10-01" }, /review_by must be after verified_on/],
    ["review window over a year", { verified_on: "2026-11-01", review_by: "2027-12-01" }, /at most 366 days/],
    ["verified in the future", { verified_on: "2026-12-01", review_by: "2027-06-01" }, /in the future/],
    ["unknown language", { language: "fr" }, /language must be one of/],
    ["http source", { source_url: "http://example.org/x" }, /source_url must be an https/],
    ["script source", { source_url: "javascript:alert(1)" }, /source_url must be an https/],
    ["protocol-relative source", { source_url: "//evil.example/x" }, /source_url must be an https/],
  ])("%s → excluded as invalid-metadata", (_, overrides, message) => {
    const r = evaluate(overrides);
    expect(r.included).toBe(false);
    expect(r.reasons).toContain("invalid-metadata");
    expect(r.messages.join("\n")).toMatch(message);
    expect(r.document).toBeUndefined();
  });

  it("the category must match the folder the file is in", () => {
    const r = evaluate({ category: "contacts" });
    expect(r.reasons).toEqual(["invalid-metadata"]);
    expect(r.messages[0]).toMatch(/does not match the folder "admissions"/);
  });

  it.each([["pce/admissions/Fees 2026.md"], ["pce/fees.md"], ["other/admissions/x.md"], ["pce/admissions/sub/x.md"]])("bad location or file name %s", (path) => {
    expect(evaluate({}, undefined, path).reasons).toContain("invalid-metadata");
  });

  it.each([
    ["no front matter", "Just text"],
    ["unclosed front matter", "---\ntitle: x\n"],
    ["a line that is not key: value", "---\ntitle: x\n- list item\n---\nbody"],
    ["a duplicated field", "---\ntitle: a\ntitle: b\n---\nbody"],
  ])("malformed front matter: %s", (_, raw) => {
    const r = evaluateDocument(PATH, raw, AS_OF);
    expect(r).toMatchObject({ included: false, reasons: ["invalid-metadata"] });
  });

  it("parseFrontMatter returns the fields and the body", () => {
    expect(parseFrontMatter("---\na: 1\nb: \"two\"\n\n---\nBody\n")).toEqual({ ok: true, fields: { a: "1", b: "two" }, body: "Body\n" });
  });

  it("all problems are reported at once", () => {
    const r = evaluate({ scope: "x", status: "draft", source_url: undefined });
    expect(r.reasons).toEqual(expect.arrayContaining(["invalid-metadata", "draft", "missing-source"]));
  });
});

describe("draft documents", () => {
  it("a draft is never included, even when every other field is valid", () => {
    const r = evaluate({ status: "draft" });
    expect(r).toMatchObject({ included: false, reasons: ["draft"] });
    expect(r.document).toBeUndefined();
  });

  it("a draft may still lack its verification fields (it is only reported as a draft)", () => {
    expect(evaluate({ status: "draft", verified_by: undefined, verified_on: undefined, review_by: undefined }).reasons).toEqual(["draft"]);
  });
});

describe("expired documents", () => {
  it("is current through its review_by day and excluded from the next day on", () => {
    expect(evaluate({}, undefined, PATH, "2027-06-30").included).toBe(true);
    const r = evaluate({}, undefined, PATH, "2027-07-01");
    expect(r).toMatchObject({ included: false, reasons: ["expired"] });
    expect(r.messages[0]).toMatch(/review_by 2027-06-30 has passed/);
  });

  it("isCurrent: live records (no review date) never expire", () => {
    expect(isCurrent(null, "2099-01-01")).toBe(true);
    expect(isCurrent("2026-11-12", "2026-11-12")).toBe(true);
    expect(isCurrent("2026-11-11", "2026-11-12")).toBe(false);
  });

  it("todayInIndia uses IST (UTC+05:30)", () => {
    expect(todayInIndia(new Date("2026-11-12T18:29:59Z"))).toBe("2026-11-12");
    expect(todayInIndia(new Date("2026-11-12T18:30:00Z"))).toBe("2026-11-13");
  });
});

describe("missing source", () => {
  it.each([[undefined], [""]])("no source_url (%j) → excluded as missing-source", (value) => {
    const r = evaluate({ source_url: value });
    expect(r).toMatchObject({ included: false, reasons: ["missing-source"] });
    expect(r.messages[0]).toMatch(/source_url is required/);
  });
});

describe("content rules", () => {
  it.each<[string, string, RegExp]>([
    ["empty", "   ", /no content/],
    ["raw HTML", "Hello <script>alert(1)</script>", /contains HTML/],
    ["a javascript: link", "See [this](javascript:alert(1)).", /Links must be/],
    ["a plain http link", "See http://example.org/page for details.", /Links must be/],
    ["placeholder text", "Fees: TBD", /placeholder text/],
    ["a fill-in marker", "Contact [insert phone number].", /placeholder text/],
    ["too long", "x".repeat(20_001), /longer than 20000/],
  ])("%s → excluded as invalid-content", (_, body, message) => {
    const r = evaluate({}, body);
    expect(r.reasons).toContain("invalid-content");
    expect(r.messages.join("\n")).toMatch(message);
  });

  it("official mailto: and tel: links are allowed in the content", () => {
    expect(evaluate({ category: "contacts" }, "Write to [the office](mailto:office@example.org) or call [the desk](tel:+911234567890).", "pce/contacts/office.md").included).toBe(true);
  });

  it("isSafeLink", () => {
    for (const ok of ["https://example.org", "https://example.org/a?b=c#d", "/about", "/events/x"]) expect(isSafeLink(ok)).toBe(true);
    for (const bad of ["http://example.org", "https://user:pw@example.org", "https://localhost", "//x.org", "/\\x.org", "/a/../b", "ftp://x.org", "mailto:a@b.co"]) expect(isSafeLink(bad)).toBe(false);
  });
});
