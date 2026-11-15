import Md from "@/components/ui/Md";

export type TaskRow = {
  /** Chỉ số gốc của câu trong bài. */
  index: number;
  text: string;
  hint?: string;
  done: boolean;
  selected: boolean;
};

type TaskListProps = {
  rows: readonly TaskRow[];
  onToggleSelect?: (index: number) => void;
  emptyText?: string;
};

export default function TaskList({ rows, onToggleSelect, emptyText }: TaskListProps) {
  if (!rows.length && emptyText) return <p className="m-0 text-sm text-zinc-500">{emptyText}</p>;
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {rows.map((t) => (
        <li
          key={t.index}
          className={`grid grid-cols-[22px_minmax(0,1fr)] gap-2.5 rounded-xl border px-3 py-2.5 ${
            t.done
              ? "border-transparent bg-emerald-500/15"
              : t.selected
                ? "border-blue-600 bg-blue-600/10"
                : "border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900"
          }`}
        >
          <button
            type="button"
            disabled={t.done || !onToggleSelect}
            onClick={() => onToggleSelect?.(t.index)}
            aria-label={t.done ? "Đã xong" : "Chọn câu này để làm"}
            title={t.done ? "Đã xong" : "Chọn câu này để làm"}
            className={`mt-0.5 grid size-5 cursor-pointer place-items-center rounded-md border-2 text-xs disabled:cursor-default ${
              t.done
                ? "border-emerald-600 bg-emerald-600 text-white"
                : t.selected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-400/50 text-transparent"
            }`}
          >
            ✓
          </button>
          <div className="min-w-0 text-sm">
            <Md text={t.text} />
            {t.hint && !t.done && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-xs text-zinc-500">Gợi ý</summary>
                <code className="mt-1 block whitespace-pre-wrap break-words rounded-md bg-[#0f1a21] px-2.5 py-2 text-[12.5px] text-[#d6e2ea]">
                  {t.hint}
                </code>
              </details>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
