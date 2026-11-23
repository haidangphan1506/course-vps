"use client";

import { useEffect } from "react";
import { syncProgress } from "@/app/progress/actions";
import type { Lesson } from "./types";
import { useAppSelector } from "@/store/hooks";

/** Đồng bộ kết quả qua server action → gateway → DB (theo user đăng nhập), gom thay đổi bằng debounce. */
export function useProgressSync(lessons: readonly Lesson[]) {
  const { labs, quiz, debugs, hist, wrong, flag } = useAppSelector((s) => s.course);
  useEffect(() => {
    const debugModule: Record<string, string> = {};
    for (const l of lessons) for (const d of l.debugs) debugModule[d.id] = l.id;
    const t = setTimeout(() => {
      syncProgress({ labs, quiz, debugs, hist, wrong, flag, debugModule }).then((r) => {
        if (!r.ok) console.warn("Không đồng bộ được tiến độ:", r.message);
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [lessons, labs, quiz, debugs, hist, wrong, flag]);
}
