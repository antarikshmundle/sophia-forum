"use client";

import React, { createContext, useContext } from "react";

/** Admin sign-in mode, decided on the server at build time (CMS_AUTH_MODE, D2) and passed down from the root layout. */
export type AuthMode = "demo" | "supabase";

const AuthModeContext = createContext<AuthMode>("demo");

/** Renders no element: the page markup is identical with and without it. */
export function AuthModeProvider({ mode, children }: { mode: AuthMode; children: React.ReactNode }) {
  return <AuthModeContext.Provider value={mode}>{children}</AuthModeContext.Provider>;
}

export const useAuthMode = () => useContext(AuthModeContext);
