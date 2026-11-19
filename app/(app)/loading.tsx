export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-xl bg-white/10" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl border border-white/8 bg-white/[0.04]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-white/[0.05]" />
          ))}
        </div>
        <div className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/[0.05]" />
          ))}
        </div>
      </div>
    </div>
  );
}
