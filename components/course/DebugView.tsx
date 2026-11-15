"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Md from "@/components/ui/Md";
import { dropShell, getShell } from "@/lib/course/sessions";
import { getParam, setParams } from "@/lib/url-state";
import type { Engine, Lesson } from "@/lib/course/types";
import { debugSolved } from "@/store/courseSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import ShellTerminal from "./ShellTerminal";

type Help = { hints: number; sol: boolean };
const label = "mt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const outline = "border border-black/10 dark:border-white/10";

export default function DebugView({ engine, lesson }: { engine: Engine; lesson: Lesson }) {
  const dispatch = useAppDispatch();
  const solved = useAppSelector((s) => s.course.debugs);
  // Sự cố đang mở lấy từ ?case=<debugId> để reload lại đúng bài.
  const [cur, setCur] = useState(() => {
    const i = lesson.debugs.findIndex((x) => x.id === getParam("case"));
    return i < 0 ? 0 : i;
  });
  const [help, setHelp] = useState<Record<string, Help>>({});
  const [nonce, setNonce] = useState(0);

  const d = lesson.debugs[Math.min(cur, lesson.debugs.length - 1)];
  const key = `dbg:${d?.id}`;
  const sh = useMemo(
    () => (d ? getShell(engine, key, { host: d.host, user: d.user, setup: d.setup }) : null),
    // nonce: tạo lại shell sau khi đặt lại
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, key, nonce],
  );

  if (!d || !sh) return <p className="text-sm text-zinc-500">Chương này chưa có bài sửa lỗi.</p>;

  const st = help[d.id] ?? { hints: 0, sol: false };
  const set = (patch: Partial<Help>) => setHelp((h) => ({ ...h, [d.id]: { ...st, ...patch } }));
  const isDone = !!solved[d.id];
  const canSolution = !d.hard || isDone;

  const onRun = () => {
    if (isDone) return;
    let ok = false;
    try {
      ok = d.check(sh);
    } catch {}
    if (ok) dispatch(debugSolved(d.id));
  };

  return (
    <div>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
        {lesson.debugs.map((x, i) => {
          const ok = !!solved[x.id];
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setCur(i);
                setParams({ module: lesson.id, view: "debug", case: x.id });
              }}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-left ${
                ok
                  ? "border-transparent bg-emerald-500/15"
                  : i === cur
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-black/10 bg-white hover:border-amber-500 dark:border-white/10 dark:bg-zinc-900"
              }`}
            >
              <span
                className={`grid size-[26px] flex-none place-items-center rounded-md font-mono text-xs font-bold text-white ${ok ? "bg-emerald-600" : "bg-amber-500"}`}
              >
                {ok ? "✓" : "!"}
              </span>
              <span>
                <b className="block text-sm leading-snug">{x.title}</b>
                <small className="text-xs text-zinc-500">
                  {ok ? "Đã xử lý" : x.hard ? "Nâng cao · không lời giải" : `Sự cố ${i + 1}/${lesson.debugs.length}`}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[5fr_7fr]">
        <div className="min-w-0">
          <h3 className="mb-1 text-lg font-semibold">{d.title}</h3>
          <div className={label}>Triệu chứng</div>
          <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-r-xl border-l-4 border-amber-500 bg-[#0f1a21] px-3.5 py-2.5 font-mono text-[12.5px] text-[#d6e2ea]">
            {d.symptom.join("\n")}
          </pre>
          <div className={label}>Bối cảnh</div>
          <p className="my-1 text-sm">
            <Md text={d.story} />
          </p>
          <div className={label}>Mục tiêu</div>
          <p className="my-1 text-sm">
            <Md text={d.goal} />
          </p>

          <div className={label}>Cần trợ giúp?</div>
          <div className="my-2 flex flex-wrap gap-1.5">
            {[0, 1, 2].map((i) => (
              <Button
                key={i}
                variant="ghost"
                className={`${outline} ${i < st.hints ? "opacity-60" : ""}`}
                disabled={i > st.hints}
                onClick={() => set({ hints: Math.max(st.hints, i + 1) })}
              >
                Gợi ý {i + 1}
              </Button>
            ))}
            {canSolution && (
              <Button variant="ghost" className={outline} onClick={() => set({ sol: !st.sol })}>
                {st.sol ? "Ẩn lời giải" : "Xem lời giải"}
              </Button>
            )}
          </div>
          {d.hints.slice(0, st.hints).map((h, j) => (
            <div key={j} className="my-1.5 rounded-xl border border-black/10 bg-zinc-500/10 px-3 py-2 text-sm dark:border-white/10">
              <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">GỢI Ý {j + 1}</span>
              <br />
              <Md text={h} />
            </div>
          ))}
          {st.sol && canSolution && (
            <div className="my-1.5 rounded-xl border border-black/10 bg-zinc-500/10 px-3 py-2 text-sm dark:border-white/10">
              <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">LỜI GIẢI (chạy lần lượt)</span>
              {d.fix.map((c, i) => (
                <code key={i} className="my-1 block whitespace-pre-wrap rounded-md bg-[#0f1a21] px-2.5 py-1.5 text-[12.5px] text-[#d6e2ea]">
                  {c}
                </code>
              ))}
            </div>
          )}
          {isDone && (
            <div className="mt-3 rounded-xl border border-emerald-600 bg-emerald-500/15 px-3.5 py-3">
              <b className="text-emerald-700 dark:text-emerald-400">Đã khắc phục.</b>
              <p className="mb-0 mt-1.5 text-sm">
                <b>Nguyên nhân gốc:</b> <Md text={d.cause} />
              </p>
            </div>
          )}
        </div>
        <div className="min-w-0 lg:sticky lg:top-3">
          <ShellTerminal
            key={`${key}:${nonce}`}
            engine={engine}
            shell={sh}
            persistKey={key}
            host={d.host}
            user={d.user}
            titleSuffix=" · sự cố"
            extraWelcome="Hãy tự chẩn đoán: bắt đầu từ triệu chứng ở bên cạnh."
            onRun={onRun}
            onReset={() => {
              dropShell(key);
              setNonce((n) => n + 1);
            }}
          />
        </div>
      </div>
    </div>
  );
}
