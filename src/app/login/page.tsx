import React from "react";
import type { Metadata } from "next";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { cmsAuthMode } from "@/lib/cms/mode";

export const metadata: Metadata = {
  // fixed at build time with the sign-in mode (D2, D3)
  title: cmsAuthMode() === "supabase" ? "Admin Sign In | SOPHIA FORUM" : "Demo Sign In | SOPHIA FORUM",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  return <LoginPanel next={Array.isArray(next) ? next[0] : next} />;
}
