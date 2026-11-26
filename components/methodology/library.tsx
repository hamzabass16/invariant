import { ActionForm } from "@/components/app/action-form";
import { LIBRARY, libraryCounts } from "@/lib/library";

import { adoptLibraryAction, setShadowAction } from "@/app/(app)/methodology/actions";

/**
 * The ready-made methodologies, one card each: what it is in plain words,
 * what the app gets from it, and one button that makes it a draft to confirm.
 * No key is needed; the file is the graph itself.
 */
export function LibraryCards({ mode, current, doneHref }: { mode: "demo" | "drive"; current: string | null; doneHref?: string }) {
  return (
    <div className="pair-grid grid gap-3 lg:grid-cols-2">
      {LIBRARY.map((e) => {
        const c = libraryCounts(e);
        const inUse = current === e.name;
        return (
          <article key={e.id} className="rounded-xl border border-hairline-strong bg-surface-2 px-4 py-4">
            <p className="section-header mb-1">{e.credit}</p>
            <h3 className="text-title-3">{e.name}</h3>
            <p className="mt-1 text-body text-text-secondary">{e.oneLine}</p>
            <p className="data mt-2 text-caption text-text-tertiary">
              {c.classes} classes · {c.rules} rules, {c.tested} the app tests · {c.figures} figures{e.template ? ` · its own stock template, ${e.template.sections.length} sections` : ""}
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-subhead text-accent-text">What it is, in plain words</summary>
              <div className="mt-2 space-y-2 text-subhead text-text-secondary">
                {e.summary.map((p) => (
                  <p key={p.slice(0, 24)}>{p}</p>
                ))}
              </div>
            </details>
            <ActionForm action={adoptLibraryAction} label={inUse ? "Draft it again" : "Use this methodology"} pendingLabel="Drafting" variant={inUse ? "secondary" : "primary"} doneLabel="Drafted; opening it" doneHref={doneHref} className="mt-4">
              <input type="hidden" name="library" value={e.id} />
              {mode === "drive" && e.template ? (
                <label className="mb-3 flex items-start gap-2 text-subhead">
                  <input name="template" type="checkbox" value="yes" defaultChecked className="mt-1 size-4 accent-[var(--accent)]" />
                  <span>Also use its stock research template on the Research screen. Your current template, if any, is replaced.</span>
                </label>
              ) : null}
            </ActionForm>
            {mode === "drive" ? (
              <ActionForm action={setShadowAction} label="Run beside mine" pendingLabel="Reading" variant="ghost" size="sm" doneLabel="Running" doneHref="/methodology?view=shadow" className="mt-2">
                <input type="hidden" name="shadow" value={e.id} />
              </ActionForm>
            ) : null}
            <p className="mt-2 text-footnote text-text-tertiary">{mode === "demo" ? "In the demo it opens in the builder like a sample; nothing is kept." : "It becomes a draft you confirm or discard; nothing changes until you confirm. The figures it tests are yours alone."}</p>
          </article>
        );
      })}
    </div>
  );
}
