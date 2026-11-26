import type * as React from "react";

import { Check, Minus, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { ClassTag } from "@/components/app/figures";
import type { CellStatus, Register, RegisterCell } from "@/lib/class-register";

const MARK: Record<CellStatus, { icon: typeof Check; tone: string; words: string }> = {
  pass: { icon: Check, tone: "text-ok", words: "passes" },
  fail: { icon: X, tone: "text-danger", words: "fails" },
  unread: { icon: Minus, tone: "text-text-tertiary", words: "no reading" },
  not_measured: { icon: Minus, tone: "text-text-tertiary", words: "not measured" },
};

function Cell({ cell }: { cell: RegisterCell | undefined }) {
  if (!cell) return <span className="text-text-tertiary">·</span>;
  const m = MARK[cell.status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center justify-end gap-1 whitespace-nowrap ${m.tone}`} title={[m.words, cell.note].filter(Boolean).join("; ")}>
      <span className={cell.status === "pass" || cell.status === "fail" ? "text-text" : ""}>{cell.value ?? (cell.status === "not_measured" ? "n/m" : "n/a")}</span>
      <Icon aria-label={m.words} className="size-3.5 shrink-0" strokeWidth={2.5} />
    </span>
  );
}

/**
 * The Classification Register: a table at 1024px and up (holdings down,
 * criteria across, the class and its count beside each holding), and one
 * folding card per holding below that. Every cell is the holding's reading
 * today and whether it passes; the line under each holding says what kept it
 * out of the classes ahead of its own.
 */
export function ClassRegister({ register, badge }: { register: Register; badge?: React.ReactNode }) {
  const { columns, rows, left } = register;
  return (
    <section className="mb-8">
      <div className="mb-2 px-4">
        <h2 className="section-header flex flex-wrap items-center gap-x-2 gap-y-1">
          Classification Register
          {badge}
        </h2>
      </div>

      {!rows.length ? (
        <div className="card px-4 py-3 text-subhead text-text-secondary">No criterion of the methodology&apos;s classes has a reading for any holding yet. Read every holding&apos;s filings on Setup, or run a study on Research.</div>
      ) : null}

      <div className={`card hidden overflow-x-auto ${rows.length ? "lg:block" : ""}`}>
        <table className="data w-full text-caption">
          <caption className="sr-only">Each holding against each criterion of the methodology&apos;s classes</caption>
          <thead>
            <tr className="text-left align-bottom text-text-tertiary">
              <th scope="col" className="sticky left-0 bg-surface px-2 py-2 font-medium">
                Holding
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Class
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Count
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="max-w-[6.5rem] px-1.5 py-2 text-right text-caption font-medium leading-snug" title={`${c.test} · read by ${c.classes.join(", ")}${c.requiredIn.length ? `; required for ${c.requiredIn.join(", ")}` : ""}`}>
                  {c.label}
                  {c.requiredIn.length ? <span className="block text-caption">gate</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="border-t border-hairline align-top">
                <th scope="row" className="sticky left-0 bg-surface px-2 py-2 text-left font-semibold">
                  <Link href={`/holdings/${encodeURIComponent(r.symbol)}` as Route} className="hover:underline">
                    {r.symbol}
                  </Link>
                  <span className="block font-normal text-text-tertiary">{r.weight.toFixed(1)}%</span>
                </th>
                <td className="px-2 py-2">
                  <ClassTag label={r.classLabel} full />
                </td>
                <td className="min-w-[10rem] max-w-[16rem] px-2 py-2 font-sans text-caption text-text-secondary">
                  {r.count}
                  {r.why.map((w) => (
                    <span key={w} className="mt-1 block text-caption text-text-tertiary">
                      {w}
                    </span>
                  ))}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="px-1.5 py-2 text-right">
                    <Cell cell={r.cells[c.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`card overflow-hidden ${rows.length ? "lg:hidden" : "hidden"}`}>
        {rows.map((r) => (
          <details key={r.symbol} className="group border-t border-hairline first:border-t-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
              <span className="data font-semibold">{r.symbol}</span>
              <ClassTag label={r.classLabel} full />
              <span className="data ml-auto text-caption text-text-secondary">
                {r.passes}/{r.measurable}
                {r.needed ? ` · ${r.needed} needed` : ""}
              </span>
            </summary>
            <div className="px-4 pb-3">
              <p className="mb-2 text-footnote text-text-secondary">{r.count}</p>
              <ul className="space-y-1.5">
                {columns.map((c) =>
                  r.cells[c.key] ? (
                    <li key={c.key} className="flex items-start justify-between gap-3 text-footnote">
                      <span className="min-w-0 text-text-secondary">
                        {c.label}
                        {c.requiredIn.length ? ` (gate for ${c.requiredIn.join(", ")})` : ""}
                      </span>
                      <span className="data shrink-0">
                        <Cell cell={r.cells[c.key]} />
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
              {r.why.length ? (
                <ul className="mt-2 space-y-1 text-caption text-text-tertiary">
                  {r.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        ))}
      </div>

      <p className="mt-2 px-4 text-footnote text-text-tertiary">
        {left.length ? `Left out, as no criterion reads them: ${left.join(", ")}. ` : ""}The methodology&apos;s Classification Test on each holding&apos;s figures today: a holding takes the first class whose required filters hold and whose criteria pass in the number it needs. A gate is a filter the class requires before it counts. A criterion with no reading (n/a) does not pass; one whose condition fails is not measured (n/m) and leaves the count. Nothing here is filed; it changes when the figures or the methodology do. Hover a heading for the whole test.
      </p>
    </section>
  );
}
