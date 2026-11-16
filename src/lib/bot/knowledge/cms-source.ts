import {
  publicFromBackend,
  publishedContent,
  publishedFaculty,
  publishedHod,
  publishedLeadership,
  publishedRecords,
  type PublicResult,
} from "@/lib/cms/public";
import { CONTENT_SECTIONS, milestoneValues, sectionValues, type StoredContent } from "@/data/siteContent";
import type { EventItem } from "@/data/staticEvents";
import type { TeamMember } from "@/data/staticTeam";
import type { GalleryMediaItem } from "@/data/staticGallery";
import { chunkMarkdown } from "./chunk.ts";
import { normalizeText } from "./text.ts";
import type { KnowledgeCategory } from "./schema.ts";
import type { KnowledgeChunk } from "./types.ts";

/**
 * Knowledge from the CMS: exactly what the public site shows, read through the site's own public functions
 * (src/lib/cms/public.ts). Those use the publishable key with no session, so Row Level Security returns published
 * records only; this module never creates a Supabase client, never uses a secret key and never writes.
 *
 * - CMS backend off (demo mode): no CMS knowledge at all. The built-in demo data is never treated as fact.
 * - A failed read leaves that section out and is listed in `failed`; the other sections are still returned.
 * - Each chunk cites the site page that shows the record (/about, /team/<id>, /events/<id>, /gallery).
 * - Personal profile links (LinkedIn, GitHub, Instagram, …) and photos are not included; names, roles and the
 *   published text are.
 * - Record text is data written by editors. Stage 2 must pass it to the model as quoted source material, never as
 *   instructions.
 */

export type CmsSection = "content" | "faculty" | "leadership" | "hod" | "team" | "events" | "gallery";
export const CMS_SECTIONS: readonly CmsSection[] = ["content", "leadership", "hod", "faculty", "team", "events", "gallery"];

export type CmsKnowledge =
  | { ok: true; chunks: KnowledgeChunk[]; failed: CmsSection[] }
  | { ok: false; reason: "cms-backend-off" };

const CATEGORY: Record<CmsSection, KnowledgeCategory> = {
  content: "campus", leadership: "college", hod: "departments", faculty: "departments",
  team: "campus", events: "events", gallery: "events",
};

/**
 * What kind of record a passage is, as search keywords (labels, not facts): an event record is an "event", a faculty
 * card is "faculty". Without them, questions like "kaun kaun se events hue hain?" or "विभाग के शिक्षक कौन हैं?" ranked
 * passages that merely mention events or the department above the actual event and faculty records.
 */
const SECTION_KEYWORDS: Partial<Record<CmsSection, string[]>> = { events: ["event"], faculty: ["faculty"] };

const str = (v: unknown) => (typeof v === "string" ? normalizeText(v) : "");
const lines = (...parts: (string | false | null | undefined)[]) => parts.filter((p): p is string => !!p && !!p.trim()).join("\n");

interface Entry {
  section: CmsSection;
  key: string;
  title: string;
  url: string;
  body: string;
}

function toChunks(entries: Entry[]): KnowledgeChunk[] {
  const out: KnowledgeChunk[] = [];
  for (const e of entries) {
    const docId = `cms/${e.section}/${e.key}`;
    chunkMarkdown(e.body).forEach((c, ordinal) => {
      out.push({
        id: `${docId}#${ordinal}`, docId, source: "cms", title: e.title, heading: c.heading, text: c.text,
        category: CATEGORY[e.section], scope: "aids", language: "en", sourceUrl: e.url,
        verifiedOn: null, reviewBy: null, keywords: [...(SECTION_KEYWORDS[e.section] ?? [])], links: c.links,
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------- one builder per section

const FORUM = "Sophia Forum, the student forum of the AI & DS Department at PCE Nagpur";

function contentEntries(stored: StoredContent): Entry[] {
  const known = new Set(CONTENT_SECTIONS.map((s) => s.id));
  const v = (id: string) => (known.has(id) ? sectionValues(id, stored) : {});
  const hero = v("home.hero");
  const about = v("home.about");
  const aboutHero = v("about.hero");
  const pillars = v("about.pillars");
  const entries: Entry[] = [
    {
      section: "content", key: "home-about", title: "About Sophia Forum", url: "/",
      body: lines(
        str(lines(str(hero.subtitleBefore), str(hero.subtitleBold), str(hero.subtitleAfter)).replace(/\n/g, " ")),
        lines(str(about.heading1), str(about.heading2)).replace(/\n/g, " "),
        str(about.paragraph),
        [about.feature1, about.feature2, about.feature3, about.feature4].map(str).filter(Boolean).join(" · "),
      ),
    },
    {
      section: "content", key: "about-mission", title: str(aboutHero.title) || "About Sophia Forum", url: "/about",
      body: lines(
        str(aboutHero.subtitle),
        ...[1, 2, 3].map((i) => (str(pillars[`title${i}`]) && str(pillars[`body${i}`]) ? `## ${str(pillars[`title${i}`])}\n${str(pillars[`body${i}`])}` : "")),
      ),
    },
  ];
  const milestones = milestoneValues(stored)
    .map((m) => (str(m.year) && str(m.title) ? `${str(m.year)}: ${str(m.title)}${str(m.description) ? `. ${str(m.description)}` : ""}` : ""))
    .filter(Boolean);
  if (milestones.length) entries.push({ section: "content", key: "milestones", title: "Journey and milestones", url: "/about", body: milestones.join("\n\n") });
  return entries;
}

function teamEntries(rows: Record<string, unknown>[]): Entry[] {
  return (rows as unknown as TeamMember[]).map((m) => ({
    section: "team" as const, key: m.id, title: `${str(m.name)}, ${str(m.role)}`, url: `/team/${encodeURIComponent(m.id)}`,
    body: lines(
      // short on purpose: the long forum description repeated in every member's passage made generic department
      // questions match committee members (retrieval noise); the forum itself is described by the About content
      `${str(m.name)}: ${str(m.role)} (${str(m.category)}), Sophia Forum student council.`,
      str(m.bio),
      Array.isArray(m.skills) && m.skills.length ? `Skills: ${m.skills.map(str).filter(Boolean).join(", ")}.` : "",
      str(m.quote) && `Quote: "${str(m.quote)}"`,
    ),
  }));
}

function eventEntries(rows: Record<string, unknown>[]): Entry[] {
  return (rows as unknown as EventItem[]).map((e) => ({
    section: "events" as const, key: e.id, title: str(e.name), url: `/events/${encodeURIComponent(e.id)}`,
    body: lines(
      `${str(e.name)}: a ${FORUM} event (${e.status === "upcoming" ? "upcoming" : "already held"}).`,
      `Date: ${str(e.date)}${str(e.time) ? `, ${str(e.time)}` : ""}. Venue: ${str(e.venue)}.`,
      str(e.description),
      str(e.registrationLink) && e.status === "upcoming" ? `Registration: ${str(e.registrationLink)}` : "",
    ),
  }));
}

function galleryEntries(rows: Record<string, unknown>[]): Entry[] {
  return (rows as unknown as GalleryMediaItem[]).map((g) => ({
    section: "gallery" as const, key: g.id, title: str(g.title), url: "/gallery",
    body: `${str(g.title)}: a ${g.category === "video" ? "video" : "photo"} from ${str(g.event)} (${g.year}) in the Sophia Forum gallery.`,
  }));
}

// ---------------------------------------------------------------- loader

/** All published CMS knowledge, read now through the public (RLS-bound) functions. */
export async function loadCmsKnowledge(): Promise<CmsKnowledge> {
  if (!publicFromBackend()) return { ok: false, reason: "cms-backend-off" };
  const failed: CmsSection[] = [];
  const take = <T>(section: CmsSection, r: PublicResult<T>): T | null => {
    if (r.ok) return r.data;
    failed.push(section);
    return null;
  };
  const [content, leadership, hod, faculty, team, events, gallery] = await Promise.all([
    publishedContent(), publishedLeadership(), publishedHod(), publishedFaculty(),
    publishedRecords("team"), publishedRecords("events"), publishedRecords("gallery"),
  ]);
  const entries: Entry[] = [];

  const stored = take("content", content);
  if (stored) entries.push(...contentEntries(stored));

  for (const l of take("leadership", leadership) ?? []) {
    entries.push({ section: "leadership", key: l.id, title: `${str(l.name)}, ${str(l.designation)}`, url: "/about", body: `${str(l.name)}: ${str(l.designation)}. Listed under Institutional Authorities, PCE Nagpur.` });
  }

  const h = take("hod", hod);
  if (h) {
    entries.push({
      section: "hod", key: "message", title: `HOD message: A word from the Head of Department, ${str(h.name)}`, url: "/about",
      body: lines(`A word from the Head of Department: ${str(h.name)}, ${str(h.designation)}.`, str(h.message)),
    });
  }

  for (const f of take("faculty", faculty) ?? []) {
    entries.push({
      section: "faculty", key: f.id, title: `${str(f.name)}, ${str(f.designation)}`, url: "/about",
      body: lines(`${str(f.name)}: ${str(f.designation)}, ${str(f.department)}. Listed under Our Mentors (Faculty) on the Sophia Forum About page.`, f.quote && `Quote: "${str(f.quote)}"`),
    });
  }

  const t = take("team", team);
  if (t) entries.push(...teamEntries(t));
  const e = take("events", events);
  if (e) entries.push(...eventEntries(e));
  const g = take("gallery", gallery);
  if (g) entries.push(...galleryEntries(g));

  return { ok: true, chunks: toChunks(entries.filter((x) => x.body.trim())), failed };
}
