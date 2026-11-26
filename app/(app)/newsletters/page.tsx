import { redirect } from "next/navigation";

/** Newsletters is no screen of its own (Hamza, 19 Oct 2026): its setup is the Newsletters card on Setup, the newsletters themselves are on At the Close. */
export default function NewslettersPage() {
  redirect("/setup#newsletters");
}
