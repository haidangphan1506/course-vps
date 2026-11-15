import { S_LABEL, SVC_LABEL, type ModStatus } from "@/lib/api-checklist/model";
import type { Counts, Status } from "@/lib/api-checklist/types";

/** Các mảnh hiển thị dùng chung của dashboard: badge trạng thái, tag, thanh tiến độ, thẻ chỉ số. */

export type AnyStatus = Status | ModStatus;

const STATUS_STYLE: Record<AnyStatus, string> = {
  pass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  fail: "bg-red-500/15 text-red-700 dark:text-red-400",
  blocked: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  doing: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  skip: "bg-zinc-500/10 text-zinc-500",
  todo: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

/** Viền trái theo trạng thái (dòng request, thẻ module, dòng bảng). */
export const ACCENT: Record<AnyStatus, string> = {
  pass: "border-l-emerald-500",
  fail: "border-l-red-500",
  blocked: "border-l-amber-500",
  doing: "border-l-blue-500",
  skip: "border-l-zinc-300 dark:border-l-zinc-600",
  todo: "border-l-zinc-300 dark:border-l-zinc-600",
};

export const DOT: Record<AnyStatus, string> = {
  pass: "bg-emerald-500",
  fail: "bg-red-500",
  blocked: "bg-amber-500",
  doing: "bg-blue-500",
  skip: "bg-zinc-300 dark:bg-zinc-600",
  todo: "bg-zinc-400",
};

export const METHOD_COLOR: Record<string, string> = {
  GET: "text-blue-600 dark:text-blue-400",
  POST: "text-emerald-600 dark:text-emerald-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-violet-600 dark:text-violet-400",
  DELETE: "text-red-600 dark:text-red-400",
};

export function StatusBadge({ status, label }: { status: AnyStatus; label?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{label ?? S_LABEL[status as Status] ?? status}</span>;
}

const TONE = {
  muted: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  new: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  bad: "bg-red-500/15 text-red-700 dark:text-red-400",
};
export type Tone = keyof typeof TONE;

export function Tag({ tone = "muted", title, children }: { tone?: Tone; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Thẻ chỉ số (KPI). */
export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "pass" | "fail" | "blocked" }) {
  const color = tone === "pass" ? "text-emerald-600 dark:text-emerald-400" : tone === "fail" ? "text-red-600 dark:text-red-400" : tone === "blocked" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

/** Hàng KPI chuẩn cho một tập request. */
export function KpiRow({ c }: { c: Counts }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <Kpi label="Tổng mục" value={c.total} hint={c.skip ? `${c.skip} bỏ qua` : undefined} />
      <Kpi label="Pass" value={c.pass} tone="pass" />
      <Kpi label="Fail" value={c.fail} tone={c.fail ? "fail" : undefined} />
      <Kpi label="Blocked" value={c.blocked} tone={c.blocked ? "blocked" : undefined} />
      <Kpi label="Chưa test" value={c.todo} />
    </div>
  );
}

/** Khung card có tiêu đề + phần thao tác bên phải. */
export function Panel({ title, sub, actions, children, className = "", bodyClassName = "" }: { title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {sub && <p className="text-xs text-zinc-500">{sub}</p>}
          </div>
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-black/20 p-8 text-center text-sm text-zinc-500 dark:border-white/20">{children}</div>;
}

/** Nút chính của dashboard (nút `primary` dùng chung phụ thuộc biến `--accent` chỉ có ở trang đăng nhập). */
export const primaryBtn = "cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

export const METHOD_BG: Record<string, string> = {
  GET: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  POST: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PATCH: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  DELETE: "bg-red-500/12 text-red-700 dark:text-red-300",
  RPC: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  EVENT: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300",
  WS: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
};

/** Khoá mở/đóng một module trong một repo: `repo|feature|module`. */
export const keyOf = (repo: string, feat: string, name: string) => `${repo}|${feat}|${name}`;

/** Tên hiển thị của repo (gateway, user, tutor, third, ui). */
export const repoLabel = (repo: string) => SVC_LABEL[repo] ?? repo;
