"use client";

import * as React from "react";

import { PositionsTable } from "@/components/holdings/positions-table";
import { LiveBadge, restingFresh, useMarketOpen, usePoll } from "@/components/live/live";
import { FreshBadge } from "@/components/ui/freshness";
import { closedOn, type Fresh } from "@/lib/freshness";
import { liveAnswerSchema, livePositions, LIVE_POLL_SECONDS } from "@/lib/live";
import type { Positions } from "@/lib/positions";

/**
 * The positions table at today's prices, on Holdings (Hamza, 16 Oct 2026:
 * everything that can be live is live). The page draws the table at the
 * close and hands it here with the listed symbols; while the US market is
 * open the rows a quote covers move every 30 seconds (lib/live.ts
 * livePositions) and the badge says Live; shut, the rows keep the last
 * session's closes and the badge keeps Live with "Markets have closed" and
 * the session's date beside it (Hamza, 17 Oct 2026). The demo (`live`
 * false) keeps its own badge, and nothing is kept or logged.
 */
export function LivePositionsTable({ positions, ccy, symbols, live, fresh }: { positions: Positions; ccy: string; symbols: string[]; live: boolean; fresh: Fresh | null }) {
  const body = React.useMemo(() => JSON.stringify({ symbols: [...new Set(symbols)] }), [symbols]);
  const s = usePoll("/api/live", body, liveAnswerSchema, LIVE_POLL_SECONDS, live && symbols.length > 0);
  const open = useMarketOpen();
  const resting = restingFresh(fresh, live, open);
  const now = React.useMemo(() => (s.answer && s.at ? livePositions(positions, s.answer.quotes, s.at) : null), [positions, s.answer, s.at]);
  const badge = now ? (open ? <LiveBadge at={s.at} failedAt={s.failedAt} /> : <FreshBadge compact fresh={closedOn(now.session)} />) : resting ? <FreshBadge compact fresh={resting} /> : null;
  return (
    <div data-live={now ? "today" : "close"}>
      <PositionsTable positions={now ?? positions} ccy={ccy} badge={badge} />
      {now && now.priced < positions.rows.length ? <p className="-mt-4 mb-6 px-1 text-footnote text-text-tertiary">{`${positions.rows.length - now.priced} of ${positions.rows.length} rows stay as the book has them: no usable price ${open ? "now" : "for the last session"}.`}</p> : null}
    </div>
  );
}
