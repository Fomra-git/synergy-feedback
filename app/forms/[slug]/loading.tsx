export default function Loading() {
  return (
    <div className="min-h-dvh bg-teal-50/50 px-4 py-12" aria-busy="true" aria-label="Loading form">
      <div className="mx-auto max-w-2xl animate-pulse rounded-2xl bg-white p-8 shadow">
        <div className="mb-3 h-8 w-2/3 rounded bg-slate-200" />
        <div className="mb-10 h-4 w-full rounded bg-slate-100" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-7">
            <div className="mb-2 h-4 w-40 rounded bg-slate-200" />
            <div className="h-12 rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
