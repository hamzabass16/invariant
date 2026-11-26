/** Says plainly that a screen shows fictional sample data until the person's own sync is connected, or the showcase's dated snapshot. */
export function SampleNote({ sample, asOf, showcase = false }: { sample: boolean; asOf: string; showcase?: boolean }) {
  if (!sample) return <p className="mb-6 text-footnote text-text-secondary">As of {asOf}.</p>;
  if (showcase)
    return (
      <p className="mb-6 rounded-card bg-surface-2 px-4 py-3 text-footnote text-text-secondary">
        An anonymized snapshot of a real portfolio, dated {asOf}. It does not update; nothing here is saved or sent.
      </p>
    );
  return (
    <p className="mb-6 rounded-card bg-surface-2 px-4 py-3 text-footnote text-text-secondary">
      Fictional sample data, dated {asOf}. Real figures appear once the account is connected.
    </p>
  );
}
