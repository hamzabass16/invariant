/**
 * What a screen shows while it reads the person's files: the frame stays, and
 * the page's shape appears in place of a blank wait. It fades in only after a
 * moment, so a screen that answers at once never flashes it. Nothing loops.
 */
export default function Loading() {
  return (
    <main aria-busy="true" className="loading-frame mx-auto w-full max-w-2xl px-4 pb-10 pt-14 lg:max-w-content lg:px-8 lg:pt-10">
      <div className="mb-8 h-9 w-48 rounded-lg bg-surface-2" />
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-20" />
        ))}
      </div>
      <div className="card mb-8 h-56" />
      <div className="card h-32" />
      <p className="mt-6 px-4 text-footnote text-text-tertiary" role="status">
        Reading your files.
      </p>
    </main>
  );
}
