"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { scopedFor, type Model } from "@/lib/api-checklist/model";
import type { Filters, Row } from "@/lib/api-checklist/types";
import { repoLabel } from "./bits";
import ExportDialog from "./ExportDialog";
import OverviewView from "./OverviewView";
import RepoView from "./RepoView";
import Sidebar from "./Sidebar";
import { useChecklist, type Checklist } from "./useChecklist";

/** Phạm vi cố định: ẩn route dev/health và WS của service (không còn bộ lọc). */
const SCOPE = { dev: false, extra: false };
const EXPORT_FILTERS: Filters = { part: "api", view: "grp", svc: "", mod: "", type: "", status: "", q: "", dev: false, extra: false, mstat: "" };

function Dashboard({ c, model }: { c: Checklist; model: Model }) {
  const { docs } = c;
  // Request đã gỡ khỏi mã nguồn không hiển thị (không còn trạng thái "đã gỡ").
  const rows = useMemo(() => [...scopedFor(model, "api", SCOPE), ...scopedFor(model, "ui", SCOPE)].filter((r) => !r.removed), [model]);
  const repos = useMemo(() => model.cat.order.filter((s) => rows.some((r) => r.svc === s)), [model, rows]);

  const [sel, setSel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  /** Mở repo chứa request, mở dòng chi tiết và cuộn tới dòng. */
  const onGo = useCallback(
    (r: Row) => {
      setSel(r.svc);
      c.expand(r.id, true);
      setFlash(r.id);
    },
    [c],
  );

  // Đổi repo hoặc về Tổng quan thì cuộn về đầu trang.
  useEffect(() => {
    document.getElementById("dash-main")?.scrollTo({ top: 0 });
  }, [sel]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => document.getElementById(`req-${flash}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
    const u = setTimeout(() => setFlash(null), 1800);
    return () => {
      clearTimeout(t);
      clearTimeout(u);
    };
  }, [flash]);

  /** Từ Tổng quan: mở repo và cuộn tới feature chứa module lỗi. */
  const onIssue = (repo: string, feat: string) => {
    setSel(repo);
    setTimeout(() => document.getElementById(`feat-${repo}-${feat}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
  };

  const repoRows = sel ? rows.filter((r) => r.svc === sel) : [];
  return (
    <div className="lg:grid lg:h-full lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="border-b border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900 lg:h-full lg:overflow-y-auto lg:overflow-x-hidden lg:border-b-0 lg:border-r">
        <Sidebar model={model} docs={docs} rows={rows} repos={repos} sel={sel} onSelect={setSel} local={c.mode === "local"} />
      </aside>

      <main id="dash-main" aria-live="polite" className="min-w-0 lg:h-full lg:overflow-y-auto lg:overflow-x-hidden">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-black/10 bg-[#e9edf6]/90 px-6 py-3 backdrop-blur dark:border-white/10 dark:bg-[#11141b]/90">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            {sel ? (
              <>
                <button type="button" onClick={() => setSel(null)} className="cursor-pointer text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400">
                  Tổng quan
                </button>
                <span className="text-zinc-400">/</span>
                <span className="font-semibold">{repoLabel(sel)}</span>
              </>
            ) : (
              <span className="font-semibold">Tổng quan</span>
            )}
          </nav>
          <div className="ml-auto">
            <Button variant="ghost" type="button" className="border border-black/15 bg-white dark:border-white/15 dark:bg-zinc-900" onClick={() => setExporting(true)}>
              Xuất danh sách Fail
            </Button>
          </div>
        </header>

        <div className="grid gap-5 px-6 py-5">
          {c.notice && (
            <div role="status" className="flex items-start gap-3 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
              <span className="flex-1">{c.notice}</span>
              <button type="button" aria-label="Ẩn thông báo" onClick={() => c.setNotice("")} className="cursor-pointer">
                ✕
              </button>
            </div>
          )}
          {sel === null ? (
            <OverviewView model={model} c={c} rows={rows} repos={repos} onRepo={setSel} onIssue={onIssue} onGo={onGo} />
          ) : (
            <RepoView repo={sel} rows={repoRows} c={c} flash={flash} />
          )}
        </div>
      </main>

      {exporting && <ExportDialog model={model} docs={docs} f={{ ...EXPORT_FILTERS, part: sel === "ui" ? "ui" : "api" }} onClose={() => setExporting(false)} />}
    </div>
  );
}

/** Tab "API Route Checklist": dashboard theo dõi kiểm thử từng repo → feature → request (dạng bảng). */
export default function ApiChecklist() {
  const c = useChecklist();
  if (!c.model) return <p className="p-5 text-sm text-zinc-500">Đang tải danh mục route…</p>;
  return <Dashboard c={c} model={c.model} />;
}
