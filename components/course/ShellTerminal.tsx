"use client";

import type { Engine, Shell } from "@/lib/course/types";
import Terminal, { type ExecResult } from "./Terminal";

type Props = {
  engine: Engine;
  shell: Shell;
  host: string;
  user: string;
  persistKey: string;
  extraWelcome?: string;
  titleSuffix?: string;
  /** Gọi sau mỗi lệnh đã chạy xong (để chấm bài). */
  onRun: () => void;
  onReset: () => void;
};

/** Terminal nối với một Shell mô phỏng của engine. */
export default function ShellTerminal({
  engine,
  shell,
  host,
  user,
  persistKey,
  extraWelcome,
  titleSuffix,
  onRun,
  onReset,
}: Props) {
  const where =
    host === "vps"
      ? `Đang ở VPS ${engine.ip} với user ${user}.`
      : `Đang ở laptop của bạn (${user}).`;
  const welcome = `${where} Tab: gợi ý · ↑ ↓: lệnh cũ · Ctrl+L: xoá màn hình${extraWelcome ? `\n${extraWelcome}` : ""}`;

  return (
    <Terminal
      persistKey={persistKey}
      title={`${user}@${host}${titleSuffix ?? ""}`}
      welcome={welcome}
      prompt={() => shell.prompt()}
      complete={(line) => shell.complete(line)}
      execute={(text): ExecResult => {
        const r = shell.run(text);
        return { output: r.out, code: r.code, clear: r.clear, needMore: r.needMore };
      }}
      onCommand={(text, r) => {
        (shell.cmdLog ||= []).push({ t: text, out: (r && r.output) || "", code: (r && r.code) || 0 });
        onRun();
      }}
      onReset={onReset}
    />
  );
}
