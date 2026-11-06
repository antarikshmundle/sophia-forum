import React from "react";
import type { Metadata } from "next";
import { HeroSection } from "@/components/home/HeroSection";
import { MarqueeTicker } from "@/components/home/MarqueeTicker";
import { AboutSection } from "@/components/home/AboutSection";
import { UpcomingSection } from "@/components/home/UpcomingSection";
import { VideoSection } from "@/components/home/VideoSection";
import { GalleryPreview } from "@/components/home/GalleryPreview";
import { CtaSection } from "@/components/home/CtaSection";
import { loadContent, loadEvents, loadGallery } from "@/lib/siteData";
import { sectionValues } from "@/data/siteContent";

export const metadata: Metadata = {
  title: "Home | SOPHIA FORUM",
};

export default async function HomePage() {
  // CMS backend mode: published records; if a read fails, that section is not shown (logged on the server)
  const [events, gallery, content] = await Promise.all([loadEvents(), loadGallery(), loadContent()]);
  const terminal = sectionValues("home.terminal", content);
  const marquee = sectionValues("home.marquee", content);
  return (
    <>
      <HeroSection content={sectionValues("home.hero", content)} terminal={[1, 2, 3, 4, 5, 6, 7].map((i) => String(terminal[`line${i}`]))} />
      <MarqueeTicker words={[1, 2, 3, 4, 5, 6, 7, 8].map((i) => String(marquee[`word${i}`]))} />
      <AboutSection content={sectionValues("home.about", content)} />
      <UpcomingSection events={events.ok ? events.data : []} />
      <VideoSection videos={gallery.ok ? gallery.data.videos : []} />
      <GalleryPreview highlights={gallery.ok ? gallery.data.highlights : []} />
      <CtaSection content={sectionValues("home.cta", content)} />
    </>
  );
}
