import { redirect } from "next/navigation";

/** The Dashboard is the first screen now (Hamza's ruling of 15 Oct 2026); an old link lands there. */
export default function DashboardRedirect() {
  redirect("/");
}
