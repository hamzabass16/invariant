"use client";

import { PageFailed } from "@/components/app/page-failed";

import "./globals.css";

/** A failure above every screen (the frame itself) gets the same words as a screen's own (components/app/page-failed.tsx), never Next's page. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en" data-theme="system">
      <body>
        <PageFailed error={error} />
      </body>
    </html>
  );
}
