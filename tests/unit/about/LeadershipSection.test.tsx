import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cms = vi.hoisted(() => ({ publicFromBackend: vi.fn(), publishedLeadership: vi.fn() }));
vi.mock("@/lib/cms/public", () => cms);

import { LeadershipSection } from "@/components/about/LeadershipSection";

const LEADERS = [
  { id: "leadership-principal", name: "Dr. S. A. Dhale", designation: "Principal", image: "" },
  { id: "leadership-vice-principal", name: "Dr. G. M. Asutkar", designation: "Vice Principal", image: "" },
  { id: "leadership-dean", name: "Dr. V. K. Taksande", designation: "Student Dean Affairs", image: "" },
];

async function renderSection() {
  const element = await LeadershipSection();
  return element ? render(element) : null;
}

beforeEach(() => {
  cms.publicFromBackend.mockReturnValue(true);
  cms.publishedLeadership.mockResolvedValue({ ok: true, data: LEADERS });
});

describe("LeadershipSection — data states", () => {
  it("renders nothing in demo mode, without reading the backend", async () => {
    cms.publicFromBackend.mockReturnValue(false);
    expect(await renderSection()).toBeNull();
    expect(cms.publishedLeadership).not.toHaveBeenCalled();
  });

  it("renders nothing when no profile is published", async () => {
    cms.publishedLeadership.mockResolvedValue({ ok: true, data: [] });
    expect(await renderSection()).toBeNull();
  });

  it("shows an unavailable message when the read fails", async () => {
    cms.publishedLeadership.mockResolvedValue({ ok: false });
    await renderSection();
    expect(screen.getByRole("status")).toHaveTextContent(/temporarily unavailable/i);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("lists each published profile with its name and designation, in order", async () => {
    await renderSection();
    expect(screen.getByRole("heading", { name: /institutional authorities/i })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("figcaption")?.textContent)).toEqual(["Dr. S. A. DhalePrincipal", "Dr. G. M. AsutkarVice Principal", "Dr. V. K. TaksandeStudent Dean Affairs"]);
  });

  it("shows the initials placeholder when no photo is published", async () => {
    await renderSection();
    const frames = screen.getAllByRole("listitem").map((li) => li.querySelector("figure > div")?.textContent);
    expect(frames).toEqual(["DS", "DG", "DV"]);
    // the placeholder is an accessible image named after the person; no photo file is requested
    expect(screen.getAllByRole("img").map((el) => el.getAttribute("aria-label") ?? el.getAttribute("alt"))).toEqual(LEADERS.map((l) => expect.stringContaining(l.name)));
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });
});

// jsdom has no layout engine: these pin the responsive class contract that fixed the 320/768px overflow; the
// real pixel widths are checked by the Playwright smoke test.
describe("LeadershipSection — responsive layout contract", () => {
  it("stacks the cards below lg and only puts them in a row from lg", async () => {
    await renderSection();
    const list = screen.getByRole("list");
    expect(list.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "flex-col", "lg:flex-row"]));
    expect(list.className).not.toMatch(/(^|\s)(sm|md):flex-row/);
    for (const li of screen.getAllByRole("listitem")) {
      expect(li.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-full", "max-w-sm", "mx-auto", "lg:flex-1"]));
      expect(li.className).not.toMatch(/(^|\s)md:flex-1/);
    }
  });

  it("uses the smaller heading size below 360px", async () => {
    await renderSection();
    const heading = screen.getByRole("heading", { name: /institutional authorities/i });
    expect(heading.className.split(/\s+/)).toEqual(expect.arrayContaining(["text-3xl", "min-[360px]:text-4xl"]));
  });
});
