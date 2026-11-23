"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MenuBar, { type MenuGroup } from "@/components/ui/MenuBar";
import ProgressBar from "@/components/ui/ProgressBar";
import Tabs from "@/components/ui/Tabs";
import { loadEngine } from "@/lib/course/engine";
import { debugDone, done, labDone, quizDone, total } from "@/lib/course/progress";
import type { CourseTab, Engine } from "@/lib/course/types";
import { useProgressSync } from "@/lib/course/useProgressSync";
import { getParam, setParams } from "@/lib/url-state";
import { navigate, restore } from "@/store/courseSlice";
import { WaitForPersist } from "@/store/StoreProvider";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import DebugView from "./DebugView";
import LabView from "./LabView";
import type { QuizFilter } from "./Quiz";
import QuizView from "./QuizView";
import ResultsView from "./ResultsView";
import Theory from "./Theory";

const RESULTS = "__results";
const RESULTS_PARAM = "results";
const TAB_KEYS: readonly CourseTab[] = ["theory", "quiz", "lab", "debug"];
const FILTERS: readonly QuizFilter[] = ["all", "flag", "wrong"];
const OLD_KEY = "vps-linux-khoa-hoc-v1";

/** Khoá học VPS Linux: nạp engine ở trình duyệt rồi hiển thị. */
export default function CourseApp() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadEngine().then(
      (e) => alive && setEngine(e),
      (e) => alive && setError(String(e?.message ?? e)),
    );
    return () => {
      alive = false;
    };
  }, []);

  if (error)
    return (
      <p role="alert" className="p-5 text-sm text-red-600">
        Không tải được khoá học: {error}
      </p>
    );
  if (!engine) return <p className="p-5 text-sm text-zinc-500">Đang tải khoá học…</p>;
  return (
    <WaitForPersist loading={<p className="p-5 text-sm text-zinc-500">Đang tải tiến độ…</p>}>
      <Course engine={engine} />
    </WaitForPersist>
  );
}

function Course({ engine }: { engine: Engine }) {
  const dispatch = useAppDispatch();
  const p = useAppSelector((s) => s.course);
  // Trạng thái ban đầu lấy từ URL: ?module=<id|results>&view=<tab>&case=<debugId>&filter=<all|flag|wrong>
  const [results, setResults] = useState(() => getParam("module") === RESULTS_PARAM);
  const [filters, setFilters] = useState<Record<string, QuizFilter>>(() => {
    const m = getParam("module");
    const f = getParam("filter") as QuizFilter | null;
    return m && f && FILTERS.includes(f) ? { [m]: f } : {};
  });
  const top = useRef<HTMLDivElement>(null);
  const lessons = engine.lessons;
  const lesson = lessons.find((l) => l.id === p.cur) ?? lessons[0];

  // Khôi phục chương + tab từ URL (ghi đè giá trị đã lưu trong Redux) trước khi paint.
  useLayoutEffect(() => {
    const m = getParam("module");
    const v = getParam("view") as CourseTab | null;
    const target = lessons.find((l) => l.id === m);
    if (target) dispatch(navigate({ cur: target.id, tab: v && TAB_KEYS.includes(v) ? v : "theory" }));
    else if (m !== RESULTS_PARAM && v && TAB_KEYS.includes(v)) dispatch(navigate({ tab: v }));
  }, [dispatch, lessons]);

  // Nhập tiến độ cũ từ bản HTML (localStorage), một lần.
  useEffect(() => {
    try {
      const flag = `${OLD_KEY}:migrated`;
      const raw = localStorage.getItem(OLD_KEY);
      if (raw && !localStorage.getItem(flag)) {
        dispatch(restore(JSON.parse(raw)));
        localStorage.setItem(flag, "1");
      }
    } catch {}
  }, [dispatch]);

  useProgressSync(lessons);

  const go = (id: string, tab: CourseTab = "theory", filter?: QuizFilter) => {
    dispatch(navigate({ cur: id, tab }));
    if (filter) setFilters((f) => ({ ...f, [id]: filter }));
    setResults(false);
    const f = filter ?? filters[id];
    setParams({ module: id, view: tab, case: null, filter: tab === "quiz" && f !== "all" ? f : null });
    top.current?.scrollIntoView({ block: "start" });
  };

  const groups = useMemo(() => {
    const out: MenuGroup[] = [{ items: [{ key: RESULTS, label: "Kết quả của tôi", index: "★" }] }];
    const by = new Map<string, MenuGroup>();
    lessons.forEach((l, i) => {
      let g = by.get(l.group);
      if (!g) {
        g = { title: l.group, items: [] };
        by.set(l.group, g);
        out.push(g);
      }
      const d = done(l, p);
      const t = total(l);
      (g.items as MenuGroup["items"][number][]).push({
        key: l.id,
        index: String(i + 1),
        label: l.short,
        meta: d === t ? "✓" : `${d}/${t}`,
        done: d === t,
      });
    });
    for (const g of out) {
      if (!g.title) continue;
      g.done = g.items.every((it) => it.done);
      g.meta = g.done ? "✓" : g.items.length;
    }
    return out;
  }, [lessons, p]);

  const d = lessons.reduce((a, l) => a + done(l, p), 0);
  const t = lessons.reduce((a, l) => a + total(l), 0);
  const index = lessons.indexOf(lesson);

  const tabs = [
    { key: "theory", label: "Lý thuyết" },
    { key: "quiz", label: "Quiz", badge: `${quizDone(lesson, p)}/${lesson.quiz.length}`, done: quizDone(lesson, p) === lesson.quiz.length },
    { key: "lab", label: "Thực hành", badge: `${labDone(lesson, p)}/${lesson.lab.items.length}`, done: labDone(lesson, p) === lesson.lab.items.length },
    { key: "debug", label: "Fix lỗi", badge: `${debugDone(lesson, p)}/${lesson.debugs.length}`, done: debugDone(lesson, p) === lesson.debugs.length },
  ] as const;

  return (
    <div ref={top} className="px-5 pb-10 pt-4">
      <header className="flex flex-wrap items-center gap-4 pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-[34px] flex-none place-items-center rounded-[9px] bg-zinc-900 font-mono text-[13px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
            $_
          </div>
          <div className="min-w-0">
            <h1 className="m-0 text-[17px] font-bold leading-tight tracking-tight">Khoá học VPS Linux</h1>
            <small className="block font-mono text-xs text-zinc-500">{engine.ip}</small>
          </div>
        </div>
        <div className="ml-auto flex min-w-[180px] flex-[0_1_260px] items-center gap-2.5">
          <ProgressBar value={d} max={t} className="flex-1" />
          <span className="whitespace-nowrap font-mono text-xs text-zinc-500">
            {d}/{t} · {t ? Math.round((d / t) * 100) : 0}%
          </span>
        </div>
      </header>

      <div className="grid items-start gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
        <MenuBar
          label="Các chương"
          collapsible
          groups={groups}
          value={results ? RESULTS : lesson.id}
          onChange={(k) => {
            if (k === RESULTS) {
              setResults(true);
              setParams({ module: RESULTS_PARAM, view: null, case: null, filter: null });
              top.current?.scrollIntoView({ block: "start" });
            } else go(k, p.cur === k ? p.tab : "theory");
          }}
          className="md:sticky md:top-3"
        />

        <main className="min-w-0">
          {results ? (
            <ResultsView lessons={lessons} onGo={go} />
          ) : (
            <>
              <div className="mb-3.5">
                <div className="font-mono text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Chương {index + 1} · {lesson.group}
                </div>
                <h2 className="my-1 text-2xl font-semibold leading-tight tracking-tight">{lesson.title}</h2>
                <p className="m-0 max-w-[68ch] text-zinc-500">{lesson.dek}</p>
              </div>
              <Tabs
                className="mb-4"
                items={tabs}
                value={p.tab}
                onChange={(tab) => {
                  dispatch(navigate({ tab }));
                  const f = filters[lesson.id];
                  setParams({
                    module: lesson.id,
                    view: tab,
                    case: null,
                    filter: tab === "quiz" && f && f !== "all" ? f : null,
                  });
                }}
              />
              <div key={`${lesson.id}:${p.tab}`}>
                {p.tab === "theory" && (
                  <Theory
                    cards={lesson.theory}
                    onNext={() => go(lesson.id, "quiz")}
                  />
                )}
                {p.tab === "quiz" && (
                  <QuizView
                    lesson={lesson}
                    filter={filters[lesson.id] ?? "all"}
                    onFilter={(f) => {
                      setFilters((x) => ({ ...x, [lesson.id]: f }));
                      setParams({ module: lesson.id, view: "quiz", filter: f === "all" ? null : f });
                    }}
                  />
                )}
                {p.tab === "lab" && <LabView engine={engine} lesson={lesson} />}
                {p.tab === "debug" && <DebugView engine={engine} lesson={lesson} />}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
