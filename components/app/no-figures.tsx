import { Inbox } from "lucide-react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** A screen whose inputs have sent nothing yet. Never an empty portfolio: it says what it is waiting for. */
export function NoFigures({ what }: { what: string }) {
  return (
    <EmptyState
      icon={Inbox}
      title="No figures yet"
      instruction={`${what} appear here once the inputs that bring them are connected.`}
      action={
        <Link href="/setup" className={buttonStyles({ variant: "secondary" })}>
          See what to connect
        </Link>
      }
    />
  );
}
