import * as React from "react";

import { inlineRuns, isFigure, parseBlocks } from "@/lib/markdown-blocks";

/**
 * The studies' Markdown on the screen, from the blocks lib/markdown-blocks.ts
 * reads (the PDF reads the same). Links are shown as text; nothing is fetched
 * or executed. The writer is told not to use headings, so a stray one is
 * simply shown bold.
 */

function inline(text: string): React.ReactNode[] {
  return inlineRuns(text).map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : r.code ? <code key={i} className="data rounded bg-surface-2 px-1 text-[0.95em]">{r.text}</code> : r.italic ? <em key={i}>{r.text}</em> : <React.Fragment key={i}>{r.text}</React.Fragment>));
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text).map((b, key) => {
    switch (b.kind) {
      case "code":
        return (
          <pre key={key} className="data mb-4 overflow-x-auto rounded-card bg-surface-2 px-3 py-2 text-footnote leading-relaxed">
            {b.text}
          </pre>
        );
      case "table":
        return (
          <div key={key} className="mb-4 overflow-x-auto">
            <table className="w-full text-subhead">
              {b.head ? (
                <thead>
                  <tr>
                    {b.head.map((c, j) => (
                      <th key={j} className="border-b border-hairline px-2 py-1.5 text-left font-medium text-text-secondary">
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, j) => (
                      <td key={j} className={`border-b border-hairline px-2 py-1.5 align-top ${j > 0 && isFigure(c) ? "data text-right" : ""}`}>
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "heading":
        return (
          <p key={key} className="mb-2 mt-4 text-body font-semibold">
            {inline(b.text)}
          </p>
        );
      case "quote":
        return (
          <blockquote key={key} className="mb-4 border-l-2 border-accent px-4 py-1 text-body text-text-secondary">
            {inline(b.text)}
          </blockquote>
        );
      case "list": {
        const Tag = b.ordered ? "ol" : "ul";
        return (
          <Tag key={key} className={`mb-4 pl-5 text-body leading-relaxed ${b.ordered ? "list-decimal" : "list-disc"}`}>
            {b.items.map((it, j) => (
              <li key={j} className="mb-1">
                {inline(it)}
              </li>
            ))}
          </Tag>
        );
      }
      default:
        return (
          <p key={key} className="mb-4 text-body leading-relaxed">
            {inline(b.text)}
          </p>
        );
    }
  });
  return <div className="max-w-[72ch]">{blocks}</div>;
}
