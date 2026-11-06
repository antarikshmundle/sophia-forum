"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, GraduationCap, Images, RotateCcw, Users, UserCog } from "lucide-react";
import { resetDemoStore, useDemoCollection } from "@/lib/demoStore";
import { useAdminSession } from "@/hooks/useAdminSession";
import { Dialog } from "@/components/ui/Dialog";
import { useFacultyMode } from "@/components/admin/FacultyModeProvider";

type Row = { status?: string; category?: string };
type Counts = Record<"faculty" | "team" | "events" | "gallery", Row[] | null>;

/** CMS backend mode: the Overview counts the stored records (null = couldn't be read). */
function useBackendCounts(enabled: boolean): Counts | undefined {
  const [counts, setCounts] = useState<Counts>();
  useEffect(() => {
    if (!enabled) return;
    const read = (name: string) =>
      fetch(`/api/admin/${name}`, { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (Array.isArray(j?.data) ? (j.data as Row[]) : null))
        .catch(() => null);
    void Promise.all(["faculty", "team", "events", "gallery"].map(read)).then(([faculty, team, events, gallery]) => setCounts({ faculty, team, events, gallery }));
  }, [enabled]);
  return counts;
}

export default function AdminDashboardPage() {
  const session = useAdminSession();
  const facultyMode = useFacultyMode();
  const events = useDemoCollection("events");
  const gallery = useDemoCollection("gallery");
  const team = useDemoCollection("team");
  const faculty = useDemoCollection("faculty");
  const users = useDemoCollection("users");
  const backendCounts = useBackendCounts(facultyMode === "backend");
  const [confirmReset, setConfirmReset] = useState(false);
  const [status, setStatus] = useState("");

  // demo mode: the browser's demo store (as before); backend mode: the CMS records ("…" while loading, "—" if unreadable)
  const src = facultyMode === "backend"
    ? (name: keyof Counts): Row[] | string => (backendCounts === undefined ? "…" : backendCounts[name] ?? "—")
    : (name: keyof Counts): Row[] => ({ faculty, team, events, gallery } as Record<keyof Counts, Row[]>)[name];
  const count = (rows: Row[] | string) => (typeof rows === "string" ? rows : rows.length);
  const where = (rows: Row[] | string, test: (r: Row) => boolean) => (typeof rows === "string" ? rows : rows.filter(test).length);
  const [ev, ga, te, fa] = [src("events"), src("gallery"), src("team"), src("faculty")];
  const cards = [
    { label: "Events", href: "/admin/events", icon: CalendarDays, color: "bg-google-blue", value: count(ev), detail: `${where(ev, (e) => e.status === "upcoming")} upcoming` },
    { label: "Gallery", href: "/admin/gallery", icon: Images, color: "bg-google-green", value: count(ga), detail: `${where(ga, (g) => g.category === "photo")} photos · ${where(ga, (g) => g.category === "video")} videos` },
    { label: "Team", href: "/admin/team", icon: Users, color: "bg-google-red", value: count(te), detail: "council members" },
    { label: "Faculty", href: "/admin/faculty", icon: GraduationCap, color: "bg-google-yellow", value: count(fa), detail: "mentors" },
    ...(session?.role === "admin"
      ? [{ label: "Users", href: "/admin/users", icon: UserCog, color: "bg-foreground", value: users.length, detail: "mock accounts" }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map(({ label, href, icon: Icon, color, value, detail }) => (
          <li key={href}>
            <Link href={href} className="group brutal-card p-5 sm:p-6 flex items-center gap-4 hover:-translate-y-1">
              <span className={`w-12 h-12 shrink-0 rounded-2xl border-2 border-foreground ${color} text-white flex items-center justify-center shadow-[3px_3px_0px_hsl(var(--foreground))]`}>
                <Icon className="w-6 h-6" aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display text-3xl leading-none">{value}</span>
                <span className="block font-heading font-bold text-sm uppercase tracking-wider mt-1">{label}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{detail}</span>
              </span>
              <ArrowRight className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="reset-heading" className="rounded-[20px] border-2 border-dashed border-foreground/40 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 id="reset-heading" className="font-heading font-bold text-base">Reset demo data</h2>
          <p className="font-body text-sm text-muted-foreground">
            Discards every change made in this browser and restores the original static datasets.
          </p>
        </div>
        <button type="button" onClick={() => setConfirmReset(true)} className="btn-glass px-5 py-2.5 text-xs inline-flex items-center gap-2 self-start">
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          RESET DATA
        </button>
      </section>
      <p role="status" aria-live="polite" className="font-mono text-xs text-google-green">
        {status}
      </p>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        description={
          facultyMode === "backend"
            ? "All local edits to users will be lost. Faculty, Team, Events, Gallery and site content are stored in the CMS and are not affected."
            : "All local edits to events, gallery, team, faculty and users will be lost."
        }
      >
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => setConfirmReset(false)} className="btn-glass px-5 py-2.5 text-xs" data-autofocus>
            CANCEL
          </button>
          <button
            type="button"
            onClick={() => {
              resetDemoStore();
              setConfirmReset(false);
              setStatus("Demo data reset to the original datasets.");
            }}
            className="btn-brutal px-5 py-2.5 text-xs bg-google-red text-white"
          >
            RESET
          </button>
        </div>
      </Dialog>
    </div>
  );
}
