"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminSession } from "@/hooks/useAdminSession";
import { useAuthMode } from "@/components/auth/AuthModeProvider";
import { safeAdminPath } from "@/lib/demoAuth";
import { LoginForm } from "./LoginForm";

/** Full-page login used when the middleware redirects a signed-out visitor. */
export function LoginPanel({ next }: { next?: string }) {
  const router = useRouter();
  const mode = useAuthMode();
  const session = useAdminSession();
  const destination = safeAdminPath(next);

  useEffect(() => {
    if (session) router.replace(destination);
  }, [session, destination, router]);

  return (
    <div className="w-full max-w-lg mx-auto px-4 pt-6 sm:pt-10 pb-12">
      <div className="rounded-[28px] border-[3px] border-foreground bg-card shadow-[8px_8px_0px_hsl(var(--foreground))] p-5 sm:p-7">
        <h1 className="font-display text-3xl sm:text-4xl uppercase leading-tight">Admin Sign In</h1>
        <p className="font-body text-sm text-muted-foreground mt-1.5 mb-4">
          {mode === "supabase" ? "Sign in to your Sophia Forum admin account to open " : "Sign in to the local demo to open "}
          <span className="font-mono text-foreground">{destination}</span>.
        </p>
        <LoginForm onSuccess={() => router.replace(destination)} />
      </div>
    </div>
  );
}
