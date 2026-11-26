/**
 * What a connection string must look like before anything reads it, and the
 * one thing ever printed about one: its host.
 *
 * Neon's Reset password dialog shows only the new password. Pasted into
 * DATABASE_URL on its own, it reached the neon driver, whose error quoted the
 * whole value into the build log. Nothing here, or downstream of here, repeats
 * the value: the message says what a connection string looks like and where to
 * copy it from. Pure, so the client, the scripts and `check:connection` share
 * one rule.
 */

const SCHEMES = new Set(["postgresql:", "postgres:"]);

function parse(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (!SCHEMES.has(parsed.protocol)) return null;
    /*
     * As the neon driver parses it, step for step, so anything it would refuse
     * is refused here, where the value is not quoted: the host under the strict
     * rules of a special scheme (a "%" or a non-breaking space from a copy out
     * of a PDF fails here), and the percent-decoding of user, password and
     * database. check:connection holds this against the driver itself.
     */
    const strict = new URL(`http:${value.slice(parsed.protocol.length)}`);
    decodeURIComponent(strict.username);
    decodeURIComponent(strict.password);
    decodeURIComponent(strict.pathname);
    return strict.hostname && strict.username && strict.pathname.length > 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Null when `value` is a connection string; otherwise the sentence to fail with, which never contains the value. */
export function connectionProblem(value: string | undefined, name = "DATABASE_URL"): string | null {
  if (!value) return `${name} is not set.`;
  if (parse(value)) return null;
  return `${name} isn't a valid connection string. It should start with postgresql://. Copy it from Neon → Connect, not from Reset password.`;
}

/** The host alone, or a placeholder: never the user, the password or anything else in the string. */
export function connectionHost(value: string | undefined): string {
  if (!value) return "(not set)";
  return parse(value)?.host ?? "(not a valid connection string)";
}
