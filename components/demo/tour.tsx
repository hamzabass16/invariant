"use client";

import { X } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import type { Step } from "@/lib/tour";

/**
 * A small card that walks a person through a tour (lib/tour.ts: the
 * showcase's, or their own app's after Welcome): each step opens its screen
 * with ?tour=N and, where it names one, outlines the part it is about.
 * Closing it drops the parameter; /try starts the showcase's again.
 */
export function Tour({ steps: TOUR }: { steps: readonly Step[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const n = Number(params.get("tour"));
  const step = Number.isInteger(n) && n >= 1 && n <= TOUR.length ? TOUR[n - 1] : null;

  useEffect(() => {
    if (!step?.target || pathname !== step.href) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;
    el.classList.add("tour-target");
    // Brought into view only when it is not already near the top, so the first step keeps the page's own header.
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.4) el.scrollIntoView({ behavior: "smooth", block: "start" });
    return () => el.classList.remove("tour-target");
  }, [step, pathname]);

  if (!step) return null;
  const go = (i: number) => router.push(`${TOUR[i - 1].href}?tour=${i}` as Route);
  const close = () => router.replace(pathname as Route);

  return (
    <aside role="dialog" aria-label="Guided tour" className="card fixed inset-x-3 bottom-[5.25rem] z-50 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[23rem]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="data text-caption text-text-tertiary">
            {n} of {TOUR.length}
          </p>
          <p className="mt-0.5 text-body font-semibold">{step.title}</p>
        </div>
        <button type="button" onClick={close} aria-label="Close the tour" className="-mr-1 -mt-1 rounded-full p-1 text-text-tertiary hover:bg-surface-2 hover:text-text">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-footnote text-text-secondary sm:text-subhead">{step.body}</p>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(n / TOUR.length) * 100}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {n > 1 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => go(n - 1)}>
            Back
          </Button>
        ) : null}
        {n < TOUR.length ? (
          <Button type="button" size="sm" onClick={() => go(n + 1)}>
            Next
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={close}>
            Finish
          </Button>
        )}
      </div>
    </aside>
  );
}
