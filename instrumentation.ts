/** Once per server process: the person's zone is read from the request or the run (lib/zone.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("@/lib/zone");
}
