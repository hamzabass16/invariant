import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";

import { StealthMask } from "@/components/app/stealth";
import { ZoneCookie } from "@/components/app/zone-cookie";
import { STEALTH_COOKIE } from "@/lib/stealth";
// The person's zone is read from the request (instrumentation.ts registers it too).
import "@/lib/zone";

import "./globals.css";

/** Fonts are vendored in app/fonts so the build never depends on a font host. */
const barlowCondensed = localFont({
  src: [
    { path: "./fonts/barlow-condensed-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/barlow-condensed-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
  fallback: ["Arial Narrow", "sans-serif"],
});

const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
});

const newsreader = localFont({
  src: [
    { path: "./fonts/newsreader-var.woff2", weight: "400 600", style: "normal" },
    { path: "./fonts/newsreader-italic-var.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  fallback: ["Iowan Old Style", "Georgia", "serif"],
});

export const metadata: Metadata = {
  title: "Invariant",
  description: "A private console for one person's money: holdings, options, funds, property and the rules they set themselves.",
  robots: { index: false, follow: false },
  // Google Search Console's ownership tag for the app's home page, which Google's OAuth brand verification asks for (Hamza, 17 Oct 2026), from the deployment's own GOOGLE_SITE_VERIFICATION. Not a secret.
  ...(process.env.GOOGLE_SITE_VERIFICATION?.trim() ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } } : {}),
  appleWebApp: { capable: true, title: "Invariant", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
  ],
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

const THEMES = ["system", "dark", "light"];

/** The theme comes from its own cookie so the first paint already has it; "system" follows the device. */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const raw = (await cookies()).get("pos_theme")?.value;
  const theme = raw && THEMES.includes(raw) ? raw : "system";
  // Stealth mode hides every amount (components/app/stealth.tsx); set on the server so the first paint waits for the mask.
  const stealth = (await cookies()).get(STEALTH_COOKIE)?.value === "on" ? "on" : undefined;
  return (
    <html lang="en" data-theme={theme} data-stealth={stealth} className={`${barlowCondensed.variable} ${plexMono.variable} ${newsreader.variable}`}>
      <body>
        {children}
        <StealthMask />
        <ZoneCookie />
      </body>
    </html>
  );
}
