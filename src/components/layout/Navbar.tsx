"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Lock, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAIN_ROUTES } from "@/data/routes";
import { AccountButton } from "@/components/auth/AccountButton";
import { useAuthMode } from "@/components/auth/AuthModeProvider";
import { signOutAdmin, useAdminSession } from "@/hooks/useAdminSession";

const FOCUSABLE = 'a[href], button:not([disabled])';

const isActiveRoute = (pathname: string, path: string) =>
  pathname === path || (path !== "/" && pathname.startsWith(path));

// Markup follows the original site's floating capsule (captured 2026-10-29)
export function Navbar() {
  const pathname = usePathname();
  const mode = useAuthMode();
  const session = useAdminSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Full-screen mobile menu: scroll lock, initial focus, focus restore
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const toggle = toggleRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      toggle?.focus();
    };
  }, [mobileMenuOpen]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setMobileMenuOpen(false);
      return;
    }
    if (e.key !== "Tab" || !menuRef.current) return;
    const focusable = [...menuRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 pointer-events-none px-3 sm:px-6 md:px-8 pt-3 sm:pt-5">
        <div className="max-w-7xl mx-auto">
          <nav
            aria-label="Main Navigation"
            className="pointer-events-auto w-full rounded-full transition-all duration-300 glass shadow-glass py-2.5 sm:py-3 px-4 sm:px-6"
          >
            <div className="flex items-center justify-between gap-3">
              {/* Original INGENIOUS logo tile with the official Sophia Forum logo (public/images/sophia-forum-logo.png).
                  The shield is fitted inside the circle (object-contain) instead of cropped, so no part of it is cut off. */}
              <Link href="/" className="group relative inline-flex items-center shrink-0" aria-label="Sophia Forum Home">
                <div className="relative inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full border-[3px] border-foreground bg-white shadow-[3px_3px_0_hsl(var(--foreground))] group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:shadow-[5px_5px_0_hsl(var(--foreground))] transition-all duration-200">
                  <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-foreground bg-google-blue z-10" />
                  <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-foreground bg-google-yellow z-10" />
                  <Image
                    src="/images/sophia-forum-logo.png"
                    alt="Sophia Forum logo"
                    width={1022}
                    height={1177}
                    sizes="48px"
                    className="w-full h-full rounded-full object-contain p-0.5"
                    priority
                  />
                </div>
              </Link>

              {/* Desktop route pills: every pill coloured, active one raised with a pulse dot */}
              <div className="hidden md:flex items-center gap-2.5 lg:gap-3.5">
                {MAIN_ROUTES.map((route) => {
                  const isActive = isActiveRoute(pathname, route.path);
                  return (
                    <Link
                      key={route.path}
                      href={route.path}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "btn-brutal relative px-4 py-2 text-xs lg:text-sm uppercase tracking-wider !min-h-0 !rounded-full",
                        route.colorClass,
                        isActive && "!translate-x-[-2px] !translate-y-[-2px] !shadow-[4px_4px_0px_hsl(var(--foreground))]"
                      )}
                    >
                      {route.name}
                      {isActive && (
                        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-foreground rounded-full border-2 border-background animate-pulse" />
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Lock / demo account menu (desktop) */}
              <div className="hidden md:block">
                <AccountButton />
              </div>

              <button
                ref={toggleRef}
                type="button"
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden relative inline-flex items-center justify-center w-11 h-11 rounded-full border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150"
              >
                <Menu className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Full-screen mobile menu */}
      {mobileMenuOpen && (
        <div
          ref={menuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          onKeyDown={handleMenuKeyDown}
          // scrolls on short screens (phone landscape), where the links don't all fit
          className="fixed inset-0 z-[60] md:hidden glass-strong flex flex-col overflow-y-auto overscroll-contain"
        >
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5">
            {/* links also close the menu themselves: a link to the current page doesn't change the route */}
            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center gap-2.5" aria-label="Sophia Forum Home">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border-[3px] border-foreground bg-white overflow-hidden">
                <Image src="/images/sophia-forum-logo.png" alt="" width={1022} height={1177} sizes="40px" className="w-full h-full object-contain p-0.5" />
              </span>
              <span className="font-display font-bold text-xl tracking-tight">SOPHIA FORUM</span>
            </Link>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center justify-center w-11 h-11 rounded-full border-2 border-foreground bg-card shadow-[3px_3px_0px_hsl(var(--foreground))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          <nav className="flex-1 flex flex-col justify-center gap-3 px-6 sm:px-10" aria-label="Mobile">
            {MAIN_ROUTES.map((route, i) => {
              const isActive = isActiveRoute(pathname, route.path);
              return (
                <Link
                  key={route.path}
                  href={route.path}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "btn-brutal w-full !rounded-2xl px-5 py-4 text-lg uppercase tracking-wide justify-between",
                    route.colorClass,
                    isActive && "!translate-x-[-2px] !translate-y-[-2px] !shadow-[6px_6px_0px_hsl(var(--foreground))]"
                  )}
                >
                  <span>{route.name}</span>
                  {isActive ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-current" aria-hidden="true" />
                  ) : (
                    <span className="font-mono text-sm opacity-60" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="px-6 pb-8 flex flex-col items-center gap-4">
            {session ? (
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/admin" onClick={() => setMobileMenuOpen(false)} className="btn-glass px-5 py-2.5 text-xs">
                  <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
                  DASHBOARD
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void signOutAdmin(mode);
                  }}
                  className="btn-glass px-5 py-2.5 text-xs text-google-red"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  SIGN OUT ({session.role})
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  window.dispatchEvent(new CustomEvent("open-login"));
                }}
                className="btn-glass px-5 py-2.5 text-xs"
              >
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                TEAM SIGN-IN
              </button>
            )}
            <p className="text-center font-mono text-[11px] tracking-widest text-muted-foreground">AI & DS DEPARTMENT • PCE NAGPUR</p>
          </div>
        </div>
      )}
    </>
  );
}
