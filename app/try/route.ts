import { NextResponse } from "next/server";

import { storageMode } from "@/lib/storage";
import { startShowcase } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * "Try the demo": opens the showcase, an anonymized snapshot of a real
 * portfolio, on Today with the guided tour's first step. Demo mode only; a
 * signed-in deployment goes to its own Today.
 */
export async function GET(request: Request) {
  const url = new URL("/", request.url);
  if (storageMode() !== "demo") return NextResponse.redirect(url);
  await startShowcase();
  url.searchParams.set("tour", "1");
  return NextResponse.redirect(url);
}
