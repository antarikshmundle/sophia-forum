import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GalleryClient } from "@/components/gallery/GalleryClient";
import type { GalleryMediaItem } from "@/data/staticGallery";
import type { EventItem } from "@/data/staticEvents";

const photo = (id: string, event: string, year: number): GalleryMediaItem => ({ id, title: `Photo ${id}`, category: "photo", event, year, url: `/images/${id}.jpg` });
const video = (id: string, event: string, year: number): GalleryMediaItem => ({ id, title: `Video ${id}`, category: "video", event, year, url: "https://www.youtube.com/watch?v=abcdefghijk" });
const PHOTOS = [photo("p1", "ALGORAVE 3.0", 2026), photo("p2", "ALGORAVE 3.0", 2025), photo("p3", "Farewell 2K26", 2026)];
const VIDEOS = [video("v1", "Farewell 2K26", 2026)];
const EVENTS = [{ id: "algorave-3-0", name: "ALGORAVE 3.0" }, { id: "farewell-2k26", name: "Farewell 2K26" }] as EventItem[];

const status = () => screen.getByRole("status").textContent;
const group = (name: string) => screen.getByRole("group", { name });

describe("GalleryClient — nothing published", () => {
  it("says media will appear, with no filter reset", () => {
    render(<GalleryClient initialFilters={{}} photos={[]} videos={[]} events={[]} />);
    expect(screen.getByText("Photos and videos will appear here once they are published.")).toBeInTheDocument();
    expect(screen.queryByText("No media matches these filters.")).toBeNull();
    expect(screen.queryByRole("button", { name: /reset filters/i })).toBeNull();
  });
});

describe("GalleryClient — filters", () => {
  const setup = (initialFilters = {}) => {
    const user = userEvent.setup();
    render(<GalleryClient initialFilters={initialFilters} photos={PHOTOS} videos={VIDEOS} events={EVENTS} />);
    return user;
  };

  it("shows everything by default", () => {
    setup();
    expect(status()).toBe("Showing 3 of 3 photos and 1 of 1 videos");
    expect(screen.queryByText(/will appear here/)).toBeNull();
  });

  it("filters by year, media type and event", async () => {
    const user = setup();
    await user.click(within(group("Filter by year")).getByRole("button", { name: "2025" }));
    expect(status()).toBe("Showing 1 of 1 photos and 0 of 0 videos");
    await user.click(within(group("Filter by year")).getByRole("button", { name: "ALL" }));
    await user.click(within(group("Filter by media type")).getByRole("button", { name: /videos/i }));
    expect(status()).toBe("Showing 0 of 0 photos and 1 of 1 videos");
    await user.click(within(group("Filter by media type")).getByRole("button", { name: "ALL" }));
    await user.click(within(group("Filter by event")).getByRole("button", { name: /farewell 2k26/i }));
    expect(status()).toBe("Showing 1 of 1 photos and 1 of 1 videos");
  });

  it("shows the no-match message and resets all filters", async () => {
    const user = setup();
    await user.click(within(group("Filter by year")).getByRole("button", { name: "2025" }));
    await user.click(within(group("Filter by event")).getByRole("button", { name: /farewell 2k26/i }));
    expect(screen.getByText("No media matches these filters.")).toBeInTheDocument();
    expect(screen.queryByText(/will appear here/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /reset filters/i }));
    expect(status()).toBe("Showing 3 of 3 photos and 1 of 1 videos");
  });

  it("applies filters from the URL, including an event ID", () => {
    setup({ year: "2026", media: "photo", event: "algorave-3-0" });
    expect(status()).toBe("Showing 1 of 1 photos and 0 of 0 videos");
    expect(within(group("Filter by event")).getByRole("button", { name: /algorave 3\.0/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores unknown URL filters", () => {
    setup({ year: "1990", media: "audio", event: "no-such-event" });
    expect(status()).toBe("Showing 3 of 3 photos and 1 of 1 videos");
  });
});
