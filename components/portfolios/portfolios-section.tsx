import { ActionForm } from "@/components/app/action-form";
import { ListRow, ListSection } from "@/components/ui/list";
import { addPortfolioAction, moveAccountAction, removePortfolioAction, renamePortfolioAction, setMethodologyModeAction } from "@/app/(app)/setup/portfolio-actions";
import { MAX_PORTFOLIOS, METHODOLOGY_MODE_LABEL, METHODOLOGY_MODES, type PortfoliosFile } from "@/lib/portfolios";

const field = "block w-full rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body";

/**
 * Setup's portfolios: each a name and the accounts in it, every account in
 * exactly one; then whether one methodology applies to all of them or each
 * keeps its own. The lens at the top of every screen switches between them.
 */
export function PortfoliosSection({ file, demo, shared, bare = false }: { file: PortfoliosFile; demo: boolean; shared: string | null; bare?: boolean }) {
  return (
    <section className={bare ? "pt-3" : "mb-8"} aria-labelledby={bare ? undefined : "portfolios-h"}>
      {bare ? null : (
        <>
          <h2 id="portfolios-h" className="section-header mb-2 px-1">
            Portfolios
          </h2>
          <p className="mb-3 px-1 text-footnote text-text-secondary">
            Group your accounts into portfolios: a broker each, or private assets apart. Every screen can then show all of them together or one at a time, from the switch at the top. Each account sits in one portfolio, so nothing is counted twice.
          </p>
        </>
      )}
      {file.items.map((p) => (
        <ListSection grid
          key={p.id}
          header={p.name}
          className="mb-4"
          footer={
            file.mode === "each"
              ? p.methodology
                ? `Its own methodology: ${p.methodology.name}.`
                : "No methodology of its own yet: switch to it at the top, then attach one on Methodology."
              : undefined
          }
        >
          {p.accounts.length ? (
            p.accounts.map((a) => (
              <ListRow
                key={a}
                wrap
                label={a}
                trailing={
                  file.items.length > 1 ? (
                    <ActionForm action={moveAccountAction} label="Move" variant="ghost" size="sm" className="flex items-center gap-2">
                      <input type="hidden" name="account" value={a} />
                      <label className="sr-only" htmlFor={`to-${p.id}-${a}`}>
                        Move {a} to
                      </label>
                      <select id={`to-${p.id}-${a}`} name="to" defaultValue={file.items.find((x) => x.id !== p.id)!.id} className="rounded-[10px] border border-hairline bg-bg px-2 py-1 text-footnote">
                        {file.items
                          .filter((x) => x.id !== p.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                    </ActionForm>
                  ) : undefined
                }
              />
            ))
          ) : (
            <ListRow label="No accounts yet" detail="Move one here from another portfolio." />
          )}
          <div className="flex flex-wrap items-start gap-2 px-4 py-3">
            <ActionForm action={renamePortfolioAction} label="Rename" variant="secondary" size="sm" className="flex items-center gap-2">
              <input type="hidden" name="id" value={p.id} />
              <label className="sr-only" htmlFor={`name-${p.id}`}>
                New name for {p.name}
              </label>
              <input id={`name-${p.id}`} name="name" maxLength={40} defaultValue={p.name} className="w-40 rounded-[10px] border border-hairline bg-bg px-2 py-1 text-footnote" />
            </ActionForm>
            {file.items.length > 1 ? (
              <ActionForm action={removePortfolioAction} label="Remove" variant="ghost" size="sm">
                <input type="hidden" name="id" value={p.id} />
              </ActionForm>
            ) : null}
          </div>
        </ListSection>
      ))}
      {file.items.length < MAX_PORTFOLIOS ? (
        <ActionForm action={addPortfolioAction} label="Add a portfolio" variant="secondary" doneLabel="Portfolio added" className={bare ? "mb-4" : "mb-6 px-1"}>
          <label className="mb-1 block text-footnote text-text-secondary" htmlFor="new-portfolio">
            Name
          </label>
          <input id="new-portfolio" name="name" maxLength={40} placeholder="Private assets" className={`${field} mb-2`} />
        </ActionForm>
      ) : null}
      {file.items.length > 1 ? (
        <ListSection header="Methodology" footer={demo ? "The demo keeps one methodology for all portfolios; one each needs your own vault." : file.mode === "each" ? "Each portfolio's rules, classes and pages apply to it alone. All portfolios together show the combined figures with no verdict of their own, and the Dashboard lists each portfolio's breaches under its name." : `${shared ? `${shared} applies` : "Your methodology applies"} to every portfolio and to all of them together.`}>
          {METHODOLOGY_MODES.map((mode) => (
            <ListRow
              key={mode}
              label={METHODOLOGY_MODE_LABEL[mode]}
              detail={file.mode === mode ? "Chosen." : undefined}
              trailing={
                file.mode === mode || (demo && mode === "each") ? undefined : (
                  <ActionForm action={setMethodologyModeAction} label="Choose" variant="secondary" size="sm">
                    <input type="hidden" name="mode" value={mode} />
                  </ActionForm>
                )
              }
            />
          ))}
        </ListSection>
      ) : null}
    </section>
  );
}
