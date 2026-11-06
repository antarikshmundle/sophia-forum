"use client";

import React, { createContext, useContext } from "react";

export type FacultyManagerMode = "demo" | "backend" | "unavailable";

const FacultyModeContext = createContext<FacultyManagerMode>("demo");

/** Passes the server-side Faculty Manager mode (fixed at build time) to the admin screens; renders no element. */
export function FacultyModeProvider({ mode, children }: { mode: FacultyManagerMode; children: React.ReactNode }) {
  return <FacultyModeContext.Provider value={mode}>{children}</FacultyModeContext.Provider>;
}

export const useFacultyMode = () => useContext(FacultyModeContext);
