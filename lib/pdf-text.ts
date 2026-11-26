import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

/**
 * A PDF's text layer, page by page joined, or null when it has none or cannot
 * be opened. Nothing leaves the process: the text goes to the person's own
 * model provider for reading and to the figure check in lib/statements.ts.
 */
export async function pdfText(bytes: Uint8Array): Promise<{ text: string | null; pages: number }> {
  try {
    // unpdf takes ownership of the buffer it is given, so it reads a copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    return { text: text.trim() ? text : null, pages: totalPages };
  } catch {
    return { text: null, pages: 0 };
  }
}
