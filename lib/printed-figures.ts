/**
 * The figures a model's sentence states, and whether its sources print them:
 * the check every agent's reading passes (pure; Hamza, 23 Oct 2026). A
 * figure no source prints is never shown.
 */

/** The figures a sentence states: numbers of two digits or more, a decimal, a percentage or a money amount; years and quarters are left aside. */
export function figuresIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/(?:[$€£]\s?)?\d[\d,]*(?:\.\d+)?\s?(?:%|bn|billion|million|m\b|k\b)?/gi)) {
    const raw = m[0].trim();
    const digits = raw.replace(/[^\d.]/g, "");
    if (/^(19|20)\d{2}$/.test(digits) && !/[%$€£]/.test(raw)) continue;
    if (digits.replace(".", "").length < 2 && !/[%$€£.]/.test(raw)) continue;
    out.push(digits.replace(/\.0+$/, ""));
  }
  return out;
}

/** Whether one of the texts prints the figure, commas aside, or its whole part. */
export const printedIn = (figure: string, texts: readonly string[]) => texts.some((t) => t.replace(/,/g, "").includes(figure) || t.replace(/,/g, "").includes(figure.replace(/\.\d+$/, "")));
