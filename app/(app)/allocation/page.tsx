import { redirect } from "next/navigation";

/** Allocation is part of Holdings now; an old link lands on its section there. */
export default function AllocationPage() {
  redirect("/holdings#allocation");
}
