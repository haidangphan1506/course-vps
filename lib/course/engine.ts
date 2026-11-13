import type { Engine, Lesson, ShellOptions } from "./types";

let promise: Promise<Engine> | null = null;

/** Nạp engine (chỉ chạy ở trình duyệt, chunk riêng). Engine gắn vào globalThis.VPS / COURSE. */
export function loadEngine(): Promise<Engine> {
  promise ??= import("./engine/index.js").then(() => {
    const g = globalThis as unknown as {
      VPS: { IP: string; Shell: new (o: ShellOptions) => import("./types").Shell };
      COURSE: { lessons: Lesson[]; equiv?: Engine["equiv"] };
    };
    return {
      lessons: g.COURSE.lessons,
      ip: g.VPS.IP,
      createShell: (o) => new g.VPS.Shell(o),
      equiv: g.COURSE.equiv,
    };
  });
  return promise;
}
