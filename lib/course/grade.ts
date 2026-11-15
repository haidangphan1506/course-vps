import type { Engine, Lesson, Shell } from "./types";

/** Chấm các câu lab chưa đạt. Trả về chỉ số các câu vừa đạt và cờ "đã xong các câu đã chọn". */
export function gradeLab(
  engine: Engine,
  lesson: Lesson,
  sh: Shell,
  passed: readonly boolean[],
  sel: Readonly<Record<number, boolean>>,
) {
  const hasSel = Object.keys(sel).length > 0;
  const budget = { t0: Date.now(), ms: 1500 };
  const newly: number[] = [];
  lesson.lab.items.forEach((it, i) => {
    if (passed[i] || (hasSel && !sel[i])) return;
    let ok = false;
    try {
      ok = it.check(sh);
    } catch {}
    if (!ok && engine.equiv) {
      try {
        ok = engine.equiv(lesson, sh, it, budget);
      } catch {}
    }
    if (ok) newly.push(i);
  });
  const selDone =
    hasSel && lesson.lab.items.every((_, i) => !sel[i] || passed[i] || newly.includes(i));
  return { newly, selDone };
}
