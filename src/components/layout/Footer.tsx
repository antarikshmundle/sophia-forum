"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Mail, ArrowUpRight, Zap, type LucideIcon } from "lucide-react";
import { FOOTER_QUICK_LINKS } from "@/data/routes";
import { useLowPowerMode } from "@/hooks/useLowPowerMode";

// The forum's own social accounts. The former forum's (and college's) accounts were removed; a link is added here
// only once Sophia Forum's own account is confirmed. With none, the "Connect with us" block is not shown.
// (Each entry: { name, href, icon from lucide-react: Instagram | Linkedin | Facebook | Youtube | MessageCircle, color }, with
// the original colours: Instagram/YouTube "bg-google-red text-primary-foreground hover:bg-red-600", LinkedIn/Facebook
// "bg-google-blue text-primary-foreground hover:bg-blue-600", WhatsApp "bg-google-green text-primary-foreground hover:bg-emerald-600".)
const SOCIALS: { name: string; href: string; icon: LucideIcon; color: string }[] = [];

// The forum's own contact email; empty until confirmed (the former forum's address was removed)
const CONTACT_EMAIL = "";

const columnHeading = "font-heading font-black text-sm sm:text-base uppercase tracking-wider mb-3 sm:mb-4 flex items-center gap-2";

// Markup follows the original site footer (captured 2026-10-29)
export function Footer() {
  const { isLowPower, toggleLowPower } = useLowPowerMode();

  return (
    <footer className="w-full px-3 sm:px-6 md:px-8 lg:px-10 pt-6 sm:pt-10 pb-6 sm:pb-10 mt-auto">
      <div className="max-w-[1400px] mx-auto glass rounded-[28px] shadow-glass-lg overflow-hidden transition-shadow duration-300">
        <div className="p-5 sm:p-7 md:p-8 lg:p-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
            {/* Brand & socials */}
            <div className="sm:col-span-2 lg:col-span-1 flex flex-col justify-between space-y-5">
              <div>
                <Link href="/" className="group inline-flex items-center gap-3 mb-3" aria-label="Sophia Forum Home">
                  <div className="relative inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full border-[3px] border-foreground bg-white shadow-[3px_3px_0_hsl(var(--foreground))] group-hover:translate-x-[-2px] group-hover:translate-y-[-2px] group-hover:shadow-[5px_5px_0_hsl(var(--foreground))] transition-all duration-200">
                    <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-foreground bg-google-blue z-10" />
                    <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-foreground bg-google-yellow z-10" />
                    <Image src="/images/sophia-forum-logo.png" alt="" width={1022} height={1177} sizes="48px" className="w-full h-full rounded-full object-contain p-0.5" />
                  </div>
                  <div>
                    <p className="font-heading font-black text-lg sm:text-xl tracking-tight leading-none">SOPHIA FORUM</p>
                    <span className="font-mono text-[10px] sm:text-xs font-bold text-muted-foreground tracking-wider">AI & DS FORUM</span>
                  </div>
                </Link>
                <p className="font-body text-muted-foreground text-xs sm:text-sm leading-relaxed">
                  Empowering AI &amp; DS students to innovate, collaborate, and build impactful projects together.
                </p>
              </div>
              {SOCIALS.length > 0 && (
              <div>
                <span className="font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2.5">
                  Connect with us
                </span>
                <div className="flex flex-wrap gap-2 sm:gap-2.5">
                  {SOCIALS.map(({ name, href, icon: Icon, color }) => (
                    <a
                      key={name}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={name}
                      className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border-2 border-foreground shadow-[2px_2px_0px_hsl(var(--foreground))] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_hsl(var(--foreground))] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-150 ${color}`}
                    >
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </div>
              )}
            </div>

            {/* Quick links (hidden on small screens, as on the original) */}
            <nav className="hidden md:block" aria-label="Footer">
              <h2 className={columnHeading}>
                <span className="w-2.5 h-2.5 rounded-full bg-google-yellow border border-foreground" aria-hidden="true" />
                QUICK LINKS
              </h2>
              <ul className="grid grid-cols-2 sm:grid-cols-1 gap-1.5 sm:gap-2 font-heading font-bold text-xs sm:text-sm">
                {FOOTER_QUICK_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group inline-flex items-center gap-1.5 py-1.5 text-foreground/80 hover:text-foreground hover:translate-x-1 transition-all duration-150"
                    >
                      <span className="text-google-blue font-mono text-xs opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
                        &gt;
                      </span>
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Contact */}
            <div className="sm:col-span-2 lg:col-span-1">
              <h2 className={columnHeading}>
                <span className="w-2.5 h-2.5 rounded-full bg-google-red border border-foreground" aria-hidden="true" />
                CONTACT
              </h2>
              <div className="space-y-3 text-xs sm:text-sm font-body">
                <div className="flex items-start gap-2.5 text-muted-foreground">
                  <div className="p-1.5 rounded-lg border-2 border-foreground bg-google-yellow/20 text-foreground shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <span className="leading-snug">Priyadarshini College of Engineering, Hingna Road, Nagpur – 440 019</span>
                </div>
                {CONTACT_EMAIL && (
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="group flex items-center gap-2.5 text-foreground/90 hover:text-google-blue font-medium transition-colors min-h-[44px]"
                >
                  <div className="p-1.5 rounded-lg border-2 border-foreground bg-google-blue/20 text-foreground group-hover:bg-google-blue group-hover:text-primary-foreground transition-colors shrink-0">
                    <Mail className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <span className="break-all font-mono text-[11px] sm:text-xs">{CONTACT_EMAIL}</span>
                </a>
                )}
              </div>
            </div>

            {/* Take part */}
            <div className="flex flex-col justify-between">
              <div>
                <h2 className={columnHeading}>
                  <span className="w-2.5 h-2.5 rounded-full bg-google-green border border-foreground" aria-hidden="true" />
                  TAKE PART
                </h2>
                <p className="font-body text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4">
                  Hackathons, workshops and fests — open to every AI & DS student. Come build, compete and learn with the forum.
                </p>
                <Link href="/events" className="btn-brutal px-4 py-2.5 bg-google-blue text-primary-foreground text-xs sm:text-sm">
                  BROWSE EVENTS
                  <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom ribbon */}
        <div className="border-t border-white/30 bg-foreground text-background px-4 sm:px-6 md:px-8 lg:px-10 py-3 sm:py-3.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 text-center sm:text-left">
          <p className="font-body text-[11px] sm:text-xs font-medium text-background/90">© 2026 SOPHIA FORUM. All rights reserved.</p>
          <div className="flex items-center gap-1.5 sm:gap-2 font-mono text-[10px] sm:text-[11px] text-background/80">
            {/* Font attribution required by the designer's permission (public/fonts/SOURCES.md); exact wording */}
            <span>Typography: Retron2000 Typeface by Daymarius</span>
          </div>
          <button
            type="button"
            onClick={toggleLowPower}
            aria-pressed={isLowPower}
            title={isLowPower ? "Power-saver is ON — click to restore full visuals" : "Power-saver is OFF — click to reduce visual effects"}
            className="inline-flex items-center gap-1.5 rounded-full border border-background/30 px-2.5 py-1 font-mono text-[10px] sm:text-[11px] text-background/80 hover:text-background hover:border-background/60 transition-colors"
          >
            <Zap className="w-3 h-3 fill-current text-google-yellow" aria-hidden="true" />
            POWER SAVER {isLowPower ? "ON" : "OFF"}
          </button>
        </div>
      </div>
    </footer>
  );
}
