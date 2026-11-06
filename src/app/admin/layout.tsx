import React from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { FacultyModeProvider } from "@/components/admin/FacultyModeProvider";
import { cmsAuthMode, facultyManagerMode } from "@/lib/cms/mode";

export const metadata: Metadata = {
  title: cmsAuthMode() === "supabase" ? "Admin | SOPHIA FORUM" : "Demo Admin | SOPHIA FORUM",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <FacultyModeProvider mode={facultyManagerMode()}>
      <AdminShell>{children}</AdminShell>
    </FacultyModeProvider>
  );
}
