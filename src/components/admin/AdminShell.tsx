"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, LayoutDashboard, LogOut, ShieldAlert } from "lucide-react";
import { useAuthMode } from "@/components/auth/AuthModeProvider";
import { useFacultyMode } from "@/components/admin/FacultyModeProvider";
import { signOutAdmin, useAdminSession, useAdminSessionState } from "@/hooks/useAdminSession";
import type { DemoRole } from "@/lib/demoAuth";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { cn } from "@/lib/utils";

// backendOnly: shown only when the dashboard runs on the CMS backend (the Content editor has no demo store)
export const ADMIN_TABS: { label: string; href: string; adminOnly?: boolean; backendOnly?: boolean }[] = [
  { label: "Overview", href: "/admin" },
  { label: "Events", href: "/admin/events" },
  { label: "Gallery", href: "/admin/gallery" },
  { label: "Team", href: "/admin/team" },
  { label: "Faculty", href: "/admin/faculty" },
  { label: "Content", href: "/admin/content", adminOnly: true, backendOnly: true },
  { label: "Users", href: "/admin/users", adminOnly: true },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const mode = useAuthMode();
  const facultyMode = useFacultyMode();
  // demo: ready once hydrated (as before); supabase: ready once /api/auth/session has answered
  const { session, ready: hydrated } = useAdminSessionState();
  const pathname = usePathname();
  const router = useRouter();

  // The middleware handles direct requests; this covers signing out while on an admin page
  useEffect(() => {
    if (hydrated && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, session, pathname, router]);

  if (!hydrated || !session) {
    return (
      <p role="status" className="w-full max-w-[1400px] mx-auto px-4 py-20 text-center font-pixel text-xs text-muted-foreground">
        {mode === "supabase" ? "Checking session…" : "Checking demo session…"}
      </p>
    );
  }

  const tabs = ADMIN_TABS.filter((tab) => (!tab.adminOnly || session.role === "admin") && (!tab.backendOnly || facultyMode === "backend"));
  const current = ADMIN_TABS.find((tab) => tab.href === pathname);

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 pt-6 sm:pt-8 pb-12 sm:pb-16 space-y-6">
      {mode === "supabase" ? (
        <DemoNotice>
          {facultyMode === "backend"
            ? "Faculty, Team, Events, Gallery and site content are live. Users is still a local demo stored in this browser."
            : "Faculty sign-in is live. Events, Gallery, Team, Users and Faculty data are still a local demo stored in this browser."}
        </DemoNotice>
      ) : (
        <DemoNotice>
          <strong className="font-bold">Demo admin — mock data only.</strong> Signed in with a public demo account
          ({session.email}, {session.role}). Edits are saved only in this browser, do not change the public site, and
          never reach any production database.
        </DemoNotice>
      )}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="font-mono text-xs text-muted-foreground mb-2">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-foreground underline-offset-2 hover:underline">
                  Site
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                {current && current.href !== "/admin" ? (
                  <Link href="/admin" className="hover:text-foreground underline-offset-2 hover:underline">
                    Admin
                  </Link>
                ) : (
                  <span aria-current="page">Admin</span>
                )}
              </li>
              {current && current.href !== "/admin" && (
                <>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page" className="text-foreground">
                    {current.label}
                  </li>
                </>
              )}
            </ol>
          </nav>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl uppercase tracking-tight">
            {current && current.href !== "/admin" ? `${current.label} Manager` : "Admin Dashboard"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/" className="btn-glass inline-flex items-center gap-2 px-4 py-2 text-xs">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            VIEW SITE
          </Link>
          <button
            type="button"
            onClick={() => void signOutAdmin(mode)}
            className="btn-brutal px-4 py-2 text-xs bg-google-red text-white gap-2"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            SIGN OUT
          </button>
        </div>
      </div>

      <nav aria-label="Admin sections" className="glass rounded-[24px] shadow-glass p-2 flex gap-1.5 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.href === pathname;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full border-2 font-heading font-bold text-xs uppercase tracking-wider transition-all",
                active
                  ? "bg-foreground text-background border-foreground shadow-[2px_2px_0px_hsl(var(--google-blue))]"
                  : "border-transparent text-foreground/80 hover:bg-black/5"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}

/** Shown in place of a page the current demo role may not use. */
export function RequireRole({ role, children }: { role: DemoRole; children: React.ReactNode }) {
  const session = useAdminSession();
  if (session?.role === role) return <>{children}</>;
  return (
    <div className="max-w-lg mx-auto brutal-card p-8 text-center space-y-4">
      <div className="w-14 h-14 mx-auto rounded-2xl border-2 border-foreground bg-google-red text-white flex items-center justify-center shadow-[3px_3px_0px_hsl(var(--foreground))]">
        <ShieldAlert className="w-7 h-7" aria-hidden="true" />
      </div>
      <h2 className="font-display text-3xl uppercase">Access Denied</h2>
      <p className="font-body text-sm text-muted-foreground">
        This section needs the demo <strong>{role}</strong> role. You are signed in as <strong>{session?.role}</strong>.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/admin" className="btn-brutal px-5 py-2.5 text-xs bg-foreground text-background gap-2">
          <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
          DASHBOARD
        </Link>
        <Link href="/" className="btn-glass px-5 py-2.5 text-xs inline-flex items-center">
          BACK TO SITE
        </Link>
      </div>
    </div>
  );
}
