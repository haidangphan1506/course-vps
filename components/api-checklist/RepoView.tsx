"use client";

import { counts, FEAT_KEYS, FEAT_LABEL, groupRows, SVC_LABEL } from "@/lib/api-checklist/model";
import type { Row } from "@/lib/api-checklist/types";
import { KpiRow, repoLabel, StatusBadge } from "./bits";
import RequestTable from "./RequestTable";
import type { Checklist } from "./useChecklist";

const featLabel = (feat: string) => (feat === "ui" ? "Thao tác giao diện" : FEAT_LABEL[feat] ?? SVC_LABEL[feat] ?? feat);
const anchor = (repo: string, feat: string) => `feat-${repo}-${feat}`;

/** Dashboard của một repo: KPI, thẻ feature (bấm để cuộn tới), và bảng request theo feature. */
export default function RepoView({ repo, rows, c, flash }: { repo: string; rows: Row[]; c: Checklist; flash: string | null }) {
  const { docs, model } = c;
  const cat = model?.cat;
  const tree = groupRows(rows, "grp");
  const feats = [...FEAT_KEYS, "ui"].filter((f) => tree.has(f));
  const total = counts(docs, rows);
  const sub = cat?.commits[repo] ? `${cat.branches[repo] ?? ""} · ${cat.commits[repo]}` : repo === "ui" ? "Giao diện (thao tác UI)" : undefined;
  const queue = cat?.services[repo]?.queue;

  const scrollTo = (feat: string) => document.getElementById(anchor(repo, feat))?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="grid gap-5">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">{repoLabel(repo)}</h2>
        <p className="text-sm text-zinc-500">
          {sub ?? ""}
          {queue ? ` · queue ${queue}` : ""}
          {` · ${feats.length} feature · ${new Set(rows.map((r) => r.gnm)).size} module`}
        </p>
      </div>
      <KpiRow c={total} />

      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Feature</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {feats.map((feat) => {
            const mm = tree.get(feat)!;
            const cc = counts(docs, [...mm.values()].flat());
            return (
              <button
                key={feat}
                type="button"
                onClick={() => scrollTo(feat)}
                className="grid min-w-0 cursor-pointer gap-2 overflow-hidden rounded-2xl border border-black/10 bg-white p-4 text-left transition-shadow hover:shadow-md dark:border-white/10 dark:bg-zinc-900"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <b className="truncate text-sm">{featLabel(feat)}</b>
                  <span className="flex-none text-xs tabular-nums text-zinc-500">{mm.size} module</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs tabular-nums text-zinc-500">
                  <span>
                    {cc.pass}/{cc.total - cc.skip} pass
                  </span>
                  {cc.fail > 0 && <StatusBadge status="fail" label={`${cc.fail} fail`} />}
                  {cc.blocked > 0 && <StatusBadge status="blocked" label={`${cc.blocked} blocked`} />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {feats.map((feat) => (
        <div key={feat} id={anchor(repo, feat)} className="scroll-mt-24">
          <RequestTable title={featLabel(feat)} rows={[...tree.get(feat)!.values()].flat()} c={c} flash={flash} />
        </div>
      ))}
      {!feats.length && <p className="text-sm text-zinc-500">Repo này chưa có request.</p>}
    </div>
  );
}
