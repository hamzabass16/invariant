/**
 * The verified record badge for a CV or a LinkedIn profile (Hamza, 9 Nov
 * 2026, the twenty further ways): a small picture drawn from the person's
 * shared track record, served at /badge/<link code>.svg, with the card's
 * link beside it. It says what the app read (the record's length, the rules
 * kept, the streak and the verified mark), never an amount; a card with no
 * shared record draws a badge that says so. Pure.
 */
import { badgeOf, streakWeeks, type CommunityProfile } from "@/lib/community";
import { daysBetween } from "@/lib/time";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The badge's two lines: what it is and what the record says. */
export function badgeLines(p: Pick<CommunityProfile, "name" | "record" | "sharing">): { verified: boolean; title: string; detail: string } {
  const r = p.sharing.record ? p.record : null;
  const b = badgeOf(r);
  if (!r) return { verified: false, title: `${p.name} on Invariant`, detail: "No track record shared" };
  const years = daysBetween(r.since, r.through) / 365.25;
  const span = years >= 1 ? `${years.toFixed(1)} years of record` : `${daysBetween(r.since, r.through)} days of record`;
  const weeks = streakWeeks(r);
  const parts = [span, r.rulesKeptPct === null ? null : `${r.rulesKeptPct}% of rules kept`, weeks ? `${weeks} weeks without a breach` : null].filter(Boolean);
  return { verified: b.verified, title: b.verified ? `${p.name} · Verified analyst` : `${p.name} · Track record`, detail: parts.join(" · ") };
}

/** The badge as an SVG, 380 by 64, light; text is escaped and nothing is fetched. */
export function badgeSvg(p: Pick<CommunityProfile, "name" | "record" | "sharing">): string {
  const l = badgeLines(p);
  const accent = l.verified ? "#0f8a6b" : "#52514e";
  const title = esc(l.title.slice(0, 48));
  const detail = esc(l.detail.slice(0, 64));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="64" viewBox="0 0 380 64" role="img" aria-label="${title}: ${detail}"><title>${title}: ${detail}</title><rect x="0.5" y="0.5" width="379" height="63" rx="10" fill="#ffffff" stroke="#e7e6e2"/><rect x="12" y="12" width="40" height="40" rx="9" fill="${accent}"/><path d="M24 33l6 6 11-14" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"${l.verified ? "" : ' opacity="0.35"'}/><text x="64" y="28" font-family="Inter, Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="#0b0b0b">${title}</text><text x="64" y="47" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11.5" fill="#52514e">${detail}</text><text x="368" y="58" text-anchor="end" font-family="Inter, Helvetica, Arial, sans-serif" font-size="8.5" fill="#8a8a88">Invariant</text></svg>`;
}

/** What to paste: Markdown for a README or a profile, and HTML for a site. */
export function badgeSnippets(origin: string, code: string, name: string): { markdown: string; html: string; image: string; link: string } {
  const image = `${origin}/badge/${code}`;
  const link = `${origin}/card/${code}`;
  const alt = `${name}'s track record on Invariant`;
  return { image, link, markdown: `[![${alt}](${image})](${link})`, html: `<a href="${esc(link)}"><img src="${esc(image)}" alt="${esc(alt)}" width="380" height="64"></a>` };
}
