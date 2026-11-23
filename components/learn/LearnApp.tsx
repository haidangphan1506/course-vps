"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { QuizFilter } from "@/components/course/Quiz";
import ResultsView from "@/components/course/ResultsView";
import { loadEngine } from "@/lib/course/engine";
import type { CourseTab, Engine } from "@/lib/course/types";
import { useProgressSync } from "@/lib/course/useProgressSync";
import { groupLessons, lessonSteps } from "@/lib/learn/steps";
import { getParam, setParams } from "@/lib/url-state";
import { navigate } from "@/store/courseSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { WaitForPersist } from "@/store/StoreProvider";
import Header, { type Theme, type View } from "./Header";
import LessonView from "./LessonView";
import Sidebar from "./Sidebar";

const THEME_KEY = "learn-theme";

/** Giao diện học theo từng bước (kiểu app shell): header, cây bài học, khung nội dung, panel bước. */
export default function LearnApp() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");

  useLayoutEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const t: Theme =
      saved === "light" || saved === "dark" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t);
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

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

  const toggleTheme = () =>
    setTheme((t) => {
      const n = t === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, n);
      return n;
    });

  const loading = (text: string) => <div className="ds-loading">{text}</div>;

  return (
    <div className="ds" data-theme={theme}>
      {error ? (
        <div className="ds-loading" role="alert">
          Không tải được khoá học: {error}
        </div>
      ) : !engine ? (
        loading("Đang tải khoá học…")
      ) : (
        <WaitForPersist loading={loading("Đang tải tiến độ…")}>
          <Shell engine={engine} theme={theme} onTheme={toggleTheme} />
        </WaitForPersist>
      )}
    </div>
  );
}

function Shell({ engine, theme, onTheme }: { engine: Engine; theme: Theme; onTheme: () => void }) {
  const dispatch = useAppDispatch();
  const p = useAppSelector((s) => s.course);
  const lessons = engine.lessons;
  const groups = useMemo(() => groupLessons(lessons), [lessons]);
  const lesson = lessons.find((l) => l.id === p.cur) ?? lessons[0];
  const group = groups.find((g) => g.name === lesson.group)!;
  const steps = useMemo(() => lessonSteps(lesson), [lesson]);
  const index = lessons.indexOf(lesson);
  const nextLesson = lessons[index + 1] ?? null;

  const [view, setView] = useState<View>("learn");
  const [step, setStep] = useState(0);
  const [menu, setMenu] = useState(false);
  const [filters, setFilters] = useState<Record<string, QuizFilter>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  useProgressSync(lessons);

  // Khôi phục vị trí từ URL: ?lesson=<id>&step=<n> hoặc ?view=results.
  useLayoutEffect(() => {
    const target = lessons.find((l) => l.id === getParam("lesson"));
    if (target) dispatch(navigate({ cur: target.id }));
    const n = Number(getParam("step"));
    const max = lessonSteps(target ?? lesson).length;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (n >= 1 && n <= max) setStep(n - 1);
    if (getParam("view") === "results") setView("results");
    /* eslint-enable react-hooks/set-state-in-effect */
    // Chỉ chạy một lần khi mở trang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback(
    (lessonId: string, i = 0) => {
      const l = lessons.find((x) => x.id === lessonId);
      if (!l) return;
      const st = lessonSteps(l);
      const k = Math.max(0, Math.min(i, st.length - 1));
      const kind = st[k].kind;
      // Giữ "tab" trong store khớp với bước, để giao diện cũ (/) mở lại đúng chỗ.
      dispatch(navigate({ cur: l.id, tab: (kind === "theory" ? "theory" : kind) as CourseTab }));
      setStep(k);
      setView("learn");
      setMenu(false);
      setParams({ lesson: l.id, step: String(k + 1), view: null, case: null });
    },
    [dispatch, lessons],
  );

  const showView = (v: View) => {
    setView(v);
    setMenu(false);
    if (v === "results") setParams({ view: "results" });
    else setParams({ view: null, lesson: lesson.id, step: String(step + 1) });
  };

  // Phím tắt: ← → chuyển bước, Ctrl/⌘ K tìm bài. Bỏ qua khi đang gõ trong ô nhập/terminal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (view !== "learn" || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (t?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      if (e.key === "ArrowRight" && step < steps.length - 1) go(lesson.id, step + 1);
      else if (e.key === "ArrowLeft" && step > 0) go(lesson.id, step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, lesson.id, step, steps.length, view]);

  return (
    <>
      <Header
        ip={engine.ip}
        groups={groups}
        view={view}
        onView={showView}
        theme={theme}
        onTheme={onTheme}
        onPick={(id) => go(id)}
        onMenu={() => setMenu((m) => !m)}
        searchRef={searchRef}
      />
      <div className={`ds-body ${view === "results" ? "is-results" : ""}`}>
        {menu && <button type="button" className="ds-scrim" aria-label="Đóng danh sách bài" onClick={() => setMenu(false)} />}
        <Sidebar
          groups={groups}
          cur={lesson.id}
          p={p}
          open={menu}
          onPick={(id) => go(id, id === lesson.id ? step : 0)}
          onResults={() => showView("results")}
        />
        {view === "results" ? (
          <section className="ds-main ds-main--scroll" aria-label="Kết quả">
            {/* ResultsView đã có tiêu đề riêng. */}
            <div className="ds-embed ds-embed--wide">
              <ResultsView
                lessons={lessons}
                onGo={(id, _tab, filter) => {
                  if (filter) setFilters((f) => ({ ...f, [id]: filter }));
                  const l = lessons.find((x) => x.id === id);
                  go(id, l ? lessonSteps(l).findIndex((s) => s.kind === "quiz") : 0);
                }}
              />
            </div>
          </section>
        ) : (
          <LessonView
            engine={engine}
            lesson={lesson}
            group={group}
            steps={steps}
            step={Math.min(step, steps.length - 1)}
            onStep={(i) => go(lesson.id, i)}
            nextLesson={nextLesson}
            onNextLesson={() => nextLesson && go(nextLesson.id)}
            quizFilter={filters[lesson.id] ?? "all"}
            onQuizFilter={(f) => setFilters((x) => ({ ...x, [lesson.id]: f }))}
          />
        )}
      </div>
    </>
  );
}
