"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { debugDone, fmtTime, labDone, quizDone } from "@/lib/course/progress";
import type { Lesson } from "@/lib/course/types";
import { resetAll, restore, type Progress } from "@/store/courseSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { QuizFilter } from "./Quiz";

type Props = { lessons: readonly Lesson[]; onGo: (lessonId: string, tab: "quiz", filter?: QuizFilter) => void };

const row = "grid grid-cols-[minmax(0,1fr)_110px_60px_60px] items-baseline gap-2 border-t border-black/10 px-1 py-2 text-left text-sm dark:border-white/10";
const clickable = `${row} w-full cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.05]`;
const outline = "border border-black/10 dark:border-white/10";

export default function ResultsView({ lessons, onGo }: Props) {
  const dispatch = useAppDispatch();
  const p = useAppSelector((s) => s.course);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState(false);

  const plain = (s: string) => s.replace(/[`*]/g, "");
  const rows = lessons.map((l, i) => {
    const runs = p.hist.filter((x) => x.l === l.id);
    const best = runs.reduce((b, x) => Math.max(b, x.s), 0);
    const cur = quizDone(l, p);
    const ans = Object.keys(p.quiz[l.id] ?? {}).length;
    return { l, i, runs: runs.length, best: Math.max(best, cur), ans };
  });

  const totalQ = rows.reduce((a, r) => a + r.best, 0);
  const totalN = lessons.reduce((a, l) => a + l.quiz.length, 0);

  const missed = lessons
    .flatMap((l) =>
      l.quiz.map((q, qi) => ({ l, q, qi, n: p.wrong[l.id]?.[qi] ?? 0, f: !!p.flag[l.id]?.[qi] })),
    )
    .filter((m) => m.n > 0 || m.f)
    .sort((a, b) => b.n - a.n);
  const history = p.hist.slice().reverse().slice(0, 30);

  const backup: Progress = {
    labs: p.labs, quiz: p.quiz, debugs: p.debugs, hist: p.hist, wrong: p.wrong,
    flag: p.flag, qord: p.qord, labOrd: p.labOrd, labSel: p.labSel,
  };

  return (
    <div className="grid gap-3.5">
      <div>
        <div className="font-mono text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400">Tiến độ</div>
        <h2 className="my-1 text-2xl font-semibold tracking-tight">Kết quả của tôi</h2>
        <p className="m-0 max-w-[68ch] text-sm text-zinc-500">
          Điểm quiz, bài lab và sự cố đã xử lý của từng chương. Dữ liệu tự lưu trên trình duyệt.
        </p>
      </div>

      <Card className="p-4">
        <div className="mb-1 font-mono text-xs text-zinc-500">Theo từng chương (bấm để mở quiz)</div>
        <div className={`${row} !border-t-0 text-xs font-semibold text-zinc-500`}>
          <span>Chương</span><span>Quiz</span><span>Lab</span><span>Sự cố</span>
        </div>
        {rows.map(({ l, i, runs, best, ans }) => (
          <button key={l.id} type="button" className={clickable} onClick={() => onGo(l.id, "quiz")}>
            <span className="truncate">{i + 1}. {l.short}</span>
            <span>
              {ans
                ? ans < l.quiz.length
                  ? `đang làm ${ans}/${l.quiz.length}`
                  : `cao nhất ${best}/${l.quiz.length}${runs > 1 ? ` · ${runs} lần` : ""}`
                : "-"}
            </span>
            <span className={labDone(l, p) === l.lab.items.length ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>
              {labDone(l, p)}/{l.lab.items.length}
            </span>
            <span className={debugDone(l, p) === l.debugs.length ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>
              {debugDone(l, p)}/{l.debugs.length}
            </span>
          </button>
        ))}
        <p className="mb-0 mt-2 text-sm text-zinc-500">Tổng điểm quiz (lần tốt nhất): {totalQ}/{totalN}</p>
      </Card>

      <Card className="p-4">
        <div className="mb-1 font-mono text-xs text-zinc-500">Câu hay sai và câu đã đánh dấu ({missed.length})</div>
        {missed.length === 0 && <p className="m-0 text-sm text-zinc-500">Chưa có câu nào sai hoặc được đánh dấu.</p>}
        {missed.slice(0, 15).map((m) => (
          <button
            key={`${m.l.id}:${m.qi}`}
            type="button"
            className={clickable}
            onClick={() => onGo(m.l.id, "quiz", m.n ? "wrong" : "flag")}
          >
            <span className="truncate">{plain(m.q.q)}</span>
            <span className={m.n ? "text-red-600 dark:text-red-400" : ""}>{m.n ? `Sai ${m.n} lần` : "⚑ đánh dấu"}</span>
            <span />
            <span />
          </button>
        ))}
      </Card>

      <Card className="p-4">
        <div className="mb-1 font-mono text-xs text-zinc-500">Lịch sử làm quiz (30 lần gần nhất)</div>
        {history.length === 0 && (
          <p className="m-0 text-sm text-zinc-500">
            Chưa có lần làm quiz nào hoàn thành. Trả lời hết các câu của một chương để lưu kết quả.
          </p>
        )}
        {history.map((x) => (
          <div key={`${x.l}:${x.t}`} className={row}>
            <span className="truncate">{lessons.find((l) => l.id === x.l)?.short ?? x.l}</span>
            <span className={x.s === x.n ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>{x.s}/{x.n}</span>
            <span className="col-span-2 text-zinc-500">{fmtTime(x.t)}</span>
          </div>
        ))}
      </Card>

      <Card className="p-4">
        <div className="mb-1 font-mono text-xs text-zinc-500">Sao lưu và khôi phục</div>
        <p className="mt-0 text-sm">
          Sao lưu là một đoạn văn bản. Chép lại và cất ở nơi an toàn; khôi phục sẽ gộp với tiến độ hiện có, không làm mất gì.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            onClick={async () => {
              const s = JSON.stringify(backup);
              setText(s);
              try {
                await navigator.clipboard.writeText(s);
              } catch {}
              setMsg(`Đã tạo bản sao lưu trong ô bên dưới (${s.length} ký tự).`);
            }}
          >
            Chép bản sao lưu
          </Button>
          <Button
            variant="ghost"
            className={outline}
            onClick={() => {
              try {
                const o = JSON.parse(text);
                if (!o || typeof o !== "object" || !(o.labs || o.quiz || o.debugs)) throw 0;
                dispatch(restore(o));
                setMsg("Đã khôi phục và gộp với tiến độ hiện có.");
              } catch {
                setMsg("Nội dung sao lưu không hợp lệ.");
              }
            }}
          >
            Khôi phục từ ô bên dưới
          </Button>
          <Button
            variant="ghost"
            className={outline}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              dispatch(resetAll());
              setConfirm(false);
              setMsg("Đã xoá toàn bộ tiến độ.");
            }}
          >
            {confirm ? "Bấm lần nữa để xác nhận xoá" : "Xoá toàn bộ tiến độ"}
          </Button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder="Dán nội dung sao lưu vào đây để khôi phục"
          className="mt-2 w-full rounded-lg border border-black/10 bg-transparent p-2 font-mono text-xs dark:border-white/10"
        />
        {msg && <p className="mb-0 mt-1 text-sm text-zinc-500">{msg}</p>}
      </Card>
    </div>
  );
}
