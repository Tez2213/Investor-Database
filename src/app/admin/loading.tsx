export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-14 border-b border-slate-200 bg-slate-900" />
      <div className="mx-auto max-w-[1400px] animate-fade-in space-y-5 px-6 py-6">
        <div className="h-12 w-72 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    </div>
  );
}
