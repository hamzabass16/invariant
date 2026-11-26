"use client";

import { Upload } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { DoneMark, useDone, type Ran } from "@/components/app/done-mark";
import { reach } from "@/components/app/reach";
import { DIRECT_UPLOAD_MAX_BYTES, UPLOAD_MAX_BYTES, uploadTooLarge } from "@/lib/reach";
import { Button } from "@/components/ui/button";

type State = Ran<{ error: string | null }>;

/** A file too large to go through the app goes from the browser straight to the person's own Drive, then the app reads it there. */
export type DirectUpload = {
  start: (file: { name: string; type: string; size: number }) => Promise<{ url: string } | { error: string }>;
  finish: (fileId: string) => Promise<{ error: string | null }>;
};

/** Sends one file to the upload its Drive opened, then asks the app to read it; a failure is a sentence. */
async function sendDirect(file: File, direct: DirectUpload): Promise<{ error: string | null }> {
  const opened = await direct.start({ name: file.name, type: file.type, size: file.size });
  if ("error" in opened) return { error: opened.error };
  let res: Response;
  try {
    res = await fetch(opened.url, { method: "PUT", body: file });
  } catch {
    return { error: "Your Google Drive could not be reached for the upload. Try again in a moment." };
  }
  if (!res.ok) return { error: "Your Google Drive did not take the upload. Try again in a moment." };
  const id = ((await res.json().catch(() => ({}))) as { id?: unknown }).id;
  if (typeof id !== "string") return { error: "Your Google Drive took the file but did not say where. Try again." };
  return direct.finish(id);
}

/**
 * One button that picks a file and sends it: no separate Choose file, no
 * "No file chosen" sitting there. While it reads, the button names the file;
 * when it is done, a check says so; an error stays beside it.
 */
export function FileAction({
  action,
  name,
  accept,
  label,
  pendingLabel = "Reading",
  doneLabel,
  doneHref,
  note,
  multiple = false,
  variant = "secondary",
  extra,
  direct,
}: {
  action: (prev: { error: string | null }, form: FormData) => Promise<{ error: string | null }>;
  name: string;
  accept: string;
  label: string;
  pendingLabel?: string;
  doneLabel?: string;
  doneHref?: string;
  /** Shown under the button while it reads. */
  note?: string;
  multiple?: boolean;
  variant?: "primary" | "secondary";
  /** Hidden fields or a choice that go with the file. */
  extra?: React.ReactNode;
  /** One file over what the app takes goes to the person's own Drive instead (`DIRECT_UPLOAD_MAX_BYTES`). */
  direct?: DirectUpload;
}) {
  const router = useRouter();
  const form = React.useRef<HTMLFormElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [tooBig, setTooBig] = React.useState<string | null>(null);
  const [state, run, pending] = useActionState<State, FormData>(async (prev, data) => {
    const file = data.get(name);
    if (direct && file instanceof File && file.size > UPLOAD_MAX_BYTES) return { ...(await reach(() => sendDirect(file, direct))), ran: Date.now() };
    return { ...(await reach(() => action(prev, data))), ran: Date.now() };
  }, { error: null });
  const done = useDone(state, 3200, doneHref ? () => router.push(doneHref as Route) : undefined);
  return (
    <form ref={form} action={run} className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
      {extra}
      <input
        ref={input}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = e.currentTarget.files;
          if (!files?.length) return;
          const big = uploadTooLarge(Array.from(files, (f) => f.size), direct && files.length === 1 ? DIRECT_UPLOAD_MAX_BYTES : UPLOAD_MAX_BYTES);
          setTooBig(big);
          if (big) {
            e.currentTarget.value = "";
            return;
          }
          setPicked(files.length === 1 ? files[0].name : `${files.length} files`);
          form.current?.requestSubmit();
        }}
      />
      <Button type="button" variant={variant} size="sm" loading={pending} onClick={() => input.current?.click()}>
        {pending ? null : <Upload className="size-4" aria-hidden />}
        {pending ? `${pendingLabel} ${picked ?? ""}`.trim() : label}
      </Button>
      {done ? <DoneMark label={doneLabel ?? `${picked ?? "File"} read`} /> : null}
      {pending && note ? <p className="w-full text-footnote text-text-secondary">{note}</p> : null}
      {tooBig ?? state.error ? <p className="w-full text-footnote text-danger">{tooBig ?? state.error}</p> : null}
    </form>
  );
}
