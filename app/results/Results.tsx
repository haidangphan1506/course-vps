"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import ProgressBar from "@/components/ui/ProgressBar";
import StatCard from "@/components/ui/StatCard";
import { loadEngine } from "@/lib/course/engine";
import type { Lesson } from "@/lib/course/types";
import type { ModuleResult, ResultsSummary } from "@/lib/progress/contract";
import { fetchResults } from "@/app/progress/actions";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; lessons: Lesson[]; data: ResultsSummary };

/** Kết quả học tập của user đang đăng nhập, lấy qua server action → gateway → DB. */
export default function Results() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    Promise.all([loadEngine(), fetchResults()]).then(
      ([engine, r]) =>
        alive &&
        setState(
          r.ok
            ? { status: "ready", lessons: engine.lessons, data: r.data }
            : { status: "error", message: r.message ?? "Lỗi không xác định." },
        ),
      (e) => alive && setState({ status: "error", message: String(e?.message ?? e) }),
    );
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") return <p className="p-5 text-sm text-zinc-500">Đang tải kết quả…</p>;
  if (state.status === "error")
    return (
      <p role="alert" className="p-5 text-sm text-red-600">
        Không tải được kết quả: {state.message}
      </p>
    );

  const { lessons, data } = state;
  const byId = new Map<string, ModuleResult>(data.modules.map((m) => [m.lessonId, m]));
  const rows = lessons.map((l) => ({ lesson: l, m: byId.get(l.id) }));

  const withQuiz = rows.filter((r) => r.m?.quizBest);
  const sumScore = withQuiz.reduce((a, r) => a + r.m!.quizBest!.score, 0);
  const sumTotal = withQuiz.reduce((a, r) => a + r.m!.quizBest!.total, 0);
  const labsPassed = rows.reduce((a, r) => a + (r.m?.labsPassed ?? 0), 0);
  const labsTotal = lessons.reduce((a, l) => a + l.lab.items.length, 0);
  const debugsSolved = rows.reduce((a, r) => a + (r.m?.debugsSolved ?? 0), 0);
  const debugsTotal = lessons.reduce((a, l) => a + l.debugs.length, 0);
  const cards: [string, string][] = [
    [`${sumScore} / ${sumTotal}`, "Tổng điểm quiz tốt nhất"],
    [`${withQuiz.length} / ${lessons.length}`, "Bài đã làm quiz"],
    [`${labsPassed} / ${labsTotal}`, "Lab đã đạt"],
    [`${debugsSolved} / ${debugsTotal}`, "Bài fix lỗi đã đạt"],
  ];

  return (
    <div className="w-full px-5 py-4">
      <h1 className="text-lg font-semibold">Kết quả khoá học VPS Linux</h1>
      <p className="mb-4 text-sm text-zinc-500">
        {data.syncedAt ? `Đồng bộ lần cuối: ${fmt(data.syncedAt)}.` : "Chưa có dữ liệu đồng bộ."}
      </p>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        {cards.map(([v, l]) => (
          <StatCard key={l} value={v} label={l} />
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-500/10 text-left text-xs text-zinc-500">
              <th className="p-2.5">Bài</th>
              <th className="p-2.5 text-right">Quiz (điểm tốt nhất)</th>
              <th className="p-2.5 text-right">Số lần làm</th>
              <th className="p-2.5">Lab</th>
              <th className="p-2.5 text-right">Fix lỗi</th>
              <th className="p-2.5 text-right">Câu sai / đánh dấu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lesson: l, m }) => {
              const best = m?.quizBest;
              const labs = l.lab.items.length;
              const labDone = m?.labsPassed ?? 0;
              return (
                <tr key={l.id} className="border-t border-black/10 align-top dark:border-white/10">
                  <td className="p-2.5">
                    <div>{l.title}</div>
                    <div className="text-xs text-zinc-500">{l.group}</div>
                  </td>
                  <td className="whitespace-nowrap p-2.5 text-right">
                    {best ? (
                      <>
                        {best.score} / {best.total}
                        <Pill kind={best.score === best.total ? "full" : "part"}>
                          {best.score === best.total ? "đạt tối đa" : "chưa tối đa"}
                        </Pill>
                      </>
                    ) : (
                      <Pill kind="none">chưa làm</Pill>
                    )}
                  </td>
                  <td className="p-2.5 text-right">{m?.quizAttempts ?? 0}</td>
                  <td className="p-2.5">
                    {labs ? (
                      <>
                        {labDone} / {labs}
                        <ProgressBar value={labDone} max={labs} className="mt-1 min-w-[90px]" />
                      </>
                    ) : (
                      <Pill kind="none">chưa có</Pill>
                    )}
                  </td>
                  <td className="p-2.5 text-right">
                    {m?.debugsSolved ?? 0} / {l.debugs.length}
                  </td>
                  <td className="p-2.5 text-right">
                    {m?.wrongTotal ?? 0} / {m?.flagged ?? 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-zinc-500">
        Kết quả lưu trong cơ sở dữ liệu theo tài khoản đang đăng nhập ({data.tests.length} lần test gần nhất).
      </p>
    </div>
  );
}
