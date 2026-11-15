import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CourseTab } from "@/lib/course/types";

export type Hist = { l: string; s: number; n: number; t: number };

export type Progress = {
  labs: Record<string, boolean[]>;
  quiz: Record<string, Record<number, number>>;
  debugs: Record<string, boolean>;
  hist: Hist[];
  wrong: Record<string, Record<number, number>>;
  flag: Record<string, Record<number, boolean>>;
  qord: Record<string, number[]>;
  labOrd: Record<string, number[]>;
  labSel: Record<string, Record<number, boolean>>;
};

export type CourseState = Progress & { cur: string | null; tab: CourseTab };

const emptyProgress = (): Progress => ({
  labs: {},
  quiz: {},
  debugs: {},
  hist: [],
  wrong: {},
  flag: {},
  qord: {},
  labOrd: {},
  labSel: {},
});

const initialState: CourseState = { ...emptyProgress(), cur: null, tab: "theory" };

/** Gộp hai bản tiến độ, không làm mất dữ liệu (dùng khi khôi phục sao lưu / nhập dữ liệu cũ). */
export function mergeProgress(a: Partial<Progress>, b: Partial<Progress> | null | undefined): Progress {
  const o = emptyProgress();
  const seen = new Set<string>();
  for (const src of [a, b]) {
    if (!src) continue;
    for (const [k, arr] of Object.entries(src.labs ?? {})) {
      const cur = o.labs[k] ?? [];
      (arr ?? []).forEach((v, i) => (cur[i] = cur[i] || !!v));
      o.labs[k] = cur;
    }
    for (const [k, m] of Object.entries(src.quiz ?? {})) {
      o.quiz[k] ??= {};
      for (const [q, v] of Object.entries(m)) if (o.quiz[k][+q] == null) o.quiz[k][+q] = v;
    }
    for (const [k, v] of Object.entries(src.debugs ?? {})) if (v) o.debugs[k] = true;
    for (const [k, m] of Object.entries(src.wrong ?? {})) {
      o.wrong[k] ??= {};
      for (const [q, v] of Object.entries(m)) o.wrong[k][+q] = Math.max(o.wrong[k][+q] ?? 0, v ?? 0);
    }
    for (const [k, m] of Object.entries(src.flag ?? {})) {
      o.flag[k] ??= {};
      for (const [q, v] of Object.entries(m)) if (v) o.flag[k][+q] = true;
    }
    for (const x of src.hist ?? []) {
      const key = `${x?.l}:${x?.t}`;
      if (x && x.l && !seen.has(key)) {
        seen.add(key);
        o.hist.push(x);
      }
    }
    Object.assign(o.qord, src.qord ?? {});
    Object.assign(o.labOrd, src.labOrd ?? {});
  }
  o.hist.sort((x, y) => x.t - y.t);
  if (o.hist.length > 300) o.hist = o.hist.slice(-300);
  return o;
}

const slice = createSlice({
  name: "course",
  initialState,
  reducers: {
    navigate: (s, a: PayloadAction<{ cur?: string | null; tab?: CourseTab }>) => {
      if (a.payload.cur !== undefined) s.cur = a.payload.cur;
      if (a.payload.tab) s.tab = a.payload.tab;
    },
    answerQuiz: (s, a: PayloadAction<{ lid: string; qi: number; oi: number; key: number[]; t: number }>) => {
      const { lid, qi, oi, key, t } = a.payload;
      const ans = (s.quiz[lid] ??= {});
      if (ans[qi] != null) return;
      ans[qi] = oi;
      if (oi !== key[qi]) {
        const w = (s.wrong[lid] ??= {});
        w[qi] = (w[qi] ?? 0) + 1;
        (s.flag[lid] ??= {})[qi] = true;
      }
      if (key.every((_, j) => ans[j] != null)) {
        s.hist.push({ l: lid, s: key.filter((k, j) => ans[j] === k).length, n: key.length, t });
        if (s.hist.length > 300) s.hist = s.hist.slice(-300);
      }
    },
    resetQuiz: (s, a: PayloadAction<{ lid: string; order: number[] }>) => {
      s.quiz[a.payload.lid] = {};
      s.qord[a.payload.lid] = a.payload.order;
    },
    retryWrong: (s, a: PayloadAction<{ lid: string; key: number[] }>) => {
      const ans = s.quiz[a.payload.lid];
      if (!ans) return;
      a.payload.key.forEach((k, qi) => {
        if (ans[qi] != null && ans[qi] !== k) delete ans[qi];
      });
    },
    toggleFlag: (s, a: PayloadAction<{ lid: string; qi: number }>) => {
      const f = (s.flag[a.payload.lid] ??= {});
      if (f[a.payload.qi]) delete f[a.payload.qi];
      else f[a.payload.qi] = true;
    },
    labPassed: (s, a: PayloadAction<{ lid: string; indices: number[]; clearSel: boolean }>) => {
      const arr = (s.labs[a.payload.lid] ??= []);
      for (const i of a.payload.indices) arr[i] = true;
      if (a.payload.clearSel) s.labSel[a.payload.lid] = {};
    },
    toggleLabSel: (s, a: PayloadAction<{ lid: string; i: number }>) => {
      const sel = (s.labSel[a.payload.lid] ??= {});
      if (sel[a.payload.i]) delete sel[a.payload.i];
      else sel[a.payload.i] = true;
    },
    setLabSel: (s, a: PayloadAction<{ lid: string; sel: Record<number, boolean> }>) => {
      s.labSel[a.payload.lid] = a.payload.sel;
    },
    resetLab: (s, a: PayloadAction<{ lid: string; order: number[] }>) => {
      s.labs[a.payload.lid] = [];
      s.labSel[a.payload.lid] = {};
      s.labOrd[a.payload.lid] = a.payload.order;
    },
    debugSolved: (s, a: PayloadAction<string>) => {
      s.debugs[a.payload] = true;
    },
    restore: (s, a: PayloadAction<Partial<Progress>>) => {
      Object.assign(s, mergeProgress(s, a.payload));
    },
    resetAll: (s) => {
      Object.assign(s, emptyProgress());
    },
  },
});

export const {
  navigate,
  answerQuiz,
  resetQuiz,
  retryWrong,
  toggleFlag,
  labPassed,
  toggleLabSel,
  setLabSel,
  resetLab,
  debugSolved,
  restore,
  resetAll,
} = slice.actions;
export default slice.reducer;
