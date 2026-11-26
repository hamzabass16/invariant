/**
 * A study written by the person's own Claude through the connector (Hamza,
 * 9 Nov 2026: write_study, the beta's write-back tools). The app still queues
 * the study, reads the filings and runs the methodology's checks; Claude is
 * given the very brief the app's own writer gets (`researchInstructions`,
 * `researchMessages`) and sends the sections back. Each section is kept only
 * when every figure in it is printed in that brief, or worked out on the same
 * line from figures that are ("127,006m = 134,360m less 7,354m"); a section
 * that states any other figure is not kept, and the tool names the figures so
 * Claude can write it again. Pure.
 */
import type { Methodology } from "@/lib/methodology";
import { figuresIn, printedIn } from "@/lib/printed-figures";
import { SECTION_CHARS, type Study } from "@/lib/research";
import { clipSection, researchInstructions, researchMessages } from "@/lib/research-prompt";

/** Studies a person's Claude may write: any with sections still to write, a stopped one too. */
export const writableStudies = (studies: readonly Study[]) => studies.filter((s) => s.status !== "done" && s.pending.length > 0);

/** The brief for every section still to write, as the app's writer would get it, asking for write_study instead of its own tool. */
export function studyBrief(m: Methodology, study: Study): string {
  const pending = new Set(study.pending);
  const messages = researchMessages(study, study.sections.filter((s) => pending.has(s.id))) as { content: { text: string }[] }[];
  const asked = messages.map((x) => x.content.map((c) => c.text).join("\n")).join("\n").replace("by calling write_sections once with one entry per section id", `by calling write_study once with id ${study.id} and one entry per section id (Markdown)`);
  return [researchInstructions(m, study).replace(/write_sections/g, "write_study"), "", asked].join("\n");
}

/** A figure is shown worked out when its line sets it equal to figures the brief prints. */
function workedOut(figure: string, text: string, brief: string): boolean {
  return text.split(/\n|(?<=[.;])\s/).some((line) => {
    if (!/=/.test(line) || !figuresIn(line).includes(figure)) return false;
    const others = figuresIn(line).filter((f) => f !== figure);
    return others.length >= 1 && others.every((f) => printedIn(f, [brief]));
  });
}

/** The figures a section states that the brief does not print and no line works out. */
export function unprintedFigures(markdown: string, brief: string): string[] {
  return [...new Set(figuresIn(markdown))].filter((f) => !printedIn(f, [brief]) && !workedOut(f, markdown, brief));
}

export type SectionCheck = { kept: Record<string, string>; refused: { id: string; title: string; figures: string[] }[]; unknown: string[]; clipped: string[] };

/** Reads what Claude wrote, section by section, against the brief it was given. */
export function checkSections(study: Study, brief: string, written: readonly { id: string; markdown: string }[]): SectionCheck {
  const titles = new Map(study.sections.map((s) => [s.id, s.title]));
  const pending = new Set(study.pending);
  const out: SectionCheck = { kept: {}, refused: [], unknown: [], clipped: [] };
  for (const w of written) {
    if (!pending.has(w.id)) {
      out.unknown.push(w.id);
      continue;
    }
    const text = w.markdown.trim();
    const figures = unprintedFigures(text, brief);
    if (figures.length) {
      out.refused.push({ id: w.id, title: titles.get(w.id) ?? w.id, figures: figures.slice(0, 8) });
      continue;
    }
    if (text.length > SECTION_CHARS) out.clipped.push(w.id);
    out.kept[w.id] = clipSection(text);
  }
  return out;
}
