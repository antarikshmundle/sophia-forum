import React from "react";
import { Linkedin } from "lucide-react";
import { STATIC_FACULTY, type FacultyMember } from "@/data/staticFaculty";
import { FallbackImage } from "@/components/ui/FallbackImage";
import { publicFromBackend, publishedFaculty } from "@/lib/cms/public";

// Layout follows the original "OUR MENTORS / FACULTY" section (captured 2026-10-29)
function FacultyGridView({ faculty, unavailable = false }: { faculty: FacultyMember[]; unavailable?: boolean }) {
  return (
    <section className="bg-google-yellow/10 border-y-[3px] border-foreground py-16 md:py-24" aria-labelledby="faculty-heading">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="text-center mb-10 md:mb-12">
          <span className="font-pixel text-[10px] text-google-red">OUR MENTORS</span>
          <h2 id="faculty-heading" className="font-display text-4xl sm:text-5xl md:text-6xl mt-2">
            FACULTY
          </h2>
        </div>

        {unavailable ? (
          <p role="status" className="font-body text-sm text-muted-foreground text-center">
            Faculty information is temporarily unavailable. Please try again later.
          </p>
        ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {faculty.map((member) => (
            <li key={member.id} className="glass rounded-[20px] shadow-glass hover:shadow-glass-lg hover:-translate-y-1 transition-all duration-200 p-6 flex flex-col">
              <div className="relative w-20 h-20 rounded-xl border-2 border-foreground overflow-hidden bg-muted rotate-[-2deg] mb-4">
                <FallbackImage
                  src={member.image}
                  alt={member.name}
                  fallbackName={member.name}
                  fill
                  className="object-cover object-top"
                  sizes="80px"
                  fallbackClassName="text-xl"
                />
              </div>
              <h3 className="font-heading font-bold text-lg leading-tight">{member.name}</h3>
              <p className="font-body text-sm text-muted-foreground mt-0.5">{member.designation}</p>
              {member.quote && (
                <p className="font-body italic text-sm text-muted-foreground leading-relaxed mt-3">&ldquo;{member.quote}&rdquo;</p>
              )}
              {member.linkedin && (
                <a
                  href={member.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-brutal !min-h-0 !rounded-full self-start px-4 py-2 mt-4 bg-google-blue text-primary-foreground text-xs"
                  aria-label={`${member.name} on LinkedIn`}
                >
                  <Linkedin className="w-3.5 h-3.5" aria-hidden="true" />
                  LINKEDIN
                </a>
              )}
            </li>
          ))}
        </ul>
        )}
      </div>
    </section>
  );
}

export async function FacultyGrid() {
  if (!publicFromBackend()) return <FacultyGridView faculty={[...STATIC_FACULTY].sort((a, b) => a.sortOrder - b.sortOrder)} />;
  // CMS backend: published records only; an error is shown as such, never replaced by the built-in list
  const result = await publishedFaculty();
  if (!result.ok) return <FacultyGridView faculty={[]} unavailable />;
  if (result.data.length === 0) return null; // nothing published yet: the section is not shown
  return <FacultyGridView faculty={result.data} />;
}
