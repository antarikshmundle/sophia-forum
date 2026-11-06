import React from "react";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { PageHero } from "@/components/layout/PageHero";
import { GalleryClient } from "@/components/gallery/GalleryClient";
import { CmsUnavailable } from "@/components/ui/CmsUnavailable";
import { loadEvents, loadGallery } from "@/lib/siteData";

export const metadata: Metadata = {
  title: "Gallery | SOPHIA FORUM",
  description: "Photos and videos from Sophia Forum events.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function GalleryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [gallery, events] = await Promise.all([loadGallery(), loadEvents()]);

  return (
    <>
      <PageHero
        accent="green"
        icon={Sparkles}
        badge="CAPTURED MOMENTS & MEMORIES"
        title="EVENT GALLERY"
        titleClassName="text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-none tracking-tight"
        subtitle="Explore high-energy snapshots, hackathons, cultural festivals, and technical showdowns by Sophia Forum."
      />
      {gallery.ok && events.ok ? (
        <GalleryClient
          initialFilters={{ year: first(params.year), media: first(params.media), event: first(params.event) }}
          photos={gallery.data.photos}
          videos={gallery.data.videos}
          events={events.data}
        />
      ) : (
        <CmsUnavailable what="The gallery is" />
      )}
    </>
  );
}
