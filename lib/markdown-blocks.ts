/**
 * A small Markdown reader for the studies, pure: headings, paragraphs, bullet
 * and numbered lists, pipe tables, blockquotes, fenced code, and bold, italic
 * and inline code within a line. Links are kept as their text; nothing is
 * fetched or executed. The screen (components/research/markdown.tsx) and the
 * PDF (components/research/study-pdf.tsx) read the same blocks, so the two
 * never disagree on what a section says.
 */

export type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; head: string[] | null; rows: string[][] };

/** The runs of one line: plain text, bold, italic, code; a link is its text. */
export function inlineRuns(text: string): Run[] {
  const out: Run[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**")) out.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith("`")) out.push({ text: t.slice(1, -1), code: true });
    else if (t.startsWith("[")) out.push({ text: t.slice(1, t.indexOf("]")) });
    else out.push({ text: t.slice(1, -1), italic: true });
    last = m.index + t.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The text of a line with its marks removed. */
export const plainText = (text: string) => inlineRuns(text).map((r) => r.text).join("");

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
/** A cell that reads as a figure: digits, signs, separators, a percent or a multiple. */
export const isFigure = (c: string) => /^[-+]?[\d.,%x]+[mbk]?$/.test(c.trim());

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (l.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if (isTableLine(l)) {
      const rows: string[][] = [];
      let ruled = false;
      while (i < lines.length && isTableLine(lines[i])) {
        if (isRule(lines[i])) ruled = true;
        else rows.push(cells(lines[i]));
        i++;
      }
      // A table with a rule under its first row has a header; one without is all body.
      const [head, ...body] = rows;
      blocks.push(ruled || rows.length > 1 ? { kind: "table", head: head ?? null, rows: body } : { kind: "table", head: null, rows });
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: "heading", text: h[2] });
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "quote", text: q.join(" ") });
      continue;
    }
    const bullet = /^\s*[-*+]\s+/.test(l);
    const numbered = /^\s*\d+[.)]\s+/.test(l);
    if (bullet || numbered) {
      const items: string[] = [];
      const re = bullet ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/;
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i++].replace(re, "");
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(item);
      }
      blocks.push({ kind: "list", ordered: numbered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isTableLine(lines[i]) && !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s+|\s*\d+[.)]\s+)/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push({ kind: "paragraph", text: para.join(" ") });
  }
  return blocks;
}
