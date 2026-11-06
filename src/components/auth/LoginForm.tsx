"use client";

import React, { useId, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { DEMO_ACCOUNTS, findDemoAccount, signInDemo, type DemoAccount } from "@/lib/demoAuth";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { useAuthMode } from "@/components/auth/AuthModeProvider";
import { signInAdmin } from "@/hooks/useAdminSession";
import { cn } from "@/lib/utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Errors {
  email?: string;
  password?: string;
  form?: string;
}

export const inputClass =
  "w-full rounded-xl border-2 border-foreground bg-card px-3.5 py-2.5 font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-google-blue/60 aria-[invalid=true]:border-google-red";

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const mode = useAuthMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const submitting = useRef(false);
  const id = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!email.trim()) next.email = "Enter an email address.";
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter a password.";

    // Supabase mode: the server checks the credentials and the admin role; one generic message on failure
    if (mode === "supabase") {
      setErrors(next);
      if (next.email || next.password || submitting.current) return;
      submitting.current = true;
      void signInAdmin(mode, email.trim(), password).then((outcome) => {
        submitting.current = false;
        if (outcome.ok) {
          setPassword("");
          setErrors({});
          onSuccess();
        } else {
          setErrors({ form: outcome.error });
        }
      });
      return;
    }

    if (!next.email && !next.password) {
      const account = findDemoAccount(email, password);
      if (account) {
        signInDemo(account);
        setErrors({});
        onSuccess();
        return;
      }
      next.form = "Those don't match a demo account. Use one of the demo credentials below.";
    }
    setErrors(next);
  };

  const fill = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(account.password);
    setErrors({});
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {mode === "supabase" ? (
        <DemoNotice>Sign in with your Sophia Forum admin account.</DemoNotice>
      ) : (
        <DemoNotice>
          <strong className="font-bold">Demo sign-in only.</strong> This is not real authentication: the credentials are
          public, nothing is secured, and it does not connect to any production database.
        </DemoNotice>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${id}-email`} className="block font-heading font-bold text-xs uppercase tracking-wider">
          Email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${id}-email-error` : undefined}
          className={inputClass}
          placeholder={mode === "supabase" ? "you@example.com" : "admin@demo.local"}
          data-autofocus
        />
        {errors.email && (
          <p id={`${id}-email-error`} className="font-body text-xs text-google-red">
            {errors.email}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-password`} className="block font-heading font-bold text-xs uppercase tracking-wider">
          Password
        </label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? `${id}-password-error` : undefined}
          className={inputClass}
        />
        {errors.password && (
          <p id={`${id}-password-error`} className="font-body text-xs text-google-red">
            {errors.password}
          </p>
        )}
      </div>

      <p role="alert" className={cn("font-body text-sm text-google-red", !errors.form && "sr-only")}>
        {errors.form}
      </p>

      <button type="submit" className="btn-brutal w-full px-6 py-3 text-sm bg-foreground text-background hover:bg-foreground/90 gap-2">
        <LogIn className="w-4 h-4" aria-hidden="true" />
        {mode === "supabase" ? "SIGN IN" : "SIGN IN TO DEMO"}
      </button>

      {/* The public demo credentials exist only in demo mode */}
      {mode !== "supabase" && (
      <fieldset className="rounded-2xl border-2 border-dashed border-foreground/40 p-3.5">
        <legend className="px-1.5 font-pixel text-[9px] uppercase text-muted-foreground">Demo credentials</legend>
        <ul className="space-y-2">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
              <span>
                <strong className="uppercase">{account.role}</strong>: {account.email} / {account.password}
              </span>
              <button
                type="button"
                onClick={() => fill(account)}
                className="px-2.5 py-1 rounded-full border-2 border-foreground bg-card font-heading font-bold text-[10px] uppercase hover:bg-google-yellow"
                aria-label={`Fill in the ${account.role} demo credentials`}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
      )}
    </form>
  );
}
