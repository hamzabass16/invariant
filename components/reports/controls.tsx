"use client";

import { ActionForm } from "@/components/app/action-form";
import { CADENCE_LABEL, CADENCES, DAYS, type Schedule } from "@/lib/report";
import { zonePlace } from "@/lib/time";

import { scheduleAction } from "@/app/(app)/reports/actions";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/** The schedule form: day, hour and cadence on the person's own clock (the zone the browser reports), and the news and commentary toggle when a key is on file. */
export function ScheduleForm({ current, hasKey, zone }: { current: Schedule; hasKey: boolean; zone: string }) {
  return (
    <ActionForm action={scheduleAction} label="Keep this schedule" variant="primary" className="card px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-subhead">
          Day
          <select name="day" defaultValue={current.day} className={field}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-subhead">
          Hour
          <select name="hour" defaultValue={current.hour} className={field}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-subhead">
        Reviews
        <select name="cadence" defaultValue={current.cadence} className={field}>
          {CADENCES.map((c) => (
            <option key={c} value={c}>
              {CADENCE_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-footnote text-text-secondary">On your own clock, {zonePlace(zone)} time, as your device reports it.</p>
      <label className="mt-3 mb-4 flex items-center gap-2 text-subhead">
        <input type="checkbox" name="prose" defaultChecked={current.prose && hasKey} disabled={!hasKey} className="size-4 accent-[var(--accent)]" />
        <span>
          Add the news and a short commentary, with the AI
          {hasKey ? "" : " (the AI is not set up here yet)"}
        </span>
      </label>
    </ActionForm>
  );
}
