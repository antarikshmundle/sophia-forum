/**
 * The editable text of the existing home and About sections (Admin → Content). Each section lists its fields and
 * their built-in defaults (the text the site shows today). Demo mode renders the defaults; CMS backend mode renders
 * the stored values (site_content) over the defaults. No new sections: every field is an existing text slot.
 */

export type ContentFieldType = "text" | "textarea" | "number";

export interface ContentField {
  key: string;
  label: string;
  type: ContentFieldType;
  /** text/textarea: max characters; number: max value */
  max: number;
  /** may be left empty (the element is then not shown) */
  optional?: boolean;
}

export interface ContentSection {
  id: string;
  label: string;
  fields: ContentField[];
  defaults: Record<string, string | number>;
}

const t = (key: string, label: string, max = 200, optional = false): ContentField => ({ key, label, type: "text", max, optional });
const area = (key: string, label: string, max = 1000): ContentField => ({ key, label, type: "textarea", max });
const n = (key: string, label: string, max = 100000): ContentField => ({ key, label, type: "number", max });

export const CONTENT_SECTIONS: ContentSection[] = [
  {
    id: "home.hero",
    label: "Home · Hero",
    fields: [
      t("badge", "Badge"), t("title1", "Title, line 1", 40), t("title2", "Title, line 2", 40),
      t("subtitleBefore", "Subtitle, before the bold part", 200, true), t("subtitleBold", "Subtitle, bold part", 120, true), t("subtitleAfter", "Subtitle, after the bold part", 300, true),
      n("stat1Value", "Statistic 1, number"), t("stat1Suffix", "Statistic 1, suffix", 4, true), t("stat1Label", "Statistic 1, label", 30),
      n("stat2Value", "Statistic 2, number"), t("stat2Suffix", "Statistic 2, suffix", 4, true), t("stat2Label", "Statistic 2, label", 30),
      n("stat3Value", "Statistic 3, number"), t("stat3Suffix", "Statistic 3, suffix", 4, true), t("stat3Label", "Statistic 3, label", 30),
      n("stat4Value", "Statistic 4, number"), t("stat4Suffix", "Statistic 4, suffix", 4, true), t("stat4Label", "Statistic 4, label", 30),
    ],
    defaults: {
      badge: "AI & DS DEPARTMENT • PCE NAGPUR", title1: "SOPHIA", title2: "FORUM",
      subtitleBefore: "The", subtitleBold: "student forum", subtitleAfter: "of the AI & DS Department at PCE Nagpur.",
      stat1Value: 20, stat1Suffix: "+", stat1Label: "Events",
      stat2Value: 50, stat2Suffix: "+", stat2Label: "Members",
      stat3Value: 100, stat3Suffix: "%", stat3Label: "Student Driven",
      stat4Value: 6, stat4Suffix: "+", stat4Label: "Years",
    },
  },
  {
    id: "home.terminal",
    label: "Home · Terminal lines",
    fields: [1, 2, 3, 4, 5, 6, 7].map((i) => t(`line${i}`, `Line ${i}`, 60, true)),
    defaults: {
      line1: "$ sophia --init", line2: "> Initializing AI & DS forum hub...", line3: "> Loading 50+ active members ████ OK",
      line4: "> Events hosted: 20+ events & competitions", line5: "> Tech stack: React • TypeScript • Tailwind",
      line6: "> Status: ACTIVE • Ready to innovate", line7: "$ welcome --to sophia",
    },
  },
  {
    id: "home.marquee",
    label: "Home · Scrolling words",
    fields: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t(`word${i}`, `Word ${i}`, 24)),
    defaults: { word1: "INNOVATE", word2: "COLLABORATE", word3: "LEARN", word4: "BUILD", word5: "CREATE", word6: "CONNECT", word7: "EXPLORE", word8: "GROW" },
  },
  {
    id: "home.about",
    label: "Home · About section",
    fields: [
      t("eyebrow", "Badge"), t("heading1", "Heading, line 1", 60), t("heading2", "Heading, line 2 (blue)", 60), area("paragraph", "Paragraph", 600),
      t("feature1", "Feature 1", 40), t("feature2", "Feature 2", 40), t("feature3", "Feature 3", 40), t("feature4", "Feature 4", 40),
      t("button", "Button", 40),
      t("photo", "Photo (upload, or a site image path /images/…)", 300, true), t("photoCaption", "Photo caption", 40, true), t("photoBadge", "Photo badge", 30, true),
      t("footerLeft", "Under the photo, left", 40, true), t("footerRight", "Under the photo, right", 40, true),
    ],
    defaults: {
      eyebrow: "ABOUT SOPHIA FORUM", heading1: "MORE THAN A CLUB.", heading2: "A TECH MOVEMENT.",
      paragraph: "A platform for AI & DS students to connect, collaborate, learn and build together.",
      feature1: "Technical Events", feature2: "Student Community", feature3: "Innovation & Projects", feature4: "Learning & Collaboration",
      button: "DISCOVER OUR MISSION",
      // No community photo by default; it is uploaded in Admin → Content.
      photo: "", photoCaption: "", photoBadge: "50+ MEMBERS", footerLeft: "Community Driven", footerRight: "Est. 2020",
    },
  },
  {
    id: "home.cta",
    label: "Home · Call to action",
    fields: [t("heading1", "Heading, line 1", 60), t("heading2", "Heading, line 2", 60), area("paragraph", "Paragraph", 600)],
    defaults: {
      heading1: "READY TO BUILD", heading2: "WITH SOPHIA FORUM?",
      paragraph: "Whether you code, design, manage, or create — there's a place for you in the forum. Come to an event, meet the team, and start building.",
    },
  },
  {
    id: "about.hero",
    label: "About · Page header",
    fields: [t("badge", "Badge", 60), t("title", "Title", 40), t("subtitle", "Subtitle", 200)],
    defaults: { badge: "MISSION • VISION • JOURNEY", title: "ABOUT SOPHIA FORUM", subtitle: "Building the future, one line of code at a time." },
  },
  {
    id: "about.pillars",
    label: "About · Mission, Vision, Objectives",
    fields: [
      t("title1", "Card 1, title", 30), area("body1", "Card 1, text", 600),
      t("title2", "Card 2, title", 30), area("body2", "Card 2, text", 600),
      t("title3", "Card 3, title", 30), area("body3", "Card 3, text", 600),
    ],
    defaults: {
      title1: "MISSION", body1: "To create a thriving community where students explore, innovate, and grow through technology-driven learning and collaboration.",
      title2: "VISION", body2: "To be the leading student-driven tech community producing industry-ready engineers and lifelong learners.",
      title3: "OBJECTIVES", body3: "Organize impactful events, provide hands-on learning, bridge the gap between academia and industry, and foster peer mentorship.",
    },
  },
  {
    id: "about.stats",
    label: "About · Statistics",
    fields: [1, 2, 3, 4].flatMap((i) => [t(`value${i}`, `Statistic ${i}, figure`, 12), t(`label${i}`, `Statistic ${i}, label`, 30)]),
    defaults: {
      value1: "10+", label1: "EVENTS HOSTED", value2: "20+", label2: "ACTIVE MEMBERS",
      value3: "8+", label3: "FACULTY ADVISORS", value4: "5+", label4: "YEARS ACTIVE",
    },
  },
];

export const MILESTONES_ID = "about.milestones";
export const MAX_MILESTONES = 30;

export interface MilestoneEntry {
  id: string;
  year: string;
  title: string;
  description: string;
}

/** Built-in milestones: the two verified anchors (official PCE pages); the former forum's history was removed. */
export const DEFAULT_MILESTONES: MilestoneEntry[] = [
  { id: "pce-established", year: "1990", title: "PCE established", description: "Priyadarshini College of Engineering, Nagpur, is established." },
  { id: "aids-programme", year: "2020", title: "B.Tech AI & DS begins", description: "The Department of Artificial Intelligence & Data Science starts its B.Tech programme." },
];

export type StoredContent = Record<string, Record<string, unknown>>;

/** A section's values: stored values (valid types only) over the built-in defaults. */
export function sectionValues(id: string, stored?: StoredContent): Record<string, string | number> {
  const section = CONTENT_SECTIONS.find((s) => s.id === id);
  if (!section) throw new Error(`Unknown content section ${id}`);
  const data = stored?.[id] ?? {};
  const out: Record<string, string | number> = { ...section.defaults };
  for (const f of section.fields) {
    const v = data[f.key];
    if (f.type === "number" ? typeof v === "number" : typeof v === "string") out[f.key] = v as string | number;
  }
  return out;
}

export function milestoneValues(stored?: StoredContent): MilestoneEntry[] {
  const items = stored?.[MILESTONES_ID]?.items;
  return Array.isArray(items) ? (items as MilestoneEntry[]) : DEFAULT_MILESTONES;
}
