import React from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTENT_SECTIONS, fillCounts, sectionValues, type SiteCounts } from "@/data/siteContent";
import { HeroSection } from "@/components/home/HeroSection";
import { StatsBand } from "@/components/about/StatsBand";

const STAGING_LIKE: SiteCounts = { members: 31, faculty: 16, events: 3, hosted: 3, gallery: 0 };
const UNKNOWN: SiteCounts = { members: null, faculty: null, events: null, hosted: null, gallery: null };

// typed-in figures such as "20+", "50+", "100%", "6+" (the inherited, unverified statistics)
const FIGURE = /\b\d+\s*(\+|%)/;

describe("content model: no typed-in statistics", () => {
  it("has no statistic fields or About statistics section, and no figures in any built-in text", () => {
    expect(CONTENT_SECTIONS.map((s) => s.id)).not.toContain("about.stats");
    const keys = CONTENT_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
    expect(keys.filter((k) => /^stat\d|^value\d/.test(k))).toEqual([]);
    for (const s of CONTENT_SECTIONS) for (const [k, v] of Object.entries(s.defaults)) expect(String(v), `${s.id}.${k}`).not.toMatch(FIGURE);
  });

  it("stored statistic values from before are ignored", () => {
    const hero = sectionValues("home.hero", { "home.hero": { stat1Value: 20, stat1Suffix: "+", stat1Label: "Events", title1: "SOPHIA" } });
    expect(hero).not.toHaveProperty("stat1Value");
    expect(hero.title1).toBe("SOPHIA");
  });
});

describe("fillCounts", () => {
  it("fills live counts", () => {
    expect(fillCounts("> Loading {members} members ████ OK", STAGING_LIKE)).toBe("> Loading 31 members ████ OK");
    expect(fillCounts("> Events hosted: {hosted}", STAGING_LIKE)).toBe("> Events hosted: 3");
    expect(fillCounts("{faculty} faculty, {events} events", STAGING_LIKE)).toBe("16 faculty, 3 events");
    expect(fillCounts("no placeholders", UNKNOWN)).toBe("no placeholders");
  });

  it("returns null (element left out) when a used count is unknown or zero", () => {
    expect(fillCounts("{members} MEMBERS", UNKNOWN)).toBeNull();
    expect(fillCounts("{members} MEMBERS", { ...STAGING_LIKE, members: 0 })).toBeNull();
    expect(fillCounts("{members} and {faculty}", { ...STAGING_LIKE, faculty: null })).toBeNull();
  });
});

describe("Home hero statistics", () => {
  // jsdom has no matchMedia: report reduced motion, so the count-up is skipped and the final values render
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it("show the live counts with their labels; zero counts (gallery) are not shown", () => {
    render(<HeroSection terminal={[]} counts={STAGING_LIKE} />);
    const values = screen.getAllByText((_, el) => el?.className === "sr-only").map((el) => el.textContent);
    expect(values).toEqual(["3", "31", "16"]);
    for (const label of ["Events", "Members", "Faculty"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText("Gallery")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(FIGURE);
  });

  it("show no cards at all when the counts are unknown", () => {
    const { container } = render(<HeroSection terminal={[]} counts={UNKNOWN} />);
    expect(container.querySelectorAll(".sr-only")).toHaveLength(0);
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
  });
});

describe("About statistics band", () => {
  it("shows only live non-zero counts", () => {
    render(<StatsBand counts={STAGING_LIKE} />);
    const band = screen.getByRole("region", { name: "Forum in numbers" });
    const terms = within(band).getAllByRole("term").map((el) => el.textContent);
    const defs = within(band).getAllByRole("definition").map((el) => el.textContent);
    expect(terms).toEqual(["EVENTS HOSTED", "TEAM MEMBERS", "FACULTY MEMBERS"]);
    expect(defs).toEqual(["3", "31", "16"]);
    expect(band.textContent).not.toMatch(FIGURE);
  });

  it("keeps only the button when no count is known", () => {
    render(<StatsBand counts={UNKNOWN} />);
    const band = screen.getByRole("region", { name: "Forum in numbers" });
    expect(within(band).queryAllByRole("term")).toHaveLength(0);
    expect(within(band).getByRole("link", { name: /see what we've done/i })).toHaveAttribute("href", "/events");
  });
});
