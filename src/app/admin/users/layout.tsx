import type React from "react";
import { notFound } from "next/navigation";
import { cmsAuthMode } from "@/lib/cms/mode";

/**
 * The Users screen manages browser-local mock accounts (demo store) and never real users. With the real Supabase
 * sign-in (CMS_AUTH_MODE=supabase) it is not offered: a direct visit to /admin/users gets the site's 404 page, so the
 * demo accounts are never shown next to the real admin. Demo mode renders the page exactly as before.
 * Real accounts are managed in the Supabase Dashboard (architecture L2: one admin created by the owner).
 */
export default function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  if (cmsAuthMode() === "supabase") notFound();
  return children;
}
