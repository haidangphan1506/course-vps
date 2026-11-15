"use client";

import { counts, modStatus, type Model } from "@/lib/api-checklist/model";
import type { Docs, Row } from "@/lib/api-checklist/types";
import { DOT, repoLabel } from "./bits";

function NavItem({ label, sub, rows, docs, active, onClick }: { label: string; sub?: string; rows: Row[]; docs: Docs; active: boolean; onClick: () => void }) {
  const c = counts(docs, rows);
  const [st] = modStatus(docs, rows);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex w-full min-w-0 cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-left transition-colors ${
        active ? "bg-blue-600/10 ring-1 ring-blue-500/30" : "hover:bg-black/[.05] dark:hover:bg-white/[.06]"
      }`}
    >
      <span className={`size-2 flex-none rounded-full ${DOT[st]}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${active ? "font-semibold text-blue-700 dark:text-blue-300" : "font-medium"}`}>{label}</span>
        {sub && <span className="block truncate font-mono text-[11px] text-zinc-500">{sub}</span>}
      </span>
      {c.fail > 0 && <span className="rounded-full bg-red-500/15 px-1.5 text-xs font-semibold text-red-700 dark:text-red-400">{c.fail}</span>}
      {c.blocked > 0 && <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">{c.blocked}</span>}
      <span className="flex-none text-xs tabular-nums text-zinc-500">
        {c.pass}/{c.total - c.skip}
      </span>
    </button>
  );
}

/** Sidebar: Tổng quan và một mục cho mỗi repo (gateway, user, tutor, third, ui). */
export default function Sidebar({
  model,
  docs,
  rows,
  repos,
  sel,
  onSelect,
  local,
}: {
  model: Model;
  docs: Docs;
  rows: Row[];
  repos: string[];
  sel: string | null;
  onSelect: (repo: string | null) => void;
  local: boolean;
}) {
  const cat = model.cat;
  return (
    <div className="grid gap-5 p-4">
      <div className="flex items-center gap-3 px-1">
        <div className="grid size-9 flex-none place-items-center rounded-xl bg-blue-600 text-sm font-bold text-white">API</div>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold">Route Checklist</h1>
          <p className="truncate text-xs text-zinc-500">
            Lần quét {cat.scanId} · {cat.scannedAt}
          </p>
        </div>
      </div>

      <nav aria-label="Repo" className="grid gap-1">
        <NavItem label="Tổng quan" rows={rows} docs={docs} active={sel === null} onClick={() => onSelect(null)} />
        <p className="mt-3 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Repo</p>
        {repos.map((repo) => {
          const sub = cat.commits[repo] ? `${cat.branches[repo] ?? ""} · ${cat.commits[repo]}`.replace(/^ · /, "") : repo === "ui" ? "Giao diện" : undefined;
          return <NavItem key={repo} label={repoLabel(repo)} sub={sub} rows={rows.filter((r) => r.svc === repo)} docs={docs} active={sel === repo} onClick={() => onSelect(repo)} />;
        })}
      </nav>

      {local && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">Đang lưu cục bộ trên trình duyệt này.</p>}
    </div>
  );
}
