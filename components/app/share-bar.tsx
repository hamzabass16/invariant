/** A share of the whole as a thin bar, with an estimated part drawn lighter. Scale is fixed per list so bars compare. */
export function ShareBar({ share, estimated = 0, scale = 1 }: { share: number; estimated?: number; scale?: number }) {
  const w = Math.min(100, (share / scale) * 100);
  const e = share > 0 ? Math.min(w, (estimated / share) * w) : 0;
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <div className="flex h-full" style={{ width: `${w}%` }}>
        <div className="h-full bg-accent" style={{ width: `${w ? ((w - e) / w) * 100 : 0}%` }} />
        <div className="h-full bg-accent opacity-40" style={{ width: `${w ? (e / w) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
