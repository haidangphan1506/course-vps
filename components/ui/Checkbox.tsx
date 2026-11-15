"use client";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Nhãn hiển thị bên phải ô. Bỏ trống nếu chỉ cần ô. */
  label?: React.ReactNode;
  "aria-label"?: string;
  title?: string;
  className?: string;
};

/**
 * Ô đánh dấu tự vẽ thay cho `<input type="checkbox">` mặc định.
 * Vẫn giữ input thật (sr-only) nên bàn phím (Tab, Space) và trợ năng hoạt động như bình thường.
 */
export default function Checkbox({ checked, onChange, disabled, label, title, className = "", ...rest }: Props) {
  return (
    <label
      title={title}
      className={`relative inline-flex select-none items-center gap-1.5 text-sm ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${className}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={rest["aria-label"]}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={`grid size-4 flex-none place-items-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
          checked
            ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
            : "border-black/25 bg-white dark:border-white/25 dark:bg-zinc-900"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="size-3">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
