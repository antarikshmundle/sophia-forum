import type { Metadata } from "next";
import "./fonts.css";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { LoginModal } from "@/components/auth/LoginModal";
import { AuthModeProvider } from "@/components/auth/AuthModeProvider";
import { cmsAuthMode } from "@/lib/cms/mode";

// Latin subsets preloaded, matching what next/font/google preloaded before self-hosting
const PRELOADED_FONTS = [
  "/fonts/space-grotesk/space-grotesk-latin.woff2",
  "/fonts/press-start-2p/press-start-2p-latin.woff2",
  "/fonts/dm-sans/dm-sans-latin.woff2",
  "/fonts/dm-sans/dm-sans-latin-italic.woff2",
  "/fonts/jetbrains-mono/jetbrains-mono-latin.woff2",
];

export const metadata: Metadata = {
  title: "SOPHIA FORUM",
  description:
    "Official website for SOPHIA FORUM - A Student Forum of the Artificial Intelligence & Data Science Department at Priyadarshini College of Engineering, Nagpur.",
  keywords: ["Sophia Forum", "AI & DS", "Student Forum", "Engineering", "Events", "Gallery", "Artificial Intelligence", "Data Science", "PCE Nagpur"],
  // generated from the official logo by qa/branding/generate-brand-icons.mjs
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "16x16 32x32 48x48" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "SOPHIA FORUM - AI & DS Department Forum",
    description: "Join the official platform for AI & DS students - Explore events, gallery, team and more!",
    siteName: "SOPHIA FORUM",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SOPHIA FORUM - AI & DS Department Forum",
    description: "Join the official platform for AI & DS students - Explore events, gallery, team and more!",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/Retron2000.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        {PRELOADED_FONTS.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        {/* Low-power mode initialization before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var lpOverride = localStorage.getItem("sophia-low-power-mode");
                var nav = navigator || {};
                var weakDevice =
                  (typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 8) <= 4 ||
                  (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) ||
                  (nav.connection && nav.connection.saveData === true) ||
                  (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
                if (lpOverride === "on" || (lpOverride !== "off" && weakDevice)) {
                  document.documentElement.classList.add("low-power");
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col antialiased selection:bg-google-yellow selection:text-foreground">
        <AuthModeProvider mode={cmsAuthMode()}>
          <Navbar />
          <main className="flex-1 graph-paper min-h-screen pt-20 sm:pt-24 pb-8 flex flex-col">
            {children}
          </main>
          <Footer />
          <LoginModal />
        </AuthModeProvider>
      </body>
    </html>
  );
}
