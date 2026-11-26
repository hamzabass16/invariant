import { ActionForm } from "@/components/app/action-form";
import { CopyButton } from "@/components/app/copy-button";
import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import { FAMILY_STATUS_WORDS, familyGrid, heldInCommon, householdView, type FamilyResult, type FamilyStatus, type MemberCard } from "@/lib/households";
import { RULE_PACKS } from "@/lib/rule-packs";

import { createHouseholdAction, householdPackAction, joinHouseholdAction, leaveHouseholdAction } from "@/app/(app)/community/actions";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

export type FamilyGroup = { id: string; name: string; code: string | null; pack: string | null; members: (MemberCard & { result?: FamilyResult | null })[] };

const STATUS_TONE: Record<FamilyStatus, "ok" | "warn" | "danger" | "neutral"> = { kept: "ok", near: "warn", broken: "danger", unread: "neutral" };

/** Family rules (Hamza, 9 Nov 2026, the twenty further ways): the pack the household keeps, each member's own app reading it on their own book, a status and a percent or count each, never an amount. */
function FamilyRules({ g, demo }: { g: FamilyGroup; demo: boolean }) {
  const pack = RULE_PACKS.find((p) => p.id === g.pack) ?? null;
  const grid = pack ? familyGrid(pack, g.members.map((m) => ({ name: m.name, you: m.you, result: m.result ?? null }))) : null;
  return (
    <div className="mt-3 mb-2">
      {pack && grid ? (
        <ListSection header={`Family rules: ${pack.name}, ${grid.tested ? `${grid.kept} of ${grid.tested} kept` : "not read yet"}`} footer="Each member's own app reads the pack on their own book when they open it; here is each rule's status and its reading in percent or a count, never an amount. Not advice.">
          {grid.rules.map((r, i) => (
            <ListRow key={r.id} wrap label={r.text} detail={grid.rows.map((row) => `${row.name}: ${row.cells[i].status ? FAMILY_STATUS_WORDS[row.cells[i].status!] : "not read yet"}${row.cells[i].actual ? ` (${row.cells[i].actual})` : ""}`).join(" · ")} value={<span className="flex flex-wrap gap-1">{grid.rows.map((row) => (row.cells[i].status ? <StatusPill key={row.name} tone={STATUS_TONE[row.cells[i].status!]}>{row.name}</StatusPill> : null))}</span>} />
          ))}
        </ListSection>
      ) : null}
      {!demo ? (
        <ActionForm action={householdPackAction} label={pack ? "Change the rules" : "Keep these rules together"} pendingLabel="Saving" doneLabel="Saved" variant="secondary" size="sm" className="card mt-2 px-4 py-3">
          <input type="hidden" name="id" value={g.id} />
          <label className="block text-subhead">
            Rules the household keeps
            <select name="pack" defaultValue={g.pack ?? ""} className={field}>
              <option value="">None</option>
              {RULE_PACKS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        </ActionForm>
      ) : null}
    </div>
  );
}

/**
 * Family accounts (lib/households.ts; Hamza, 9 Nov 2026): each household's
 * members side by side, from the cards they share on Community alone, the
 * holdings two or more of them hold, and the forms to start, join or leave
 * one. Never an amount.
 */
export function FamilySection({ groups, demo }: { groups: FamilyGroup[]; demo: boolean }) {
  return (
    <section className="mt-8 mb-8" aria-labelledby="family">
      <h2 id="family" className="section-header mb-2 px-1">Your family</h2>
      {groups.map((g) => {
        const rows = householdView(g.members);
        const common = heldInCommon(rows);
        return (
          <div key={g.id} className="mb-4">
            <ListSection grid header={g.name} footer={`${common.length ? `Held by two or more of you: ${common.map((c) => `${c.symbol} (${c.members})`).join(", ")}. ` : ""}Each of you signs in to your own app; here are only the cards you each share on Community, weights in percent and records in points, never an amount.`}>
              {rows.map((r) => (
                <ListRow
                  key={r.name}
                  wrap
                  label={`${r.name}${r.you ? " (you)" : ""}`}
                  detail={r.sharing ? `${r.top.length ? r.top.map((t) => `${t.symbol} ${t.weightPct}%`).join(" · ") : "Weights not shared"}${r.methodology ? ` · ${r.methodology}` : ""} · ${r.theses} ${r.theses === 1 ? "thesis" : "theses"}` : "Shares no card yet: Share with the community below to show here."}
                  value={r.sharing ? <span className="data text-footnote">{r.againstSpyPts === null ? "No record shared" : `${r.againstSpyPts >= 0 ? "+" : ""}${r.againstSpyPts} pts vs SPY${r.rulesKeptPct === null ? "" : ` · ${r.rulesKeptPct}% rules kept`}`}</span> : null}
                />
              ))}
            </ListSection>
            <FamilyRules g={g} demo={demo} />
            {!demo ? (
              <div className="flex flex-wrap items-center gap-3 px-1">
                {g.code ? (
                  <span className="text-footnote text-text-secondary">
                    Join code <span className="data">{g.code}</span> <CopyButton text={g.code} label="Copy" />
                  </span>
                ) : null}
                <ActionForm action={leaveHouseholdAction} label="Leave" pendingLabel="Leaving" doneLabel="Left" variant="ghost" size="sm">
                  <input type="hidden" name="id" value={g.id} />
                </ActionForm>
              </div>
            ) : null}
          </div>
        );
      })}
      {demo ? (
        <p className="px-1 text-caption text-text-tertiary">The demo&apos;s family is fictional.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ActionForm action={createHouseholdAction} label="Start a household" pendingLabel="Starting" doneLabel="Started" variant="secondary" size="sm" className="card px-4 py-4">
            <label className="block text-subhead">
              Household
              <input name="name" className={field} maxLength={60} placeholder="The Rivera family" required />
            </label>
            <label className="mt-2 block text-subhead">
              Your name in it
              <input name="me" className={field} maxLength={60} placeholder="Mum" />
            </label>
          </ActionForm>
          <ActionForm action={joinHouseholdAction} label="Join" pendingLabel="Joining" doneLabel="Joined" variant="secondary" size="sm" className="card px-4 py-4">
            <label className="block text-subhead">
              Join code
              <input name="code" className={`${field} data`} maxLength={20} required />
            </label>
            <label className="mt-2 block text-subhead">
              Your name in it
              <input name="me" className={field} maxLength={60} />
            </label>
          </ActionForm>
        </div>
      )}
    </section>
  );
}
