/** Where to go after signing in: only back to the page that connects a person's own Claude; anywhere else is home. Pure. */
export function nextOf(next: string | undefined | null): string {
  return next && next.startsWith("/mcp/authorize?") && !next.includes("//") && !next.includes("\\") ? next : "/";
}

/** The sign-in page's one-line reading of an error Auth.js sends back in the URL. */
export function signInErrorWords(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "AccessDenied") return "This account is not on the access list, and sign-ups are closed.";
  if (error === "CredentialsSignin") return "That email and password do not match.";
  return "Sign-in failed. Try again.";
}
