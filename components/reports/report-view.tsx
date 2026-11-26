import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import { paragraphsOf, type Report, type ReportLine } from "@/lib/report";

export { embedsItself } from "@/lib/report";
import { signedPct } from "@/lib/review";

const PILL: Record<ReportLine["tone"], "ok" | "warn" | "danger" | "info" | "neutral"> = { ok: "ok", warn: "warn", danger: "danger", info: "info", neutral: "neutral" };
const LEVEL: Record<"ok" | "warn" | "danger", "ok" | "warn" | "danger"> = { ok: "ok", warn: "warn", danger: "danger" };

/** A report as the app shows it: the cover (verdict, pillars, returns) for a review, then the same sections the email carries. */
export function ReportView({ report }: { report: Report }) {
  return (
    <>
      <p className="mb-2 px-1 text-subhead text-text-secondary">
        {report.shapedBy}. Figures as of <span className="data">{report.asOf}</span>.
      </p>
      {report.verdict ? (
        <div className="card mb-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={LEVEL[report.verdict.level]}>{report.verdict.label}</StatusPill>
            <span className="text-subhead text-text-secondary">{report.verdict.reason}</span>
          </div>
          {report.pillars.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {report.pillars.map((p) => (
                <li key={p.label} className="rounded-control bg-surface-2 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-subhead">{p.label}</span>
                    <StatusPill tone={LEVEL[p.level]}>{p.status}</StatusPill>
                  </div>
                  <p className="mt-1 text-footnote text-text-secondary">{p.note}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {report.returns.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-subhead">
                <thead>
                  <tr className="text-left text-footnote text-text-tertiary">
                    <th className="py-1 pr-3 font-normal">Return</th>
                    <th className="py-1 pr-3 font-normal">Account</th>
                    {Object.keys(report.returns[0].benchmarks).map((b) => (
                      <th key={b} className="py-1 pr-3 font-normal">
                        {b}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.returns.map((r) => (
                    <tr key={r.label} className="border-t border-hairline">
                      <td className="py-1 pr-3">{r.label}</td>
                      <td className="data py-1 pr-3">{r.account === null ? "Waiting" : signedPct(r.account, 2)}</td>
                      {Object.entries(r.benchmarks).map(([b, v]) => (
                        <td key={b} className="data py-1 pr-3">
                          {v === null ? "Waiting" : signedPct(v, 2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.returns.find((r) => r.note)?.note ? <p className="mt-1 text-footnote text-text-tertiary">{report.returns.find((r) => r.note)?.note}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="mb-6 px-1 text-body">{report.summary}</p>
      {report.prose ? (
        <blockquote className="mb-6 border-l-2 border-accent px-4 py-1 text-body leading-relaxed text-text-secondary">
          {paragraphsOf(report.prose).map((p, i) => (
            <p key={i} className={i ? "mt-3" : undefined}>
              {p}
            </p>
          ))}
        </blockquote>
      ) : null}
      {report.notes.map((n) => (
        <p key={n} className="mb-4 px-1 text-footnote text-text-secondary">
          {n}
        </p>
      ))}
      {report.sections.map((s) => (
        <ListSection key={s.heading} header={s.heading} footer={s.footer ?? undefined}>
          {s.lines.map((l, i) => (
            <ListRow
              key={`${l.label}-${i}`}
              wrap
              label={
                l.href ? (
                  <a href={l.href} target="_blank" rel="noreferrer" className="text-accent-text underline-offset-2 hover:underline">
                    {l.label}
                  </a>
                ) : (
                  l.label
                )
              }
              detail={l.detail ?? undefined}
              value={l.value ? l.tone === "neutral" ? <span className="data">{l.value}</span> : <StatusPill tone={PILL[l.tone]}>{l.value}</StatusPill> : undefined}
            />
          ))}
        </ListSection>
      ))}
      <p className="px-1 text-footnote text-text-tertiary">Not investment advice.</p>
    </>
  );
}
