import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import { type Evidence } from "@/lib/theses";
import { longDate } from "@/lib/time";

const KIND_LABEL = { document: "Document", data: "Data", note: "Note" } as const;

/** What was folded into a thesis over time, newest first: the source, what it said, what it changed, and who added it. */
export function EvidenceList({ evidence, id = "evidence" }: { evidence: readonly Evidence[]; id?: string }) {
  if (!evidence.length) return null;
  const rows = [...evidence].reverse();
  return (
    <ListSection id={id} header={`Added to the thesis · ${rows.length}`} footer="Each entry says what the document, data or note said and what it changed; the thesis above is the result. Added by Claude means your own Claude read it through the connector." className="mb-8">
      {rows.map((e) => (
        <ListRow
          key={e.id}
          wrap
          label={
            <span className="flex flex-wrap items-center gap-2">
              <span>{e.source}</span>
              <span className="data text-caption text-text-tertiary">{longDate(e.at)}</span>
            </span>
          }
          detail={
            <span className="block">
              <span className="block">{e.summary}</span>
              {e.changes ? <span className="mt-1 block text-text">Changed: {e.changes}</span> : <span className="mt-1 block text-text-tertiary">Nothing in the thesis changed.</span>}
            </span>
          }
          value={
            <span className="flex flex-col items-end gap-1">
              <StatusPill tone={e.via === "claude" ? "info" : "neutral"}>{e.via === "claude" ? "Added by Claude" : "Your note"}</StatusPill>
              <span className="text-caption text-text-tertiary">{KIND_LABEL[e.kind]}</span>
            </span>
          }
        />
      ))}
    </ListSection>
  );
}
