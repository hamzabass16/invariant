import { MODELS } from "@/lib/models";
import { checkDoc, docText, withoutTexts, type DocFinding, type ReportDoc } from "@/lib/report-doc";

/**
 * The reviewer (Hamza, 4 Nov 2026: "an agent ... that reviews it like a
 * human would read it, and holds it until it is complete"): before a report
 * is sent, a fast model reads the whole document as its reader would and
 * names each line that is unfinished, cut, a blob, wrong for the company,
 * repeated or meaningless, with the exact words. A line it says to drop is
 * taken out (`withoutTexts`); a page it says is missing what it promises
 * holds the report. The app's own first pass (`checkDoc`) runs first and is
 * given to the model, so it never has to find what the app already found.
 * The reviewer writes no words of the report and changes no figure. Pure.
 */

export const REVIEW_MODEL = MODELS.fast;
const MAX_NOTES = 20;

export type ReviewNote = { page: string; quote: string; problem: string; act: "drop" | "hold" };
export type DocReview = { ready: boolean; notes: ReviewNote[]; drop: string[]; held: string[] };

export function docReviewRequestBody(doc: ReportDoc, first: readonly DocFinding[], model = REVIEW_MODEL): Record<string, unknown> {
  return {
    model,
    max_tokens: 2500,
    system: `You review one finished report before it is emailed to an investor, as a careful reader of it would. The report is laid out below page by page, every line of it.

Name each line a reader would stop at:
- unfinished: it says something is still to come, being read, or not written yet.
- cut: the sentence stops mid-thought.
- blob: a paragraph too long to read at a glance that says several things at once.
- wrong: it contradicts another page, names the wrong company or quarter, or a figure in it cannot be what the line says (a margin over 100%, a growth of thousands of percent with no reason given).
- repeat: the same point said again on another page in near the same words.
- empty: a line that says nothing a reader can use (a label with no content, boilerplate).

For each, quote the line's words exactly as written (at least twelve characters, copied, not paraphrased), say which page, the problem in a few words, and the act: drop when the report reads whole without the line, hold when the page cannot stand without it (the page's main finding is missing or unfinished). Never ask for a figure to be added or changed; you do not write the report. Up to ${MAX_NOTES} notes, the most serious first. None when it reads whole.

The app's own check already found these, so do not repeat them: ${first.length ? first.map((f) => `[${f.page}] ${f.problem}: ${f.text.slice(0, 80)}`).join("; ") : "nothing"}.

Your whole answer is one call to record_review; write nothing outside it.`,
    tools: [
      {
        name: "record_review",
        description: "Record what a reader would stop at.",
        input_schema: {
          type: "object",
          properties: {
            notes: {
              type: "array",
              items: {
                type: "object",
                properties: { page: { type: "string" }, quote: { type: "string" }, problem: { type: "string", enum: ["unfinished", "cut", "blob", "wrong", "repeat", "empty"] }, act: { type: "string", enum: ["drop", "hold"] } },
                required: ["page", "quote", "problem", "act"],
              },
            },
          },
          required: ["notes"],
        },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${docText(doc)}\n\nReview this report.` }] }],
  };
}

/** The model's notes read item by item: a quote the report does not contain is dropped, never acted on. */
export function parseDocReview(body: unknown, doc: ReportDoc): ReviewNote[] | null {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_review");
  if (!call) return null;
  let raw = (call.input as { notes?: unknown } | undefined)?.notes;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  const all = docText(doc).toLowerCase();
  const out: ReviewNote[] = [];
  for (const n of Array.isArray(raw) ? raw : []) {
    const x = (n ?? {}) as Record<string, unknown>;
    const quote = typeof x.quote === "string" ? x.quote.trim().replace(/^["“]|["”]$/g, "") : "";
    if (quote.length < 12 || !all.includes(quote.toLowerCase())) continue;
    out.push({ page: typeof x.page === "string" ? x.page.slice(0, 60) : "", quote: quote.slice(0, 400), problem: typeof x.problem === "string" ? x.problem.slice(0, 40) : "", act: x.act === "hold" ? "hold" : "drop" });
    if (out.length >= MAX_NOTES) break;
  }
  return out;
}

/**
 * The verdict from both passes: the app's holds and the model's hold the
 * report; every drop is taken out. `late` (the deck's wait is over) sends it
 * with the held lines taken out too, so a report is never kept back for ever.
 */
export function reviewVerdict(doc: ReportDoc, notes: readonly ReviewNote[], late: boolean): DocReview {
  const first = checkDoc(doc);
  const holds = [...first.filter((f) => f.kind === "hold").map((f) => f.text), ...notes.filter((n) => n.act === "hold").map((n) => n.quote)];
  const drop = [...new Set([...notes.filter((n) => n.act === "drop" || late).map((n) => n.quote), ...(late ? holds : [])])];
  return { ready: late || holds.length === 0, notes: [...notes], drop, held: late ? [] : holds.map((h) => h.slice(0, 200)) };
}

/** The report as sent: the reviewer's drops applied. */
export function reviewedDoc(doc: ReportDoc, drop: readonly string[]): ReportDoc {
  return withoutTexts(doc, drop);
}

/** A short fingerprint of what the report says, so a report is reviewed again only when its words change. */
export function docSig(doc: ReportDoc): string {
  const s = docText(doc);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}
