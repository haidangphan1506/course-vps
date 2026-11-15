"use client";

import { active, counts, gOf, isChanged, modRank, S_LABEL, stOf, type Model } from "@/lib/api-checklist/model";
import type { Docs, Row } from "@/lib/api-checklist/types";
import { KpiRow, keyOf, Panel, repoLabel, StatusBadge } from "./bits";
import type { Checklist } from "./useChecklist";

/** Trang Tổng quan: KPI toàn bộ, thẻ từng repo, module cần xử lý và mục cần test tiếp. */
export default function OverviewView({
  model,
  c,
  rows,
  repos,
  onRepo,
  onIssue,
  onGo,
}: {
  model: Model;
  c: Checklist;
  rows: Row[];
  repos: string[];
  onRepo: (repo: string) => void;
  onIssue: (repo: string, feat: string, mod: string) => void;
  onGo: (r: Row) => void;
}) {
  const docs: Docs = c.docs;
  const total = counts(docs, rows);
  const cat = model.cat;

  // Module có Fail/Blocked, gom theo repo → feature → module.
  const modules = new Map<string, { repo: string; feat: string; mod: string; rows: Row[] }>();
  for (const r of rows) {
    const feat = gOf(r, "grp").svc;
    const key = keyOf(r.svc, feat, r.gnm);
    const m = modules.get(key) ?? { repo: r.svc, feat, mod: r.gnm, rows: [] };
    m.rows.push(r);
    modules.set(key, m);
  }
  const issues = [...modules.values()]
    .map((m) => ({ ...m, c: counts(docs, m.rows) }))
    .filter((m) => m.c.fail || m.c.blocked)
    .sort((a, b) => b.c.fail - a.c.fail || b.c.blocked - a.c.blocked || modRank(a.repo, a.mod) - modRank(b.repo, b.mod));

  const next = active(rows)
    .filter((r) => ["todo", "fail", "blocked"].includes(stOf(docs, r)))
    .sort((a, b) => {
      const rank = (r: Row) => ({ fail: 0, blocked: 1, todo: 2 })[stOf(docs, r) as "fail" | "blocked" | "todo"] + (isChanged(docs, r) ? -0.5 : 0);
      return rank(a) - rank(b);
    })
    .slice(0, 8);

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-xl font-semibold">Tổng quan</h2>
        <p className="text-sm text-zinc-500">
          Lần quét {cat.scanId} · {cat.scannedAt} · {repos.length} repo
        </p>
      </div>
      <KpiRow c={total} />

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Repo</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {repos.map((repo) => {
            const rr = rows.filter((r) => r.svc === repo);
            const cc = counts(docs, rr);
            const commit = cat.commits[repo];
            const tone = cc.fail ? "border-l-red-500" : cc.blocked ? "border-l-amber-500" : cc.total && cc.pass === cc.total - cc.skip ? "border-l-emerald-500" : "border-l-zinc-300 dark:border-l-zinc-600";
            return (
              <button
                key={repo}
                type="button"
                onClick={() => onRepo(repo)}
                className={`grid min-w-0 cursor-pointer gap-2.5 overflow-hidden rounded-2xl border border-l-4 border-black/10 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-white/10 dark:bg-zinc-900 ${tone}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <b className="text-[15px]">{repoLabel(repo)}</b>
                  <span className="truncate font-mono text-[11px] text-zinc-500">{commit ? `${cat.branches[repo] ?? ""} ${commit}`.trim() : "giao diện"}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-zinc-500">
                  <span>
                    {cc.pass}/{cc.total - cc.skip} pass
                  </span>
                  {cc.fail > 0 && <StatusBadge status="fail" label={`${cc.fail} fail`} />}
                  {cc.blocked > 0 && <StatusBadge status="blocked" label={`${cc.blocked} blocked`} />}
                  <span>· {cc.todo} chưa test</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Module cần xử lý" sub={issues.length ? `${issues.length} module đang có Fail/Blocked` : "Không có module nào đang lỗi."}>
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {issues.map((m) => (
              <li key={`${m.repo}|${m.feat}|${m.mod}`}>
                <button type="button" onClick={() => onIssue(m.repo, m.feat, m.mod)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-blue-500/[.04]">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{m.mod}</span>
                    <span className="text-xs text-zinc-500"> · {repoLabel(m.repo)}</span>
                  </span>
                  {m.c.fail > 0 && <StatusBadge status="fail" label={`${m.c.fail} fail`} />}
                  {m.c.blocked > 0 && <StatusBadge status="blocked" label={`${m.c.blocked} blocked`} />}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Cần test tiếp" sub={`${total.todo + total.fail + total.blocked} mục chưa Pass`}>
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {next.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onGo(r)} className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-blue-500/[.04]">
                  <StatusBadge status={stOf(docs, r)} label={S_LABEL[stOf(docs, r)]} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.type === "UI" ? r.title || r.path : (r.type === "HTTP" ? r.method + " " : "") + r.path}</span>
                  <span className="text-xs text-zinc-500">{repoLabel(r.svc)}</span>
                </button>
              </li>
            ))}
            {!next.length && <li className="px-4 py-3 text-sm text-zinc-500">Đã Pass hết các mục.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
