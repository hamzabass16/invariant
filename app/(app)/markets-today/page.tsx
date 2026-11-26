import type { Route } from "next";
import { redirect } from "next/navigation";

/** The session's story moved onto At the Close, under Notifications (Hamza, 18 Oct 2026); an old link lands there. */
export default function MarketsTodayPage() {
  redirect("/after-close" as Route);
}
