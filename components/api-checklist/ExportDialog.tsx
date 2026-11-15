"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import { primaryBtn } from "./bits";
import { buildExport, failList, fmtD, type Model } from "@/lib/api-checklist/model";
import type { Docs, Filters } from "@/lib/api-checklist/types";

/** Hộp thoại xuất danh sách Fail (kèm case lỗi) ra Markdown/CSV: sao chép hoặc tải về. */
export default function ExportDialog({ model, docs, f, onClose }: { model: Model; docs: Docs; f: Filters; onClose: () => void }) {
  const [fmt, setFmt] = useState<"md" | "csv">("md");
  const [msg, setMsg] = useState("");
  const list = failList(model, docs, f);
  const text = buildExport(list, fmt, (d) => (d.testerId ? "Đã test" : ""));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Đã sao chép.");
    } catch {
      setMsg("Không sao chép được, hãy chọn và copy thủ công.");
    }
  };
  const download = () => {
    const stamp = fmtD(new Date().toISOString()).split("/").reverse().join("");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: fmt === "csv" ? "text/csv;charset=utf-8" : "text/markdown;charset=utf-8" }));
    a.download = `danh-sach-fail-${stamp}.${fmt}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("Đã tải về.");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Xuất danh sách Fail" className="grid w-full max-w-3xl gap-3 rounded-2xl border border-black/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-base font-semibold">Xuất danh sách Fail</h2>
            <p className="text-xs text-zinc-500">{list.length} mục đang Fail trong phần kiểm thử hiện tại.</p>
          </div>
          <Button type="button" variant="ghost" className="ml-auto" onClick={onClose} aria-label="Đóng">
            ✕
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            variant="pill"
            label="Định dạng"
            value={fmt}
            onChange={setFmt}
            items={[
              { key: "md", label: "Markdown" },
              { key: "csv", label: "CSV" },
            ]}
          />
          <span className="text-sm text-zinc-500">{msg}</span>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" onClick={copy}>
              Sao chép
            </Button>
            <button type="button" className={primaryBtn} onClick={download}>
              Tải về
            </button>
          </div>
        </div>
        <textarea readOnly value={text} aria-label="Nội dung xuất" className="h-80 w-full rounded-xl border border-black/15 bg-transparent p-3 font-mono text-sm dark:border-white/15" />
      </div>
    </div>
  );
}
