import React from "react";
import { Target, Eye, Zap, type LucideIcon } from "lucide-react";
import { sectionValues } from "@/data/siteContent";

interface Pillar {
  title: string;
  body: string;
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
}

// Copy verified against the live About page (RECONNAISSANCE.md §4.2).
// Icon and colours per card position; the titles and texts are content ("About · Mission, Vision, Objectives")
const PILLAR_STYLES: Omit<Pillar, "title" | "body">[] = [
  {
    icon: Target,
    iconBg: "bg-google-red",
    iconText: "text-white",
  },
  {
    icon: Eye,
    iconBg: "bg-google-blue",
    iconText: "text-white",
  },
  {
    icon: Zap,
    iconBg: "bg-google-yellow",
    iconText: "text-foreground",
  },
];

export function PillarsGrid({ content = sectionValues("about.pillars") }: { content?: Record<string, string | number> }) {
  const PILLARS: Pillar[] = PILLAR_STYLES.map((style, i) => ({ ...style, title: String(content[`title${i + 1}`]), body: String(content[`body${i + 1}`]) }));
  return (
    <section className="graph-paper py-16 md:py-24" aria-label="Mission, vision and objectives">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
          {PILLARS.map(({ title, body, icon: Icon, iconBg, iconText }) => (
            <article key={title} className="glass rounded-[20px] shadow-glass hover:shadow-glass-lg hover:-translate-y-1 transition-all duration-200 p-6 flex flex-col gap-3">
              <div
                className={`w-10 h-10 rounded-xl border-2 border-foreground ${iconBg} ${iconText} flex items-center justify-center shadow-[2px_2px_0px_hsl(var(--foreground))]`}
              >
                <Icon className="w-5 h-5 stroke-[2.25]" aria-hidden="true" />
              </div>
              <h3 className="font-display text-2xl sm:text-3xl">{title}</h3>
              <p className="font-body text-sm text-muted-foreground leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
