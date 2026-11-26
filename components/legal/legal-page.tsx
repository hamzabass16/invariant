import type { Route } from "next";
import Link from "next/link";
import { contactWords } from "@/lib/deployment";

export type LegalSection = { title: string; body: string[] };

/**
 * The frame of the public policy pages (/privacy, /terms, /cookies): no sign-in, the
 * sign-in page's own look, dated, each section a heading and plain
 * paragraphs. Google's consent screen links them; the sign-in page too.
 */
export function LegalPage({ kicker, title, dated, lead, sections }: { kicker: string; title: string; dated: string; lead: string; sections: LegalSection[] }) {
  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-12">
      <p className="brand-mark">{kicker}</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">{title}</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      <p className="mt-3 text-footnote text-text-tertiary">Dated {dated}.</p>
      <p className="mt-4 text-body text-text-secondary">{lead}</p>
      {sections.map((s) => (
        <section key={s.title} className="mt-8">
          <h2 className="text-title-3 font-semibold">{s.title}</h2>
          {s.body.map((p, i) => (
            <p key={i} className="mt-2 text-body text-text-secondary">
              {p}
            </p>
          ))}
        </section>
      ))}
      <nav aria-label="Policies" className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-6 text-footnote text-text-tertiary">
        <Link href={"/sign-in" as Route} className="underline-offset-4 hover:underline">
          Sign in
        </Link>
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">
          Privacy
        </Link>
        <Link href={"/terms" as Route} className="underline-offset-4 hover:underline">
          Terms
        </Link>
        <Link href={"/cookies" as Route} className="underline-offset-4 hover:underline">
          Cookies
        </Link>
      </nav>
    </main>
  );
}

/** The one address a person can write to; it is also the address the app's codes and reports come from. */
/** The deployment's own contact address, from its settings (lib/deployment.ts), or who it would be. */
export const CONTACT_ADDRESS = contactWords();
