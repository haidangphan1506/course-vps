const kinds = {
  full: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  part: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  none: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400",
};

export default function Pill({ kind, children }: { kind: keyof typeof kinds; children: React.ReactNode }) {
  return <span className={`ml-1 inline-block rounded-full px-2 text-xs font-semibold ${kinds[kind]}`}>{children}</span>;
}
