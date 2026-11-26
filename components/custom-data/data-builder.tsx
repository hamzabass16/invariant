"use client";

import { RefreshCw, X } from "lucide-react";
import { useActionState, useState } from "react";

import { addDataAction, refreshDataAction, removeDataAction, type CustomiseState } from "@/app/(app)/customise/actions";
import { ActionForm } from "@/components/app/action-form";
import { DoneMark, stamped, useDone, type Ran } from "@/components/app/done-mark";
import { DATA_FORMAT_LABEL, DATA_FORMATS, DATA_REFRESH, DATA_REFRESH_LABEL, DATA_SCREEN_LABEL, type DataFormat, type DataScreen } from "@/lib/custom-data";
import { cn } from "@/lib/utils";

const field = "block w-full rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body";
const label = "mb-1 block text-subhead";
const hint = "mt-1 block text-caption text-text-tertiary";

/**
 * Add data: what it is, how it is shown, how often it is read, where it sits,
 * and where it comes from (a public API, or the person's own Claude). The key
 * field is a password field and nothing sends a key back to the browser.
 */
export function DataBuilder({ screens, claudeReady, apiOnly = false }: { screens: DataScreen[]; claudeReady: boolean; /** The beta: a figure read by Claude is asked of the person's own Claude, so only an API is added here. */ apiOnly?: boolean }) {
  const [source, setSource] = useState<"api" | "claude">("api");
  const [format, setFormat] = useState<DataFormat>("number");
  const [keyIn, setKeyIn] = useState<"none" | "header" | "query">("none");
  const [answer, setAnswer] = useState<"json" | "csv">("json");
  return (
    <ActionForm action={addDataAction} label="Add and read it now" pendingLabel="Reading" note={source === "claude" ? "The AI searches the web; this takes up to a minute." : "Reading the API once."} className="card px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={label}>Name</span>
          <input name="name" required maxLength={60} placeholder="Copper price" className={field} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>What it is (optional)</span>
          <input name="about" maxLength={200} placeholder="LME copper, US dollars a tonne, monthly average" className={field} />
        </label>
        <label className="block">
          <span className={label}>Shown as</span>
          <select name="format" value={format} onChange={(e) => setFormat(e.target.value as DataFormat)} className={field}>
            {DATA_FORMATS.map((f) => (
              <option key={f} value={f}>
                {DATA_FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Unit (optional)</span>
          <input name="unit" maxLength={12} placeholder="%, $bn, pts" className={field} />
        </label>
        <label className="block">
          <span className={label}>Read again</span>
          <select name="refresh" defaultValue="daily" className={field}>
            {DATA_REFRESH.map((r) => (
              <option key={r} value={r}>
                {DATA_REFRESH_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>On the screen</span>
          <select name="screen" defaultValue={screens[0]} className={field}>
            {screens.map((s) => (
              <option key={s} value={s}>
                {DATA_SCREEN_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        {apiOnly ? <input type="hidden" name="source" value="api" /> : <fieldset className="sm:col-span-2">
          <legend className={label}>Where it comes from</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
            {(
              [
                ["api", "From an API", "A public web address that answers with JSON or CSV."],
                ["claude", "Fetched by the AI", "It searches the web and names each page."],
              ] as const
            ).map(([v, t, d]) => (
              <label key={v} className={cn("flex cursor-pointer items-start gap-3 rounded-[10px] px-3 py-2", source === v ? "bg-accent/15 ring-1 ring-accent" : "bg-surface-2")}>
                <input type="radio" name="source" value={v} checked={source === v} onChange={() => setSource(v)} className="mt-1 size-4 accent-[var(--accent)]" />
                <span>
                  <span className="block text-subhead">{t}</span>
                  <span className="block text-caption text-text-secondary">{d}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>}

        {source === "api" ? (
          <>
            <label className="block sm:col-span-2">
              <span className={label}>Address</span>
              <input name="url" type="url" required maxLength={500} placeholder="https://api.example.org/v1/series?id=copper" className={cn(field, "data")} />
              <span className={hint}>The whole address the API&apos;s documentation gives, starting with https://. Only public addresses are read, once per refresh, never written to.</span>
            </label>
            <label className="block">
              <span className={label}>It answers with</span>
              <select name="answer" value={answer} onChange={(e) => setAnswer(e.target.value as "json" | "csv")} className={field}>
                <option value="json">JSON</option>
                <option value="csv">CSV (a table)</option>
              </select>
            </label>
            {answer === "json" ? (
              <label className="block">
                <span className={label}>Rows are at</span>
                <input name="rows" maxLength={80} placeholder="data.observations" className={cn(field, "data")} />
                <span className={hint}>The path to the list in the answer, dots between names; empty when the answer is the list.</span>
              </label>
            ) : (
              <input type="hidden" name="rows" value="" />
            )}
            <label className="block">
              <span className={label}>{format === "line" ? "Date field" : format === "number" ? "Date field (optional)" : "Label field"}</span>
              <input name="x" maxLength={80} placeholder={format === "line" || format === "number" ? "date" : "name"} className={cn(field, "data")} />
            </label>
            <label className="block">
              <span className={label}>Number field</span>
              <input name="value" maxLength={80} placeholder="value" className={cn(field, "data")} />
              <span className={hint}>{answer === "csv" ? "Column names from the CSV's first line." : "Field names inside each row. Empty when the path above leads straight to the number."}</span>
            </label>
            <label className="block">
              <span className={label}>Key</span>
              <select name="keyIn" value={keyIn} onChange={(e) => setKeyIn(e.target.value as typeof keyIn)} className={field}>
                <option value="none">No key needed</option>
                <option value="header">Sent in a header</option>
                <option value="query">Sent in the address</option>
              </select>
            </label>
            {keyIn !== "none" ? (
              <>
                <label className="block">
                  <span className={label}>{keyIn === "header" ? "Header name" : "Parameter name"}</span>
                  <input name="keyName" maxLength={60} placeholder={keyIn === "header" ? "X-Api-Key" : "api_key"} className={cn(field, "data")} />
                </label>
                <label className="block">
                  <span className={label}>The key</span>
                  <input name="key" type="password" autoComplete="off" maxLength={400} className={cn(field, "data")} />
                  <span className={hint}>Kept in your own vault and sent only to this API. It is never shown again; remove the data to forget it.</span>
                </label>
              </>
            ) : (
              <input type="hidden" name="keyName" value="" />
            )}
          </>
        ) : (
          <label className="block sm:col-span-2">
            <span className={label}>What to fetch</span>
            <textarea name="ask" required minLength={10} maxLength={600} rows={3} placeholder="Copper's monthly average price on the LME in US dollars a tonne, the last two years." className={field} />
            <span className={hint}>
              {claudeReady
                ? "The AI searches the web each time it is read, with a few searches with the AI, and records only figures a page states, naming each page."
                : "The AI is not set up on this deployment yet."}
            </span>
          </label>
        )}
      </div>
      <div className="h-3" />
    </ActionForm>
  );
}

function Small({ action, id, title, children, danger }: { action: (p: CustomiseState, f: FormData) => Promise<CustomiseState>; id: string; title: string; children: React.ReactNode; danger?: boolean }) {
  const [state, run, pending] = useActionState<Ran<CustomiseState>, FormData>(stamped(action), { error: null });
  const done = useDone(state);
  return (
    <form action={run} className="inline-flex items-center">
      {done ? <DoneMark label="Done" className="mr-1" /> : null}
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} title={state.error ?? title} aria-label={title} className={cn("rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 disabled:opacity-40", danger ? "hover:text-danger" : "hover:text-text", pending && "animate-pulse")}>
        {children}
      </button>
      {state.error ? <span className="sr-only">{state.error}</span> : null}
    </form>
  );
}

/** Read one piece again now, or remove it (and its key). */
export function DataRowActions({ id, name, demo }: { id: string; name: string; demo: boolean }) {
  if (demo) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <Small action={refreshDataAction} id={id} title={`Read ${name} again now`}>
        <RefreshCw className="size-4" aria-hidden />
      </Small>
      <Small action={removeDataAction} id={id} title={`Remove ${name}`} danger>
        <X className="size-4" aria-hidden />
      </Small>
    </span>
  );
}
