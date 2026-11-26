import type { Metadata } from "next";
import localFont from "next/font/local";
import { redirect } from "next/navigation";

import { siteMarkup } from "@/components/site/site-markup";
import { contactAddress, demoBase, sourceUrl } from "@/lib/deployment";
import { storageMode } from "@/lib/storage";
import { signUpOpen, usersAvailable } from "@/lib/users";

import "./site.css";

const newsreader = localFont({
  src: [
    { path: "../fonts/newsreader-var.woff2", weight: "400 500", style: "normal" },
    { path: "../fonts/newsreader-italic-var.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  title: "Invariant · Markets move. Your rules don't.",
  description: "Invariant reads your portfolio against the rules you wrote, twice a day, cites the rule every time and never trades.",
  // The one page meant to be found: the app behind it stays unindexed (next.config.ts).
  robots: { index: true, follow: true },
};

/**
 * The public site (Hamza, 4 Nov 2026), drawn at / for anyone signed out
 * (proxy.ts) and at /site: what Invariant is, its story, how it works, that
 * it is open source (Hamza, 26 Nov 2026), the demo, and Log in and Sign up at the top right. It reads nothing
 * of anyone. A demo deployment has no site: its / is the showcase.
 */
export default function SitePage() {
  if (storageMode() === "demo") redirect("/");
  const open = usersAvailable() && signUpOpen();
  const demo = demoBase();
  const html = siteMarkup({ signUp: open ? "/sign-up" : "/sign-in", logIn: "/sign-in", demo: demo === null ? null : `${demo}/try`, contact: contactAddress(), source: sourceUrl() });
  return (
    <div className={`inv ${newsreader.variable}`}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
