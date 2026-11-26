import * as React from "react";

import { cn } from "@/lib/utils";

/** Standard page body: phone measure, widening to the desktop ceiling. */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "reveal-stack mx-auto w-full max-w-2xl px-4 pb-10 lg:max-w-content lg:px-8",
        className,
      )}
    >
      {children}
    </main>
  );
}
