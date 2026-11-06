"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Lock, LogOut } from "lucide-react";
import { useAuthMode } from "@/components/auth/AuthModeProvider";
import { signOutAdmin, useAdminSession } from "@/hooks/useAdminSession";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

const circleButton =
  "relative inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-foreground bg-white text-foreground shadow-[2px_2px_0px_hsl(var(--foreground))] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_hsl(var(--foreground))] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all duration-150";

/** Navbar slot: lock button when signed out, demo account menu when signed in. */
export function AccountButton() {
  const mode = useAuthMode();
  const session = useAdminSession();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!session) {
    return (
      <button
        type="button"
        aria-label="Sign in / Admin Access"
        onClick={() => window.dispatchEvent(new CustomEvent("open-login"))}
        className={circleButton}
      >
        <Lock className="w-4 h-4 stroke-[2.25]" />
      </button>
    );
  }

  // On admin pages the AdminShell guard then redirects to the demo login
  const handleSignOut = () => {
    setOpen(false);
    void signOutAdmin(mode);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={mode === "supabase" ? `Account menu (${session.name})` : `Demo account menu (${session.name})`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cn(circleButton, "font-heading font-black text-xs bg-google-blue text-white")}
      >
        {getInitials(session.name)}
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-foreground bg-google-green" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full mt-3 w-60 rounded-2xl border-[3px] border-foreground bg-card shadow-[4px_4px_0px_hsl(var(--foreground))] p-2 z-50"
        >
          <div className="px-3 py-2 border-b-2 border-foreground/10 mb-1">
            <p className="font-heading font-bold text-sm">{session.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {session.email} · {session.role}
            </p>
            <p className="font-pixel text-[8px] text-[#8C6B00] uppercase mt-1.5">{mode === "supabase" ? "Admin session" : "Demo session"}</p>
          </div>
          <Link
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded-xl font-heading font-bold text-sm hover:bg-black/5"
          >
            <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
            Dashboard
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl font-heading font-bold text-sm text-google-red hover:bg-google-red/10"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
