/**
 * How a rule's section is cited (Hamza, 4 Nov 2026): "§3.1" for a numbered
 * section (3.1, A.2, D.1(c), 0), and the methodology's own words as they are
 * for a section it names ("Section 2 summary", "Appendix"), never a § set
 * before a word. Pure.
 */
export function sectionMark(section: string): string {
  const s = section.trim();
  return /^[A-Za-z]{3,}/.test(s) ? s : `§${s}`;
}
