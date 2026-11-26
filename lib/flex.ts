/**
 * The IBKR Flex Web Service statement, parsed. Pure: the sync and the checks
 * share it. Flex XML is flat: one element per row, every value an attribute.
 *
 * Only reads. A Flex token can return reports and nothing else; there is no
 * order, alert or account change anywhere in the Flex Web Service.
 */

type Attrs = Record<string, string>;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]);

/** Every element of the given name with its attributes, in document order. */
export function elements(xml: string, name: string): Attrs[] {
  const out: Attrs[] = [];
  const re = new RegExp(`<${name}\\b([^>]*?)/?>`, "g");
  for (const m of xml.matchAll(re)) {
    const attrs: Attrs = {};
    for (const a of m[1].matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
    out.push(attrs);
  }
  return out;
}

function text(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? decode(m[1]).trim() : null;
}

/** The SendRequest reply, or a GetStatement reply that is not a statement yet. */
export type FlexResponse =
  | { status: "success"; referenceCode: string }
  | { status: "warn" | "fail"; code: string; message: string };

export function parseFlexResponse(xml: string): FlexResponse | null {
  if (!/<FlexStatementResponse\b/.test(xml)) return null;
  const status = (text(xml, "Status") ?? "").toLowerCase();
  if (status === "success") {
    const referenceCode = text(xml, "ReferenceCode") ?? "";
    if (!/^\d+$/.test(referenceCode)) return { status: "fail", code: "0", message: "The reply had no reference code." };
    return { status: "success", referenceCode };
  }
  return {
    status: status === "warn" ? "warn" : "fail",
    code: text(xml, "ErrorCode") ?? "0",
    message: text(xml, "ErrorMessage") ?? "IBKR gave no reason.",
  };
}

/** IBKR's error codes, in sentences the operator can act on. */
export function describeFlexError(code: string, message: string): string {
  switch (code) {
    case "1003":
      return "IBKR says the Flex statement is not available yet. The next sync will try again.";
    case "1012":
    case "1014":
      return "IBKR refused the Flex token. It may have been mistyped or revoked: generate a new one under Flex Web Service Configuration and keep it again on Setup.";
    case "1013":
      return "IBKR refused this server's address for the Flex token. Leave the IP address box empty under Flex Web Service Configuration, generate the token again and keep it on Setup.";
    case "1015":
      return "The Flex token has expired. Generate a new one under Flex Web Service Configuration and keep it again on Setup.";
    case "1018":
      return "IBKR is rate-limiting Flex requests. The next sync will try again.";
    case "1019":
    case "1021":
      return "IBKR is still generating the statement. The next sync will try again.";
    case "1020":
      return "IBKR does not recognise the Flex query id. Check it against the number beside the query on the Flex Queries list, and keep it again on Setup.";
    default:
      return `IBKR returned an error (${code}: ${message}). The next sync will try again.`;
  }
}


/** Flex dates are yyyyMMdd or yyyy-MM-dd; the time part, when present, is after a semicolon or a comma. */
export function flexDate(v: string | undefined): string {
  const m = (v ?? "").match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** "20261010;183001" or "2026-10-10;18:30:01" → an ISO timestamp (IBKR's clock, US Eastern, kept as given). */
export function flexWhen(v: string): string {
  const m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})[;, T]?(\d{2}):?(\d{2}):?(\d{2})?/);
  if (!m) return flexDate(v) || new Date().toISOString();
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}`;
}
