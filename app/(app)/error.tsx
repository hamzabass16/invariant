"use client";

import { PageFailed } from "@/components/app/page-failed";

/** A screen that fails keeps the app's frame and says what failed, or mends itself (components/app/page-failed.tsx). */
export default function ScreenError({ error }: { error: Error & { digest?: string } }) {
  return <PageFailed error={error} />;
}
