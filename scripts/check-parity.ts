/**
 * Parity of a methodology in recipes against a dashboard someone already
 * approved (scoring in lib/parity.ts). The target and methodology files stay
 * outside this repository when they describe a real person; only the harness
 * lives here.
 *
 *   npm run check:parity -- <target.json> <methodology.json> [book.json] [inputs,comma,separated]
 */
import { readFileSync } from "node:fs";

import { bookSchema } from "../lib/holdings";
import { methodologySchema } from "../lib/methodology";
import { parityReport, scoreParity, targetSchema } from "../lib/parity";
import { INPUT_IDS, type InputId } from "../lib/setup";
import { localDay } from "../lib/time";

const [targetPath, methodologyPath, bookPath, inputsArg] = process.argv.slice(2);
if (!targetPath || !methodologyPath) {
  console.error("usage: npm run check:parity -- <target.json> <methodology.json> [book.json] [inputs,comma,separated]");
  process.exit(2);
}
const target = targetSchema.parse(JSON.parse(readFileSync(targetPath, "utf8")));
const m = methodologySchema.parse(JSON.parse(readFileSync(methodologyPath, "utf8")));
const book = bookPath ? bookSchema.parse(JSON.parse(readFileSync(bookPath, "utf8"))) : null;
const inputs = (inputsArg ? inputsArg.split(",") : [...INPUT_IDS]).filter((i): i is InputId => (INPUT_IDS as readonly string[]).includes(i));
const parity = scoreParity(target, m, book, inputs, localDay());
console.log(parityReport(parity, `Parity of "${m.name}" against "${target.name}"${book ? " on the given book" : " (no book: expressed only)"}`));
