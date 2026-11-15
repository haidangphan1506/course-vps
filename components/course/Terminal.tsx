"use client";

import { useEffect, useRef, useState } from "react";

export type ExecResult = {
  output?: string;
  error?: string;
  /** Xoá màn hình. */
  clear?: boolean;
  /** Lệnh chưa hoàn chỉnh (thiếu nháy, dấu \ cuối dòng...): chờ dòng tiếp theo. */
  needMore?: boolean;
  code?: number;
} | void;

type Line = { id: number; kind: "cmd" | "out" | "err" | "dim"; text: string; prompt?: string };
type Session = { lines: Line[]; hist: string[]; prompt: string; buf: string; nextId: number };

const sessions = new Map<string, Session>();

/** Xoá trạng thái terminal đã lưu (dùng khi đặt lại bài). */
export function clearTerminal(key: string) {
  sessions.delete(key);
}

type TerminalProps = {
  /** Thực thi một lệnh (có thể nhiều dòng nếu đang nối tiếp) và trả về kết quả để in. */
  execute: (command: string) => ExecResult;
  prompt?: string | (() => string);
  /** Gợi ý khi bấm Tab. */
  complete?: (line: string) => { word: string; matches: string[] } | null;
  /** Giữ nội dung terminal khi chuyển tab/bài (khoá duy nhất). */
  persistKey?: string;
  title?: string;
  welcome?: string;
  height?: number | string;
  onCommand?: (command: string, result: ExecResult) => void;
  onReset?: () => void;
  className?: string;
};

export default function Terminal({
  execute,
  prompt = "user@vps:~$",
  complete,
  persistKey,
  title = "terminal",
  welcome,
  height = 340,
  onCommand,
  onReset,
  className = "",
}: TerminalProps) {
  const getPrompt = () => (typeof prompt === "function" ? prompt() : prompt);
  const [sess, setSess] = useState<Session>(() => {
    const saved = persistKey ? sessions.get(persistKey) : undefined;
    return (
      saved ?? {
        lines: welcome ? [{ id: 0, kind: "dim", text: welcome }] : [],
        hist: [],
        prompt: getPrompt(),
        buf: "",
        nextId: 1,
      }
    );
  });
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const out = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const commit = (next: Session) => {
    if (persistKey) sessions.set(persistKey, next);
    setSess(next);
  };

  useEffect(() => {
    out.current?.scrollTo({ top: out.current.scrollHeight });
  }, [sess.lines]);

  const run = (line: string) => {
    const shown = sess.buf ? "> " : sess.prompt;
    let id = sess.nextId;
    let lines: Line[] = [...sess.lines, { id: id++, kind: "cmd", text: line, prompt: shown }];
    const hist = line.trim() ? [...sess.hist, line] : sess.hist;
    const text = sess.buf ? `${sess.buf}\n${line}` : line;
    if (!text.trim()) return commit({ ...sess, lines, hist, nextId: id, buf: "" });

    let result: ExecResult;
    try {
      result = execute(text);
    } catch (e) {
      result = { output: `lỗi mô phỏng: ${(e as Error).message}\n`, code: 1 };
    }
    if (result?.needMore) return commit({ ...sess, lines, hist, nextId: id, buf: text });

    if (result?.clear) lines = [];
    const body = (s: string) => s.replace(/\n$/, "");
    if (result?.output) lines.push({ id: id++, kind: "out", text: body(result.output) });
    if (result?.error) lines.push({ id: id++, kind: "err", text: body(result.error) });
    commit({ ...sess, lines, hist, nextId: id, buf: "", prompt: getPrompt() });
    onCommand?.(text, result);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const line = input;
      setInput("");
      setCursor(null);
      run(line);
    } else if (e.key === "ArrowUp" && sess.hist.length) {
      e.preventDefault();
      const i = cursor === null ? sess.hist.length - 1 : Math.max(0, cursor - 1);
      setCursor(i);
      setInput(sess.hist[i]);
    } else if (e.key === "ArrowDown" && cursor !== null) {
      e.preventDefault();
      const i = cursor + 1;
      if (i >= sess.hist.length) {
        setCursor(null);
        setInput("");
      } else {
        setCursor(i);
        setInput(sess.hist[i]);
      }
    } else if (e.key === "Tab" && complete) {
      e.preventDefault();
      let c: ReturnType<NonNullable<typeof complete>> = null;
      try {
        c = complete(input);
      } catch {}
      if (!c || !c.matches.length) return;
      const m = c.matches;
      let pre = m[0];
      for (const x of m) while (!x.startsWith(pre)) pre = pre.slice(0, -1);
      const base = input.slice(0, input.length - c.word.length);
      if (m.length === 1) setInput(base + m[0] + (m[0].endsWith("/") ? "" : " "));
      else if (pre.length > c.word.length) setInput(base + pre);
      else
        commit({
          ...sess,
          lines: [
            ...sess.lines,
            { id: sess.nextId, kind: "cmd", text: input, prompt: sess.buf ? "> " : sess.prompt },
            { id: sess.nextId + 1, kind: "out", text: m.join("   ") },
          ],
          nextId: sess.nextId + 2,
        });
    } else if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      commit({ ...sess, lines: [] });
    } else if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      commit({
        ...sess,
        lines: [...sess.lines, { id: sess.nextId, kind: "cmd", text: `${input}^C`, prompt: sess.buf ? "> " : sess.prompt }],
        nextId: sess.nextId + 1,
        buf: "",
      });
      setInput("");
    }
  };

  const reset = () => {
    if (persistKey) sessions.delete(persistKey);
    onReset?.();
  };

  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#22313b] bg-[#0f1a21] font-mono text-[13px] text-[#d6e2ea] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-[#22313b] px-3 py-2 text-xs text-[#7d909c]">
        <i className="size-[9px] rounded-full bg-[#ff5f57]" />
        <i className="size-[9px] rounded-full bg-[#febc2e]" />
        <i className="size-[9px] rounded-full bg-[#28c840]" />
        <span className="ml-1.5 min-w-0 flex-1 truncate">{title}</span>
        <button
          type="button"
          onClick={reset}
          title="Dựng lại môi trường ban đầu"
          className="cursor-pointer rounded-md bg-[#1e2a33] px-2 py-0.5 text-[11px] text-[#b9c7d1]"
        >
          Đặt lại
        </button>
      </div>
      <div
        ref={out}
        onClick={() => !window.getSelection()?.toString() && field.current?.focus()}
        style={{ height }}
        className="cursor-text overflow-y-auto whitespace-pre-wrap break-words px-3 pt-2.5 leading-normal"
      >
        {sess.lines.map((l) => (
          <div
            key={l.id}
            className={l.kind === "err" ? "text-[#ff9b85]" : l.kind === "dim" ? "text-[#7d909c]" : undefined}
          >
            {l.kind === "cmd" && <span className="text-[#6fd39b]">{l.prompt}</span>}
            {l.text}
          </div>
        ))}
      </div>
      <div className="flex items-center px-3 pb-2.5 pt-0.5">
        <span className="max-w-[60%] flex-none overflow-hidden whitespace-pre text-[#6fd39b]">
          {sess.buf ? "> " : sess.prompt}
        </span>
        <input
          ref={field}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Dòng lệnh"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base outline-0 [caret-color:#6fd39b] sm:text-[13px]"
        />
      </div>
    </div>
  );
}
