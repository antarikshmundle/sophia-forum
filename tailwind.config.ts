import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        "google-blue": "hsl(var(--google-blue))",
        "google-red": "hsl(var(--google-red))",
        "google-yellow": "hsl(var(--google-yellow))",
        "google-green": "hsl(var(--google-green))",
      },
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "sans-serif"],
        heading: ["var(--font-heading)", "Space Grotesk", "sans-serif"],
        pixel: ["var(--font-pixel)", '"Press Start 2P"', "monospace"],
        body: ["var(--font-body)", '"DM Sans"', "sans-serif"],
        mono: ["var(--font-mono)", '"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        brutal: "4px 4px 0px hsl(0 0% 7%)",
        "brutal-lg": "6px 6px 0px hsl(0 0% 7%)",
        "brutal-hover": "8px 8px 0px hsl(0 0% 7%)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.12)",
        "glass-lg": "0 16px 48px rgba(0, 0, 0, 0.16)",
      },
      borderRadius: {
        sm: "12px",
        md: "20px",
        lg: "28px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
