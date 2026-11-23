"use client";

import { useEffect, useRef } from "react";
import DebugView from "@/components/course/DebugView";
import LabView from "@/components/course/LabView";
import type { QuizFilter } from "@/components/course/Quiz";
import QuizView from "@/components/course/QuizView";
import { debugDone, done, labDone, quizDone, total } from "@/lib/course/progress";
import type { Engine, Lesson } from "@/lib/course/types";
import { estimateMinutes, type Group, type Step, splitCard } from "@/lib/learn/steps";
import { useAppSelector } from "@/store/hooks";
import { BlockView, Md, Note } from "./Blocks";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBug,
  IconCheck,
  IconClock,
  IconLayers,
  IconQuestion,
  IconTarget,
  IconTerminal,
} from "./icons";

const TAG_TONE: Record<string, string> = {
  "Khái niệm": "violet",
  "Cú pháp": "green",
  "Lưu ý": "red",
  "Quy trình": "mint",
  "Bảng lệnh": "orange",
  "Bảng tra": "orange",
};

type Props = {
  engine: Engine;
  lesson: Lesson;
  group: Group;
  steps: readonly Step[];
  step: number;
  onStep: (i: number) => void;
  nextLesson: Lesson | null;
  onNextLesson: () => void;
  quizFilter: QuizFilter;
  onQuizFilter: (f: QuizFilter) => void;
};

export default function LessonView(props: Props) {
  const { engine, lesson, group, steps, step, onStep, nextLesson, onNextLesson, quizFilter, onQuizFilter } = props;
  const p = useAppSelector((s) => s.course);
  const stage = useRef<HTMLDivElement>(null);
  const s = steps[step];

  useEffect(() => {
    stage.current?.scrollTo({ top: 0 });
  }, [lesson.id, step]);

  const qd = quizDone(lesson, p);
  const ld = labDone(lesson, p);
  const dd = debugDone(lesson, p);
  const pct = Math.round((done(lesson, p) / Math.max(1, total(lesson))) * 100);
  const complete: Record<Step["kind"], boolean> = {
    theory: false,
    quiz: qd === lesson.quiz.length,
    lab: ld === lesson.lab.items.length,
    debug: dd === lesson.debugs.length,
  };
  const stepDone = (x: Step, i: number) => (x.kind === "theory" ? i < step : complete[x.kind]);
  const posInGroup = group.lessons.indexOf(lesson);

  return (
    <>
      <section className="ds-main" aria-label="Nội dung bài học">
        <div className="ds-main__head">
          <div className="min-w-0">
            <div className="ds-crumb">
              {group.num}. {group.name} <span>/</span> Bài {posInGroup + 1} / {group.lessons.length}
            </div>
            <h1 className="ds-h1">{lesson.title}</h1>
            <p className="ds-dek">{lesson.dek}</p>
          </div>
          <div className="ds-badges">
            <span className="ds-pill ds-pill--orange">
              <IconClock size={12} /> ≈ {estimateMinutes(lesson)} phút
            </span>
            <span className="ds-pill ds-pill--mint">
              <IconTerminal size={12} /> {lesson.lab.user}@{lesson.lab.host}
            </span>
            <span className="ds-pill ds-pill--violet">
              <IconLayers size={12} /> {steps.length} bước
            </span>
          </div>
        </div>

        <div className="ds-stage">
          <div className="ds-metrics">
            <Metric icon={<IconBook size={11} />} label="Lý thuyết" value={`${lesson.theory.length} thẻ`} />
            <Metric icon={<IconQuestion size={11} />} label="Quiz" value={`${qd}/${lesson.quiz.length}`} ok={complete.quiz} />
            <Metric icon={<IconTerminal size={11} />} label="Thực hành" value={`${ld}/${lesson.lab.items.length}`} ok={complete.lab} />
            <Metric icon={<IconBug size={11} />} label="Fix lỗi" value={`${dd}/${lesson.debugs.length}`} ok={complete.debug} />
            <Metric icon={<IconTarget size={11} />} label="Hoàn thành" value={`${pct}%`} ok={pct === 100} />
          </div>

          <div ref={stage} className="ds-stage__body" key={`${lesson.id}:${step}`}>
            {s.kind === "theory" && <TheoryStage lesson={lesson} card={s.card} />}
            {s.kind === "quiz" && (
              <div className="ds-embed">
                <QuizView lesson={lesson} filter={quizFilter} onFilter={onQuizFilter} />
              </div>
            )}
            {s.kind === "lab" && (
              <div className="ds-embed ds-embed--wide">
                <LabView engine={engine} lesson={lesson} />
              </div>
            )}
            {s.kind === "debug" && (
              <div className="ds-embed ds-embed--wide">
                <DebugView engine={engine} lesson={lesson} />
              </div>
            )}
          </div>
        </div>

        <div className="ds-timeline">
          <div className="ds-timeline__head">
            <span className="ds-label">Trong bài này</span>
            <span className="ds-muted">
              Bước {step + 1} / {steps.length}
            </span>
          </div>
          <ol className="ds-timeline__row">
            {steps.map((x, i) => (
              <li key={i} className={`${i === step ? "is-active" : ""} ${stepDone(x, i) ? "is-done" : ""}`}>
                <button type="button" onClick={() => onStep(i)} title={x.title} aria-current={i === step ? "step" : undefined}>
                  <span className="ds-dot">{stepDone(x, i) && i !== step ? <IconCheck size={12} /> : i + 1}</span>
                  <span className="ds-timeline__label">{x.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="ds-right">
        <StepPanel
          lesson={lesson}
          steps={steps}
          step={step}
          onStep={onStep}
          nextLesson={nextLesson}
          onNextLesson={onNextLesson}
          counts={{ qd, ld, dd }}
        />
        <section className="ds-card ds-learn" aria-label="Các bước trong bài">
          <div className="ds-label">Bạn sẽ học</div>
          <ul>
            {steps.map((x, i) => (
              <li key={i}>
                <button type="button" className={i === step ? "is-active" : ""} onClick={() => onStep(i)}>
                  <span className={`ds-check ${stepDone(x, i) ? "is-on" : ""}`}>{stepDone(x, i) && <IconCheck size={10} />}</span>
                  <span>{x.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function Metric({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok?: boolean }) {
  return (
    <div className={`ds-metric ${ok ? "is-ok" : ""}`}>
      <span className="ds-metric__label">
        {icon} {label}
      </span>
      <b>{value}</b>
    </div>
  );
}

function TheoryStage({ lesson, card }: { lesson: Lesson; card: number }) {
  const c = lesson.theory[card];
  const { lead, rest } = splitCard(c.body);
  // Thẻ chỉ có đoạn mở đầu + ý chính: vẫn hiện đoạn mở đầu ở khung giữa để không trống.
  const blocks = rest.length ? rest : lead ? [lead] : [];
  return (
    <article className="ds-sheet">
      <header className="ds-sheet__head">
        <span className="ds-label">
          Thẻ {card + 1} / {lesson.theory.length}
        </span>
        <h2>
          <Md text={c.title} />
        </h2>
      </header>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </article>
  );
}

type PanelProps = {
  lesson: Lesson;
  steps: readonly Step[];
  step: number;
  onStep: (i: number) => void;
  nextLesson: Lesson | null;
  onNextLesson: () => void;
  counts: { qd: number; ld: number; dd: number };
};

function StepPanel({ lesson, steps, step, onStep, nextLesson, onNextLesson, counts }: PanelProps) {
  const s = steps[step];
  const next = steps[step + 1];

  let tag: string;
  let tone: string;
  let body: React.ReactNode;
  if (s.kind === "theory") {
    const c = lesson.theory[s.card];
    const { lead, key } = splitCard(c.body);
    tag = c.tag;
    tone = TAG_TONE[c.tag] ?? "plain";
    body = (
      <>
        <h2 className="ds-panel__title">
          <Md text={c.title} />
        </h2>
        {lead && (
          <p className="ds-p">
            <Md text={lead} />
          </p>
        )}
        {key && <Note note={key} label="Ý chính" />}
      </>
    );
  } else if (s.kind === "quiz") {
    tag = "Quiz";
    tone = "orange";
    body = (
      <>
        <h2 className="ds-panel__title">Kiểm tra nhanh</h2>
        <p className="ds-p">
          {lesson.quiz.length} câu trắc nghiệm về <b>{lesson.short}</b>. Câu trả lời sai được gắn cờ để bạn ôn lại sau.
        </p>
        <p className="ds-p">
          Đúng: <b>{counts.qd}</b> / {lesson.quiz.length}
        </p>
        <Note
          note={{ note: "Trả lời hết các câu thì lượt làm được lưu vào trang **Kết quả** cùng điểm số.", kind: "tip" }}
          label="Ý chính"
        />
      </>
    );
  } else if (s.kind === "lab") {
    tag = "Thực hành";
    tone = "green";
    body = (
      <>
        <h2 className="ds-panel__title">Thực hành trên VPS giả lập</h2>
        <p className="ds-p">
          Gõ lệnh trong terminal <code>
            {lesson.lab.user}@{lesson.lab.host}
          </code>
          . Sau mỗi lệnh, hệ thống tự chấm các câu chưa pass (hoặc chỉ các câu bạn đã tick chọn).
        </p>
        <p className="ds-p">
          Đã pass: <b>{counts.ld}</b> / {lesson.lab.items.length}
        </p>
        <Note note={{ note: "Bí thì mở **gợi ý** ở từng câu. Mỗi gợi ý là một cách làm, cách khác cho cùng kết quả vẫn được tính." }} label="Ý chính" />
      </>
    );
  } else {
    tag = "Fix lỗi";
    tone = "red";
    body = (
      <>
        <h2 className="ds-panel__title">Tìm và sửa sự cố</h2>
        <p className="ds-p">
          {lesson.debugs.length} sự cố mô phỏng: đọc triệu chứng, tìm nguyên nhân rồi sửa ngay trên máy trong terminal.
        </p>
        <p className="ds-p">
          Đã sửa: <b>{counts.dd}</b> / {lesson.debugs.length}
        </p>
        <Note note={{ note: "Đọc log và thông báo lỗi trước khi sửa. Đoán mò thường làm sự cố tệ hơn.", kind: "warn" }} label="Ý chính" />
      </>
    );
  }

  return (
    <section className="ds-card ds-panel" aria-label="Bước hiện tại">
      <div className="ds-panel__top">
        <span className="ds-label ds-label--ink">
          Bước {step + 1} / {steps.length}
        </span>
        <span className={`ds-tag ds-tag--${tone}`}>{tag}</span>
      </div>
      <div className="ds-panel__body">{body}</div>
      <div className="ds-panel__foot">
        <div className="ds-panel__nav">
          <button type="button" className="ds-btn" disabled={step === 0} onClick={() => onStep(step - 1)}>
            <IconArrowLeft size={13} /> Lùi
          </button>
          {next ? (
            <button type="button" className="ds-btn ds-btn--primary" onClick={() => onStep(step + 1)}>
              <span className="truncate">Tiếp: {next.label}</span> <IconArrowRight size={14} />
            </button>
          ) : (
            <button type="button" className="ds-btn ds-btn--primary" disabled={!nextLesson} onClick={onNextLesson}>
              <span className="truncate">{nextLesson ? `Bài tiếp: ${nextLesson.short}` : "Đã hết khoá học"}</span>
              <IconArrowRight size={14} />
            </button>
          )}
        </div>
        <div className="ds-keys">
          <kbd>←</kbd>
          <kbd>→</kbd> chuyển bước · <kbd>Ctrl K</kbd> tìm bài
        </div>
      </div>
    </section>
  );
}
