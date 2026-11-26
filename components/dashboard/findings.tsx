import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import { testedAs, type Finding, type Methodology } from "@/lib/methodology";

const ORDER = { fail: 0, near: 1, manual: 2, pass: 3, "n/a": 4 } as const;

function pill(f: Finding) {
  if (f.status === "fail") return f.rule.severity === "breach" ? <StatusPill tone="danger">Breach</StatusPill> : f.rule.severity === "watch" ? <StatusPill tone="info">Watch tripped</StatusPill> : <StatusPill tone="warn">Outside guideline</StatusPill>;
  if (f.status === "near") return <StatusPill tone="info">Near limit</StatusPill>;
  if (f.status === "pass") return <StatusPill tone="ok">{f.rule.severity === "watch" ? "Watching" : "Within"}</StatusPill>;
  if (f.status === "manual") return <StatusPill tone="neutral">Yours to check</StatusPill>;
  return <StatusPill tone="neutral">{f.needs.length ? "Needs data" : "Not yet"}</StatusPill>;
}

/** Each rule with its result, worst first. Every row cites the section of the owner's document. */
export function Findings({ findings, m, ccy, header, footer, limit }: { findings: Finding[]; m: Pick<Methodology, "figures">; ccy: string; header?: string; footer?: React.ReactNode; limit?: number }) {
  const rows = [...findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]).slice(0, limit ?? findings.length);
  return (
    <ListSection header={header} footer={footer}>
      {rows.map((f) => (
        <ListRow
          key={f.rule.id}
          wrap
          label={
            <>
              <span className="data mr-2 text-text-tertiary">{f.rule.section}</span>
              {f.rule.text}
            </>
          }
          detail={`${testedAs(f.rule, m, ccy)}${f.actual !== null ? ` · now ${f.actual}` : ""}${f.detail ? ` · ${f.detail}` : ""}`}
          trailing={pill(f)}
        />
      ))}
    </ListSection>
  );
}
