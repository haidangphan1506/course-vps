"use client";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Md from "@/components/ui/Md";

export type QuizQuestion = { q: string; opts: string[]; ans: number; why: string };
export type QuizFilter = "all" | "flag" | "wrong";

type QuizProps = {
  questions: readonly QuizQuestion[];
  /** Thứ tự hiển thị (chỉ số vào `questions`). */
  order: readonly number[];
  answers: Readonly<Record<number, number>>;
  wrong?: Readonly<Record<number, number>>;
  flags?: Readonly<Record<number, boolean>>;
  filter?: QuizFilter;
  onFilter?: (f: QuizFilter) => void;
  onAnswer: (qi: number, oi: number) => void;
  onToggleFlag?: (qi: number) => void;
  onReset: () => void;
  onRetryWrong?: () => void;
};

const LETTERS = "ABCDEFGH";

/** Quiz điều khiển từ ngoài: trạng thái (đáp án, đánh dấu, số lần sai) do nơi dùng quản lý. */
export default function Quiz({
  questions,
  order,
  answers,
  wrong = {},
  flags = {},
  filter = "all",
  onFilter,
  onAnswer,
  onToggleFlag,
  onReset,
  onRetryWrong,
}: QuizProps) {
  const score = questions.filter((q, i) => answers[i] === q.ans).length;
  const nFlag = questions.filter((_, i) => flags[i]).length;
  const nWrong = questions.filter((_, i) => (wrong[i] ?? 0) > 0).length;
  const nNow = questions.filter((q, i) => answers[i] != null && answers[i] !== q.ans).length;

  const shown = order.filter((qi) => (filter === "flag" ? flags[qi] : filter === "wrong" ? (wrong[qi] ?? 0) > 0 : true));
  const outline = "border border-black/10 dark:border-white/10";

  return (
    <div className="grid gap-3.5">
      <div className="flex flex-wrap gap-1.5">
        {onFilter &&
          (
            [
              ["all", `Tất cả (${questions.length})`],
              ["flag", `⚑ Đã đánh dấu (${nFlag})`],
              ["wrong", `Từng sai (${nWrong})`],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              variant="ghost"
              className={`${outline} ${filter === k ? "!bg-blue-600 !text-white" : ""}`}
              onClick={() => onFilter(k)}
            >
              {label}
            </Button>
          ))}
        <Button variant="ghost" className={outline} onClick={onReset} title="Xoá điểm và đáp án để làm lại, câu hỏi được xáo ngẫu nhiên">
          Làm lại quiz
        </Button>
        {nNow > 0 && onRetryWrong && (
          <Button variant="ghost" className={outline} onClick={onRetryWrong}>
            Làm lại {nNow} câu đang sai
          </Button>
        )}
      </div>

      {shown.map((qi) => {
        const q = questions[qi];
        const sel = answers[qi];
        const answered = sel != null;
        const wn = wrong[qi] ?? 0;
        const flagged = !!flags[qi];
        return (
          <Card key={qi} className={`p-4 ${flagged ? "!border-amber-500/60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-zinc-500">
                Câu {order.indexOf(qi) + 1}/{questions.length}
              </span>
              {wn > 0 && (
                <span className="rounded-full bg-red-500/15 px-2 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  Sai {wn} lần
                </span>
              )}
              {onToggleFlag && (
                <button
                  type="button"
                  aria-pressed={flagged}
                  onClick={() => onToggleFlag(qi)}
                  title={flagged ? "Bỏ đánh dấu" : "Đánh dấu câu này để ôn lại"}
                  className={`ml-auto cursor-pointer rounded-md px-2 py-0.5 text-xs ${flagged ? "bg-amber-500/20 font-semibold" : "text-zinc-500"}`}
                >
                  {flagged ? "⚑ Đã đánh dấu" : "⚐ Đánh dấu"}
                </button>
              )}
            </div>
            <h4 className="mb-2.5 mt-1 font-semibold">
              <Md text={q.q} />
            </h4>
            <div className="grid gap-2">
              {q.opts.map((o, oi) => {
                const tone = !answered
                  ? "border-black/10 bg-zinc-500/10 hover:border-blue-600 dark:border-white/10"
                  : oi === q.ans
                    ? "border-emerald-600 bg-emerald-500/15"
                    : oi === sel
                      ? "border-red-600 bg-red-500/15"
                      : "border-black/10 bg-zinc-500/10 dark:border-white/10";
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={answered}
                    onClick={() => onAnswer(qi, oi)}
                    className={`flex w-full cursor-pointer gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm disabled:cursor-default ${tone}`}
                  >
                    <span className="flex-none pt-0.5 font-mono text-xs text-zinc-500">{LETTERS[oi]}</span>
                    <span>
                      <Md text={o} />
                    </span>
                  </button>
                );
              })}
            </div>
            {answered && (
              <p className="mt-2.5 text-sm text-zinc-500">
                <b>{sel === q.ans ? "Đúng. " : "Chưa đúng. "}</b>
                <Md text={q.why} />
              </p>
            )}
          </Card>
        );
      })}
      {shown.length === 0 && (
        <Card className="p-4 text-sm text-zinc-500">
          {filter === "flag"
            ? "Chưa có câu nào được đánh dấu. Câu trả lời sai sẽ tự được đánh dấu."
            : "Chưa có câu nào từng sai ở chương này."}
        </Card>
      )}
      <div className="flex items-center gap-3 text-sm">
        <b>
          Điểm: {score}/{questions.length}
        </b>
      </div>
    </div>
  );
}
