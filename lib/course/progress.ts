import type { CourseState } from "@/store/courseSlice";
import type { Lesson } from "./types";

export const labDone = (l: Lesson, p: CourseState) => {
  const a = p.labs[l.id] ?? [];
  return l.lab.items.filter((_, i) => a[i]).length;
};
export const quizDone = (l: Lesson, p: CourseState) => {
  const q = p.quiz[l.id] ?? {};
  return l.quiz.filter((x, i) => q[i] === x.ans).length;
};
export const debugDone = (l: Lesson, p: CourseState) => l.debugs.filter((d) => p.debugs[d.id]).length;
export const total = (l: Lesson) => l.lab.items.length + l.quiz.length + l.debugs.length;
export const done = (l: Lesson, p: CourseState) => labDone(l, p) + quizDone(l, p) + debugDone(l, p);

export function shuffle(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let j = n - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
}

export function orderOf(saved: number[] | undefined, n: number) {
  return saved && saved.length === n ? saved : Array.from({ length: n }, (_, i) => i);
}

export function fmtTime(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
