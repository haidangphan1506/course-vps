"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import TaskList, { type TaskRow } from "./TaskList";

type LabProps = {
  /** Các câu theo thứ tự hiển thị. */
  rows: readonly TaskRow[];
  onToggleSelect: (index: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onReset: () => void;
  /** Đã xong các câu đã chọn, hệ thống đang chấm lại tất cả. */
  selectionFinished?: boolean;
  terminal: React.ReactNode;
};

/** Bài thực hành: danh sách câu bên trái (chọn, lọc, gợi ý), terminal bên phải. */
export default function Lab({
  rows,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onReset,
  selectionFinished,
  terminal,
}: LabProps) {
  const [onlySel, setOnlySel] = useState(false);
  const [onlyTodo, setOnlyTodo] = useState(false);

  const passed = rows.filter((r) => r.done).length;
  const picked = rows.filter((r) => r.selected && !r.done).length;
  const visible = rows.filter((r) => (!onlySel || (r.selected && !r.done)) && (!onlyTodo || !r.done));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[5fr_7fr]">
      <div className="grid min-w-0 gap-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <b className={passed === rows.length ? "text-emerald-600 dark:text-emerald-400" : undefined}>
            Đã pass {passed}/{rows.length} câu
          </b>
          <span className={`text-xs ${picked ? "font-semibold text-blue-600 dark:text-blue-400" : "text-zinc-500"}`}>
            {picked
              ? `Đang làm: ${picked} câu · chỉ chấm các câu đã chọn`
              : selectionFinished
                ? "Đã xong các câu đã chọn · đang chấm lại tất cả"
                : "Tick ô vuông để chọn câu cần làm"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="ghost" className="border border-black/10 dark:border-white/10" onClick={onSelectAll}>
            Chọn tất cả
          </Button>
          <Button variant="ghost" className="border border-black/10 dark:border-white/10" onClick={() => { onClearSelection(); setOnlySel(false); }}>
            Bỏ chọn
          </Button>
          <Button variant="ghost" className="border border-black/10 dark:border-white/10" onClick={() => setOnlySel((v) => !v)}>
            {onlySel ? "Hiện tất cả" : "Chỉ hiện câu đã chọn"}
          </Button>
          <Button variant="ghost" className="border border-black/10 dark:border-white/10" onClick={() => setOnlyTodo((v) => !v)}>
            {onlyTodo ? "Hiện tất cả câu" : `Chỉ câu chưa pass (${rows.length - passed})`}
          </Button>
          <Button variant="ghost" className="border border-black/10 dark:border-white/10" title="Xoá tiến độ các câu lab của bài này và dựng lại terminal từ đầu" onClick={onReset}>
            Làm lại thực hành
          </Button>
        </div>
        <TaskList
          rows={visible}
          onToggleSelect={onToggleSelect}
          emptyText={onlyTodo || onlySel ? "Không có câu nào khớp bộ lọc." : undefined}
        />
      </div>
      <div className="min-w-0 lg:sticky lg:top-3">{terminal}</div>
    </div>
  );
}
