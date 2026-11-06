import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { assertBuildEnv } from "./src/lib/build-env";
import { securityHeaders } from "./src/lib/security-headers";

// Photos uploaded in Admin (bucket site-media) are served from this project's public storage path only.
const supabaseHost = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return /^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ? url.hostname : null;
  } catch {
    return null;
  }
})();

export default function config(phase: string): NextConfig {
  // a production build is always a validated CMS backend build (src/lib/build-env.ts); never a silent demo build
  if (phase === PHASE_PRODUCTION_BUILD) assertBuildEnv(process.env);

  return {
    reactStrictMode: true,
    images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "img.youtube.com",
          pathname: "/**",
        },
        ...(supabaseHost
          ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/site-media/**" }]
          : []),
      ],
    },
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders({ supabaseHost, dev: phase === PHASE_DEVELOPMENT_SERVER }) }];
    },
  };
}
