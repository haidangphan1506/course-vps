"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Nhãn hiển thị khi `value` không khớp option nào (ví dụ "Mọi module"). */
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  /** Class thêm cho nút chính (width, flex…). */
  className?: string;
  /** sm: gọn cho bảng; md (mặc định): như ô nhập thường. */
  size?: "sm" | "md";
  /** Vẽ nội dung tùy chỉnh (ví dụ badge) cho option và cho giá trị đang chọn. */
  renderOption?: (o: SelectOption) => React.ReactNode;
};

const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** Bước tới option kế tiếp (bỏ qua option disabled), vòng lại đầu/cuối. */
function step(options: readonly SelectOption[], from: number, dir: 1 | -1) {
  const n = options.length;
  for (let i = 1; i <= n; i++) {
    const j = (from + dir * i + n * 2) % n;
    if (!options[j].disabled) return j;
  }
  return from;
}

/**
 * Ô chọn tự vẽ thay cho `<select>` mặc định của trình duyệt.
 * Menu render qua portal (không bị cắt bởi overflow-hidden của card), hỗ trợ ↑ ↓ Enter Space Esc Tab.
 */
export default function Select({ value, onChange, options, placeholder = "", disabled, invalid, className = "", size = "md", renderOption, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const current = options.find((o) => o.value === value);
  const label = current?.label ?? placeholder;

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  const openMenu = () => {
    if (disabled) return;
    place();
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : step(options, -1, 1));
    setOpen(true);
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      } else if (e.key === "Tab") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => step(options, a, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => step(options, a, -1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose(active);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, options, value]);

  const border = invalid ? "border-red-500" : "border-black/15 dark:border-white/15";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={rest["aria-label"]}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`inline-flex cursor-pointer items-center justify-between gap-2 rounded-xl border bg-white text-left ${size === "sm" ? "min-w-28 px-2 py-1 text-xs" : "min-w-36 px-2.5 py-2 text-sm"} disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 ${border} ${ring} ${className}`}
      >
        <span className={`truncate ${current ? "" : "text-zinc-500"}`}>{current && renderOption ? renderOption(current) : label || " "}</span>
        <svg viewBox="0 0 20 20" aria-hidden className={`size-4 flex-none text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
            className="fixed z-[100] max-h-72 overflow-auto rounded-xl border border-black/10 bg-white p-1 text-sm shadow-lg dark:border-white/10 dark:bg-zinc-900"
          >
            {options.map((o, i) => {
              const selected = o.value === value;
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled || undefined}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  className={`flex items-center justify-between gap-4 whitespace-nowrap rounded-lg px-2.5 py-1.5 ${
                    o.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  } ${i === active ? "bg-blue-600/10" : ""} ${selected ? "font-semibold" : ""}`}
                >
                  <span>{renderOption ? renderOption(o) : o.label}</span>
                  {selected && (
                    <svg viewBox="0 0 20 20" aria-hidden className="size-4 flex-none text-blue-600 dark:text-blue-400">
                      <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
