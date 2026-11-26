"use client";

import { BookOpenCheck, Building2, CornerDownLeft, Search } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import * as React from "react";

import { itemsFor, NAV_GROUPS, settingsFor } from "@/components/app/nav-items";
import { paletteResults, PALETTE_MAX_QUERY, type PaletteEntry } from "@/lib/palette";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "pos-palette";

/** Opens the palette from anywhere on the page: the top bar's button, the phone's title bar. */
export function openPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const noSubscribe = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The palette's button: in the top bar with its shortcut, or a round icon in the phone's title bar. */
export function SearchButton({ compact = false }: { compact?: boolean }) {
  const mac = React.useSyncExternalStore(noSubscribe, isApple, () => true);
  if (compact)
    return (
      <button type="button" onClick={openPalette} aria-label="Search: a ticker, a screen or a rule" className="inline-flex size-9 items-center justify-center rounded-full text-text-secondary hover:text-text">
        <Search className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
      </button>
    );
  return (
    <button type="button" onClick={openPalette} aria-label="Search: a ticker, a screen or a rule" aria-keyshortcuts="Meta+K Control+K" className="top-item shrink-0">
      <Search className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="hidden xl:inline">Search</span>
      <kbd className="data hidden rounded-md border border-hairline-strong px-1.5 text-caption leading-5 text-text-tertiary xl:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

const KIND_LABEL: Record<PaletteEntry["kind"], string> = { ticker: "Companies", screen: "Screens", rule: "Rules", search: "Search" };

/**
 * The search palette (Hamza, 4 Nov 2026): ⌘K or Ctrl+K anywhere, or the
 * search button, opens it; the words typed match the person's screens, the
 * methodology's rules and the tickers they hold, watch or traded, and
 * anything else opens the Companies search. Up and down move, Enter opens,
 * Escape closes. Matched here in the browser (lib/palette.ts) and sent
 * nowhere; nothing is kept.
 */
export function Palette({ hrefs, settingsHrefs, rules, tickers }: { hrefs: string[]; settingsHrefs: string[]; rules: PaletteEntry[]; tickers: PaletteEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [at, setAt] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const list = React.useRef<HTMLUListElement>(null);
  const back = React.useRef<HTMLElement | null>(null);

  const screens = React.useMemo<PaletteEntry[]>(() => {
    const own = itemsFor(hrefs).map((n) => ({ kind: "screen" as const, key: `screen:${n.id}`, label: n.label, detail: NAV_GROUPS.find((g) => g.screens.includes(n.id))?.label ?? "Screen", href: n.href as string, words: n.short }));
    const extras = NAV_GROUPS.flatMap((g) => (g.extras ?? []).filter((x) => own.some((o) => o.key === `screen:${x.after}`)).map((x) => ({ kind: "screen" as const, key: `screen:${x.href}`, label: `${own.find((o) => o.key === `screen:${x.after}`)!.label}: ${x.label}`, detail: g.label, href: x.href as string, words: x.label })));
    const settings = settingsFor(settingsHrefs).map((s) => ({ kind: "screen" as const, key: `settings:${s.href}`, label: s.label, detail: "Settings", href: s.href as string, words: s.detail }));
    return [...own.filter((o) => o.key !== "screen:more"), ...extras, ...settings];
  }, [hrefs, settingsHrefs]);
  const results = React.useMemo(() => paletteResults(q, { screens, rules, tickers }), [q, screens, rules, tickers]);

  const close = React.useCallback(() => {
    setOpen(false);
    back.current?.focus?.();
  }, []);

  React.useEffect(() => {
    const show = () => {
      back.current = document.activeElement as HTMLElement | null;
      setQ("");
      setAt(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((was) => {
          if (was) return false;
          back.current = document.activeElement as HTMLElement | null;
          setQ("");
          setAt(0);
          return true;
        });
      }
    };
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const go = (e: PaletteEntry | undefined) => {
    if (!e) return;
    setOpen(false);
    router.push(e.href as Route);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAt((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAt((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setAt(Math.max(0, results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[at]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // Focus stays in the palette: the field is its one stop.
      e.preventDefault();
    }
  };

  if (!open) return null;
  const optionId = (i: number) => `palette-option-${i}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="presentation">
      <div className="palette-scrim absolute inset-0" onClick={close} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Search" className="palette-panel relative w-full max-w-xl overflow-hidden border border-hairline" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-hairline px-4">
          <Search className="size-4 shrink-0 text-text-tertiary" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAt(0);
            }}
            maxLength={PALETTE_MAX_QUERY}
            placeholder="A ticker, a screen or a rule"
            aria-label="A ticker, a screen or a rule"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results.length ? optionId(at) : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-tertiary"
          />
          <kbd className="data hidden rounded-md border border-hairline-strong px-1.5 text-caption leading-5 text-text-tertiary sm:inline">Esc</kbd>
        </div>
        <ul id="palette-results" ref={list} role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-1.5">
          {results.length ? (
            results.map((r, i) => {
              const head = i === 0 || results[i - 1].kind !== r.kind ? KIND_LABEL[r.kind] : null;
              const Icon = r.kind === "rule" ? BookOpenCheck : r.kind === "ticker" ? Building2 : r.kind === "search" ? Search : (itemsFor([r.href])[0]?.icon ?? CornerDownLeft);
              return (
                <React.Fragment key={r.key}>
                  {head ? <li role="presentation" className="section-header px-3 pt-2.5 pb-1 text-text-tertiary">{head}</li> : null}
                  <li
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={i === at}
                    onMouseMove={() => setAt(i)}
                    onClick={() => go(r)}
                    className={cn("flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2", i === at ? "bg-accent-subtle text-text" : "text-text-secondary")}
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", i === at ? "text-accent-text" : "text-text-tertiary")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-subhead", r.kind === "ticker" && "data font-semibold")}>{r.label}</span>
                      <span className="block truncate text-caption text-text-tertiary">{r.detail}</span>
                    </span>
                    {i === at ? <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-text-tertiary" aria-hidden /> : null}
                  </li>
                </React.Fragment>
              );
            })
          ) : (
            <li className="px-3 py-3 text-subhead text-text-tertiary">Nothing matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
