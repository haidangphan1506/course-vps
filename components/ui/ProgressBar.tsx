export default function ProgressBar({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`h-1.5 overflow-hidden rounded bg-zinc-500/20 ${className}`}
    >
      <i className="block h-full bg-blue-600 transition-[width] dark:bg-blue-400" style={{ width: `${pct}%` }} />
    </div>
  );
}
