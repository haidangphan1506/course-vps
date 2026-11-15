"use client";

import { appKeys, casesOf, counts, CK_LABEL, fmtD, fmtDT, isChanged, Model, needsVerify, parseChain, stepOf, stOf, tcOf } from "@/lib/api-checklist/model";
import type { Docs, Row, TestCase } from "@/lib/api-checklist/types";
import { ACCENT, METHOD_BG, StatusBadge, Tag } from "./bits";

function relatedTag(r: Row, m: Model, docs: Docs) {
  let list: Row[] = [];
  let label = "";
  if (r.svc === "gateway" && r.type === "HTTP") {
    list = parseChain(r).flatMap((h) => (h.pattern ? [m.rpc.get(`${h.svc}|${h.pattern}`)] : [])).filter((x): x is Row => !!x);
    label = "RPC";
  } else if (r.type === "RPC" || r.type === "EVENT") {
    list = [...(m.gw.get(`${r.svc}|${r.path}`) ?? [])];
    const p = r.http ? m.byId.get(r.http) : undefined;
    if (p && !list.includes(p)) list.push(p);
    label = "HTTP";
  }
  if (!list.length) return null;
  const ok = list.filter((x) => stOf(docs, x) === "pass").length;
  const bad = list.filter((x) => stOf(docs, x) === "fail").length;
  return (
    <Tag tone={bad ? "bad" : ok === list.length ? "ok" : "muted"} title={`Request liên quan (${label}) — mở dòng để xem luồng`}>
      {label} {ok}/{list.length}
      {bad ? ` · ${bad} fail` : ""}
    </Tag>
  );
}

import type { Checklist } from "./useChecklist";

const STEP_MARK = ["①", "②", "③"];

/** Một case của request: sub-row ngay dưới dòng request, có nút Pass/Fail riêng. */
function CaseRow({ r, cs, c }: { r: Row; cs: TestCase; c: Checklist }) {
  const v = tcOf(c.docs, r)[cs.id];
  const isOk = cs.id[0] === "S";
  const state = v === "pass" ? "Pass" : v === "fail" ? "Fail" : "Chưa test";
  const stateCls = v === "pass" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : v === "fail" ? "bg-red-500/15 text-red-700 dark:text-red-400" : "bg-zinc-500/10 text-zinc-500";
  const edge = v === "pass" ? "border-l-emerald-500" : v === "fail" ? "border-l-red-500" : "border-l-zinc-300 dark:border-l-zinc-600";
  return (
    <tr className="bg-zinc-500/[.025] text-xs">
      <td className={`border-l-4 border-t border-black/5 py-2 pl-6 pr-3 dark:border-white/5 ${edge}`}>
        <span className={`rounded-md px-1.5 py-0.5 font-medium ${stateCls}`}>{state}</span>
      </td>
      <td className="border-t border-black/5 px-3 py-2 font-mono text-zinc-500 dark:border-white/5">{cs.id}</td>
      <td className="border-t border-black/5 px-3 py-2 dark:border-white/5">
        <div>
          <span className={`font-medium ${isOk ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{isOk ? "Thành công" : "Lỗi"}</span>
          <span className="text-zinc-700 dark:text-zinc-300"> · {cs.t}</span>
          {cs.gen && <span className="text-zinc-500"> · mẫu</span>}
        </div>
        {cs.i && (
          <div className="text-zinc-500">
            <b className="font-semibold">Input</b> {cs.i}
          </div>
        )}
        <div className="text-zinc-500">
          <b className="font-semibold">Mong đợi</b> {cs.e}
        </div>
      </td>
      <td className="border-t border-black/5 px-3 py-2 dark:border-white/5">
        <div className="flex gap-1" role="group" aria-label={`Kết quả case ${cs.id}`}>
          {(["pass", "fail"] as const).map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={v === x}
              aria-label={`${x === "pass" ? "Pass" : "Fail"} case ${cs.id}`}
              onClick={(e) => {
                e.stopPropagation();
                c.setCase(r, cs.id, x);
              }}
              className={`grid size-7 cursor-pointer place-items-center rounded-md border text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                v === x ? (x === "pass" ? "border-emerald-600 bg-emerald-600 text-white" : "border-red-600 bg-red-600 text-white") : "border-black/15 text-zinc-600 hover:bg-black/[.05] dark:border-white/15 dark:text-zinc-300"
              }`}
            >
              {x === "pass" ? "✓" : "✗"}
            </button>
          ))}
        </div>
      </td>
      <td className="border-t border-black/5 dark:border-white/5" />
      <td className="border-t border-black/5 dark:border-white/5" />
    </tr>
  );
}

/** Một dòng request: chỉ hiển thị. Bấm dòng để mở chi tiết (đổi trạng thái, tick, case, ghi chú). */
function TableRow({ r, c, flash }: { r: Row; c: Checklist; flash: boolean }) {
  const { docs, model } = c;
  const st = stOf(docs, r);
  const doc = docs[r.id];
  const open = c.expanded.has(r.id);
  const keys = appKeys(r);
  const cases = casesOf(r);
  const t = tcOf(docs, r);
  const ok = cases.filter((x) => t[x.id] === "pass").length;
  const bad = cases.filter((x) => t[x.id] === "fail").length;
  const label = r.type === "UI" ? r.title || r.path : r.path || "—";
  const method = r.type === "WS" ? "WS" : r.type === "EVENT" ? "EVENT" : r.type === "RPC" ? "RPC" : r.method;
  const toggle = () => c.expand(r.id);

  return (
    <>
      <tr
        id={`req-${r.id}`}
        onClick={toggle}
        aria-expanded={open}
        className={`scroll-mt-32 cursor-pointer align-top transition-colors hover:bg-blue-500/[.04] ${flash ? "bg-blue-500/10" : ""} ${open ? "bg-blue-500/[.03]" : ""}`}
      >
        <td className={`border-l-4 border-t border-black/5 px-3 py-2.5 dark:border-white/5 ${ACCENT[st]}`}>
          <StatusBadge status={st} />
        </td>
        <td className="border-t border-black/5 px-3 py-2.5 text-xs dark:border-white/5">
          <div className="font-mono text-zinc-700 dark:text-zinc-300">{r.module}</div>
          <div className="text-[11px] text-zinc-500">
            {STEP_MARK[stepOf(r)] ?? ""} {r.svc === "ui" ? "UI" : r.svc}
          </div>
        </td>
        <td className="min-w-0 border-t border-black/5 px-3 py-2.5 dark:border-white/5">
          <div className="flex min-w-0 items-start gap-2">
            <span className="w-3 flex-none pt-0.5 text-xs text-zinc-400">{open ? "▾" : "▸"}</span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                {r.type !== "UI" && <span className={`inline-flex w-14 flex-none justify-center rounded-md py-0.5 font-mono text-[10px] font-bold ${METHOD_BG[method] ?? METHOD_BG.RPC}`}>{method}</span>}
                <span className={`min-w-0 break-all ${r.type === "UI" ? "text-sm font-medium" : "font-mono text-[13px]"}`}>{label}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {r.type === "UI" && r.summary && <span className="font-mono text-xs text-zinc-500">{r.summary}</span>}
                {r.isNew && <Tag tone="new">Mới</Tag>}
                {isChanged(docs, r) && <Tag tone="warn">Đã thay đổi</Tag>}
                {needsVerify(r) && <Tag tone="warn">Cần xác minh</Tag>}
                {r.dev && <Tag>dev</Tag>}
                {model && relatedTag(r, model, docs)}
              </div>
            </div>
          </div>
        </td>
        <td className="border-t border-black/5 px-3 py-2.5 text-xs dark:border-white/5">
          <div className="flex flex-wrap gap-1">
            {keys.map((k) => {
              const on = !!doc?.checks?.[k];
              return (
                <span key={k} className={`rounded-md px-1.5 py-0.5 font-medium ${on ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-zinc-500/10 text-zinc-500"}`}>
                  {on ? "✓" : "○"} {r.type === "EVENT" && k === "rpc" ? "EVENT" : CK_LABEL[k]}
                </span>
              );
            })}
          </div>
          {cases.length > 0 && (
            <div className={`mt-1 tabular-nums ${bad ? "text-red-600 dark:text-red-400" : ok === cases.length ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"}`}>
              case {ok}/{cases.length}
              {bad ? ` · ${bad} fail` : ""}
            </div>
          )}
        </td>
        <td className="border-t border-black/5 px-3 py-2.5 text-xs tabular-nums text-zinc-500 dark:border-white/5" title={doc?.testedAt ? `Test lúc ${fmtDT(doc.testedAt)}` : "Chưa test"}>
          {doc?.testedAt ? fmtD(doc.testedAt) : "—"}
        </td>
        <td className="border-t border-black/5 px-3 py-2.5 text-xs text-zinc-600 dark:border-white/5 dark:text-zinc-400">
          <span className="line-clamp-2 break-words">{doc?.note || <span className="text-zinc-400">—</span>}</span>
        </td>
      </tr>
      {open && cases.map((cs) => <CaseRow key={cs.id} r={r} cs={cs} c={c} />)}
    </>
  );
}

/** Bảng request của một feature (gồm mọi module của repo): trạng thái · module · request · kiểm tra · ngày test · ghi chú. */
export default function RequestTable({ title, rows, c, flash }: { title: string; rows: Row[]; c: Checklist; flash: string | null }) {
  const docs = c.docs;
  const sc = counts(docs, rows);
  const modules = new Set(rows.map((r) => r.gnm)).size;
  const sorted = rows
    .slice()
    .sort(
      (p, q) =>
        p.gnm.localeCompare(q.gnm) ||
        stepOf(p) - stepOf(q) ||
        String(p.path || p.title).localeCompare(String(q.path || q.title)) ||
        p.method.localeCompare(q.method),
    );

  return (
    <section className="overflow-hidden border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900">
      <header className="flex flex-wrap items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-zinc-500">
          {rows.length} request · {modules} module
        </span>
        {sc.fail > 0 && <StatusBadge status="fail" label={`${sc.fail} fail`} />}
        {sc.blocked > 0 && <StatusBadge status="blocked" label={`${sc.blocked} blocked`} />}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-500/[.06] text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <th className="w-32 px-3 py-2 font-semibold">Trạng thái</th>
              <th className="w-40 px-3 py-2 font-semibold">Module</th>
              <th className="px-3 py-2 font-semibold">Request</th>
              <th className="w-40 px-3 py-2 font-semibold">Kiểm tra</th>
              <th className="w-24 px-3 py-2 font-semibold">Test lúc</th>
              <th className="w-56 px-3 py-2 font-semibold">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <TableRow key={r.id} r={r} c={c} flash={flash === r.id} />
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="p-4 text-sm text-zinc-500">Chưa có request.</p>}
    </section>
  );
}
