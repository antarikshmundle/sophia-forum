"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useAuthMode } from "@/components/auth/AuthModeProvider";
import { LoginForm } from "./LoginForm";

/** Global demo login dialog, opened by the navbar lock button's `open-login` event. */
export function LoginModal() {
  const mode = useAuthMode();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("open-login", handleOpen);
    return () => window.removeEventListener("open-login", handleOpen);
  }, []);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Admin Sign In" description={mode === "supabase" ? "Sophia Forum admin area." : "Local demo of the forum admin area."}>
      <LoginForm
        onSuccess={() => {
          setOpen(false);
          router.push("/admin");
        }}
      />
    </Dialog>
  );
}
