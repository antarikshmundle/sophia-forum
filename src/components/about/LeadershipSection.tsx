import React from "react";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { publicFromBackend, publishedLeadership, type PublicLeader } from "@/lib/cms/public";

// Institutional authorities (About): a separate full-width section after the whole Faculty section, opened by a single
// full-width divider (it overlaps the Faculty section's bottom border, so the line is never doubled). Portrait frames
// as a three-profile row (stacked on mobile). Published profiles only (Admin → Faculty → Institutional leadership);
// no built-in names or photos: demo mode and an empty or unpublished set show nothing. The row is centred with equal,
// capped column widths, so it stays balanced with one, two or three published profiles.
function LeadershipView({ leaders, unavailable = false }: { leaders: PublicLeader[]; unavailable?: boolean }) {
  return (
    <section className="graph-paper border-t-[3px] border-foreground -mt-[3px] py-16 md:py-24" aria-labelledby="leadership-heading">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="text-center mb-10 md:mb-12">
          <span className="font-pixel text-[10px] text-google-blue">PCE NAGPUR</span>
          {/* "INSTITUTIONAL" alone is wider than a 320px screen at text-4xl */}
          <h2 id="leadership-heading" className="font-display text-3xl min-[360px]:text-4xl sm:text-5xl md:text-6xl mt-2">
            INSTITUTIONAL AUTHORITIES
          </h2>
        </div>

        {unavailable ? (
          <p role="status" className="font-body text-sm text-muted-foreground text-center">
            Institutional authority profiles are temporarily unavailable. Please try again later.
          </p>
        ) : (
          // a row only from lg: below that three 288px portrait cards don't fit side by side
          <ul className="flex flex-col lg:flex-row lg:justify-center gap-8 lg:gap-10">
            {leaders.map((leader) => (
              <li key={leader.id} className="w-full max-w-sm mx-auto lg:mx-0 lg:flex-1">
                <figure className="glass rounded-[20px] shadow-glass hover:shadow-glass-lg hover:-translate-y-1 transition-all duration-200 p-6 h-full flex flex-col items-center text-center">
                  <div className="glass rounded-[20px] shadow-glass p-2 rotate-[-1deg] w-fit mx-auto">
                    <div className="relative w-48 h-60 sm:w-56 sm:h-64 rounded-2xl overflow-hidden bg-muted">
                      <FallbackImage
                        src={leader.image || undefined}
                        alt={leader.name}
                        fallbackName={leader.name}
                        fill
                        className="object-cover object-top"
                        sizes="224px"
                      />
                    </div>
                  </div>
                  <figcaption className="mt-6">
                    <p className="font-heading font-bold text-lg leading-tight">{leader.name}</p>
                    <p className="font-body text-sm text-muted-foreground mt-1">{leader.designation}</p>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export async function LeadershipSection() {
  if (!publicFromBackend()) return null; // demo mode: no built-in leadership data
  const result = await publishedLeadership();
  if (!result.ok) return <LeadershipView leaders={[]} unavailable />;
  if (result.data.length === 0) return null; // nothing published yet
  return <LeadershipView leaders={result.data} />;
}
