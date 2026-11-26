import { unstable_rethrow } from "next/navigation";

import { unreachedSentence } from "@/lib/reach";

/**
 * Runs a server action from the browser and turns a trip that failed (the
 * network not back after sleep, a deployment since the page opened, a
 * server that answered with an error page) into the sentence the action
 * would have returned, instead of throwing into the whole page (Hamza,
 * 23 Oct 2026). Next's own redirects still go through.
 */
export async function reach<T extends { error: string | null }>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (e) {
    unstable_rethrow(e);
    return { error: unreachedSentence(e) };
  }
}

/** The same for an action that answers with nothing to show: a failure is dropped, and the caller tries again later. */
export async function quietly<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    unstable_rethrow(e);
    return null;
  }
}

/** An action for `useActionState` that answers a failed trip with its sentence (`reach`) instead of throwing into the page. */
export function reached<S extends { error: string | null }, A extends unknown[]>(action: (...args: A) => Promise<S>): (...args: A) => Promise<S> {
  return async (...args: A) => (await reach(() => action(...args))) as S;
}
