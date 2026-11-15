"use client";

export type TabItem<K extends string = string> = {
  key: K;
  label: React.ReactNode;
  /** Số/nhãn nhỏ cạnh tiêu đề, ví dụ "3/5". */
  badge?: React.ReactNode;
  /** Badge xanh khi hoàn thành. */
  done?: boolean;
};

type TabsProps<K extends string> = {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** underline: gạch chân (trong bài học). pill: nút bo tròn (thanh trên cùng). */
  variant?: "underline" | "pill";
  label?: string;
  className?: string;
};

export default function Tabs<K extends string>({
  items,
  value,
  onChange,
  variant = "underline",
  label,
  className = "",
}: TabsProps<K>) {
  const wrap =
    variant === "pill"
      ? "gap-0.5 rounded-xl bg-black/[.08] p-[3px] dark:bg-white/[.08]"
      : "gap-1 border-b border-black/10 dark:border-white/10";

  return (
    <div role="tablist" aria-label={label} className={`flex max-w-full overflow-x-auto ${wrap} ${className}`}>
      {items.map((t) => {
        const on = t.key === value;
        const style =
          variant === "pill"
            ? `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-white font-semibold shadow dark:bg-white/15" : "font-medium"}`
            : `-mb-px border-b-2 px-3.5 py-2.5 ${
                on
                  ? "border-blue-600 font-semibold dark:border-blue-400"
                  : "border-transparent font-medium text-zinc-500"
              }`;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`flex cursor-pointer items-center gap-2 whitespace-nowrap outline-offset-1 focus-visible:outline-2 focus-visible:outline-blue-600 ${style}`}
          >
            {t.label}
            {t.badge != null && (
              <span
                className={`rounded-full px-1.5 font-mono text-[11px] ${
                  t.done ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-zinc-500/15 text-zinc-500"
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
