"use client";

import { useState } from "react";

export type MenuItem<K extends string = string> = {
  key: K;
  label: React.ReactNode;
  /** Số thứ tự hiển thị bên trái, ví dụ "01". */
  index?: string;
  /** Thông tin phụ bên phải, ví dụ "4/5". */
  meta?: React.ReactNode;
  done?: boolean;
};

export type MenuGroup<K extends string = string> = {
  title?: string;
  /** Thông tin phụ cạnh tiêu đề nhóm. */
  meta?: React.ReactNode;
  done?: boolean;
  items: readonly MenuItem<K>[];
};

type MenuBarProps<K extends string> = {
  groups: readonly MenuGroup<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Cho phép thu gọn/mở từng nhóm (mặc định chỉ mở nhóm đang chọn). */
  collapsible?: boolean;
  label?: string;
  className?: string;
};

/** Menu dọc theo nhóm (thành thanh cuộn ngang trên màn hình nhỏ). */
export default function MenuBar<K extends string>({
  groups,
  value,
  onChange,
  collapsible = false,
  label,
  className = "",
}: MenuBarProps<K>) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <nav
      aria-label={label}
      className={`flex gap-1.5 overflow-x-auto rounded-xl border border-black/10 bg-white p-2.5 md:flex-col md:gap-0 md:overflow-visible dark:border-white/10 dark:bg-zinc-900 ${className}`}
    >
      {groups.map((g, gi) => {
        const id = g.title ?? String(gi);
        const hasCurrent = g.items.some((it) => it.key === value);
        const expanded = !collapsible || !g.title || (open[id] ?? hasCurrent);
        return (
          <div key={id} className="flex gap-1.5 md:flex-col md:gap-0.5">
            {g.title &&
              (collapsible ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen((o) => ({ ...o, [id]: !expanded }))}
                  className="mx-0 mb-0.5 mt-2 hidden w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:bg-black/[.05] md:flex dark:hover:bg-white/[.06]"
                >
                  <span aria-hidden>{expanded ? "▾" : "▸"}</span>
                  <span className="min-w-0 flex-1">{g.title}</span>
                  <span className={g.done ? "font-bold text-emerald-600 dark:text-emerald-400" : ""}>{g.meta}</span>
                </button>
              ) : (
                <h3 className="mx-2 mb-1.5 mt-3 hidden text-[11px] font-semibold uppercase tracking-wider text-zinc-500 md:block">
                  {g.title}
                </h3>
              ))}
            {expanded &&
              g.items.map((it) => {
                const on = it.key === value;
                return (
                  <button
                    key={it.key}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => onChange(it.key)}
                    className={`flex w-auto flex-none cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg border border-black/10 p-2 text-left text-sm md:w-full md:border-0 dark:border-white/10 ${
                      on ? "bg-blue-600/10 font-semibold" : "hover:bg-black/[.05] dark:hover:bg-white/[.06]"
                    }`}
                  >
                    {it.index && <span className="w-5 flex-none font-mono text-xs text-zinc-500">{it.index}</span>}
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.meta != null && (
                      <span
                        className={`hidden flex-none font-mono text-[11px] md:inline ${
                          it.done ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-zinc-500"
                        }`}
                      >
                        {it.meta}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}
