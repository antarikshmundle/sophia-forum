/**
 * HTTP security headers for every route (next.config.ts headers()). Dependency-free so tests can use it.
 *
 * Enforced: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
 * Content-Security-Policy is sent as REPORT-ONLY for now: browsers log violations to the console and block nothing.
 * It allows what the site really loads — its own scripts plus the inline layout script and Next.js's inline bootstrap
 * scripts (hence 'unsafe-inline'; a nonce-based policy is the later hardening step), inline styles (Tailwind/framer-
 * motion), local fonts, images from the site, img.youtube.com and this project's Supabase storage, and YouTube
 * (nocookie) video frames. Switch to enforcing only after the reports are clean.
 */

export interface HeaderOptions {
  /** e.g. abcdefghijklmnopqrst.supabase.co — the only Supabase host images may come from */
  supabaseHost: string | null;
  /** next dev needs eval and the HMR websocket */
  dev: boolean;
}

export function contentSecurityPolicy({ supabaseHost, dev }: HeaderOptions): string {
  const supabase = supabaseHost ? [`https://${supabaseHost}`] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://img.youtube.com", ...supabase],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabase, ...(dev ? ["ws:", "wss:"] : [])],
    "frame-src": ["https://www.youtube-nocookie.com", "https://www.youtube.com"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

export function securityHeaders(options: HeaderOptions): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // only powerful features the site never uses; fullscreen/autoplay stay available to the YouTube player
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(options) },
  ];
}
