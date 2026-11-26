import type { Route } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/app/action-form";
import { ListRow, ListSection } from "@/components/ui/list";
import { LIBRARY } from "@/lib/library";
import { versionsOf } from "@/lib/methodology-versions";
import type { ShadowSide, shadowCompare } from "@/lib/shadow";
import type { Decision } from "@/lib/decisions";
import { longDate } from "@/lib/time";

import { setShadowAction } from "@/app/(app)/methodology/actions";

const pctOr = (v: number | null) => (v === null ? "none measured" : `${v}%`);
const signed = (v: number | null) => (v === null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

function SideCard({ s, own }: { s: ShadowSide; own: boolean }) {
  return (
    <article className="card px-4 py-4">
      <p className="section-header mb-1">{own ? "Yours" : "The shadow"}</p>
      <h3 className="text-headline">{s.name}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-subhead">
        <div>
          <dt className="text-caption text-text-tertiary">Rules kept</dt>
          <dd className="data">{pctOr(s.score)} of {s.measured}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-tertiary">Breaches</dt>
          <dd className="data">{s.breaches}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-tertiary">Holdings its classes take</dt>
          <dd className="data">
            {s.placed.count} · {s.placed.weightPct.toFixed(1)}% of the book
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-tertiary">Those holdings&apos; gain on cost</dt>
          <dd className="data">{signed(s.placed.gainPct)}</dd>
        </div>
      </dl>
    </article>
  );
}

/**
 * The shadow methodology (Hamza, 9 Nov 2026, the twenty further ways): a
 * library or listed methodology run on the same book beside the person's
 * own, its rules and classes read the same way, holding by holding where they
 * disagree. A second view; it never changes a verdict of theirs.
 */
export function ShadowView({ cmp, chosen, editable }: { cmp: ReturnType<typeof shadowCompare> | null; chosen: string | null; editable: boolean }) {
  return (
    <div className="space-y-6">
      <ActionForm action={setShadowAction} label={chosen ? "Run this one instead" : "Run it beside mine"} pendingLabel="Reading" variant="secondary" size="sm" doneLabel="Running" className="card px-4 py-4">
        <label className="mb-3 block text-subhead">
          A methodology to run beside yours
          <select name="shadow" defaultValue={chosen ?? ""} className="mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body" disabled={!editable}>
            <option value="">None</option>
            {LIBRARY.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <p className="mb-3 text-footnote text-text-tertiary">It reads your book the same way yours does and draws beside it; your checks, alerts and reviews stay yours. A listed methodology runs here too: press Run beside mine on the marketplace.</p>
      </ActionForm>
      {cmp ? (
        <>
          <div className="pair-grid grid gap-3 lg:grid-cols-2">
            {cmp.own ? <SideCard s={cmp.own} own /> : null}
            <SideCard s={cmp.shadow} own={false} />
          </div>
          <ListSection header={`Where they place your holdings differently: ${cmp.disagree}`} footer="Each listed holding with the class each methodology's own tests give it today, by weight. Gain on cost is the holding's own, from the statement.">
            {cmp.rows.map((r) => (
              <ListRow key={r.symbol} wrap label={`${r.symbol} · ${r.weightPct.toFixed(1)}%`} detail={`Yours: ${r.own ?? "no class"} · Shadow: ${r.shadow ?? "no class"}${r.gainPct === null ? "" : ` · ${signed(r.gainPct)} on cost`}`} value={r.own !== r.shadow ? <span className="text-footnote text-warning">Differs</span> : <span className="text-footnote text-text-tertiary">Same</span>} />
            ))}
          </ListSection>
        </>
      ) : (
        <p className="card px-4 py-4 text-subhead text-text-secondary">{chosen ? "The shadow could not be read on this book." : "Choose a methodology above to see how it would read your book."}</p>
      )}
    </div>
  );
}

/**
 * Sealed methodology versions (Hamza, 9 Nov 2026, the twenty further ways):
 * every confirmed version in the Decision Log with what changed and its
 * fingerprint, registered when it was confirmed, so the rules can be shown to
 * have been set before the results.
 */
export function VersionsView({ entries, sealed }: { entries: readonly Decision[]; sealed: ReadonlyMap<string, string> }) {
  const versions = versionsOf(entries);
  if (!versions.length) return <p className="card px-4 py-4 text-subhead text-text-secondary">No version sealed yet: the next time you confirm a draft, its words are fingerprinted and dated here and in the Decision Log.</p>;
  return (
    <ListSection header={`${versions.length} ${versions.length === 1 ? "version" : "versions"}, newest first`} footer="A version's fingerprint is SHA-256 of its name, summary, classes, rules and figures as confirmed; the receipt shows when the app first saw it.">
      {versions.map((v) => {
        const at = sealed.get(v.fingerprint);
        return (
          <ListRow
            key={v.id}
            wrap
            label={`${v.title}`}
            detail={`${longDate(v.date)} · ${v.text.split("\n").slice(0, 4).join("; ")}${v.text.split("\n").length > 4 ? "; and more" : ""}`}
            value={
              at ? (
                <Link href={`/receipt/${v.fingerprint}` as Route} className="data text-footnote text-accent-text">
                  Sealed {longDate(at.slice(0, 10))} · {v.fingerprint.slice(0, 12)}
                </Link>
              ) : (
                <span className="data text-footnote text-text-tertiary">{v.fingerprint.slice(0, 12)}</span>
              )
            }
          />
        );
      })}
    </ListSection>
  );
}
