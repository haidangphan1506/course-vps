"use client";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import CopyButton from "@/components/ui/CopyButton";
import Md from "@/components/ui/Md";
import type { Block, TheoryCard } from "@/lib/course/types";

const TAG: Record<string, string> = {
  "Lưu ý": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "Quy trình": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};
const NOTE: Record<string, string> = {
  warn: "border-amber-500 bg-amber-500/10",
  tip: "border-emerald-500 bg-emerald-500/10",
};

function BlockView({ b }: { b: Block }) {
  if (typeof b === "string")
    return (
      <p className="mb-2.5 max-w-[72ch]">
        <Md text={b} />
      </p>
    );
  if ("pre" in b) {
    const text = b.pre.join("\n");
    return (
      <div className="relative mb-2.5">
        <pre className="m-0 overflow-x-auto whitespace-pre rounded-xl bg-[#0f1a21] px-3.5 py-3 font-mono text-[13px] leading-relaxed text-[#d6e2ea]">
          {text}
        </pre>
        <CopyButton text={text} className="absolute right-1.5 top-1.5" />
        {b.cap && <div className="mt-1 text-xs text-zinc-500">{b.cap}</div>}
      </div>
    );
  }
  if ("tbl" in b) {
    const [head, ...rows] = b.tbl;
    return (
      <div className="mb-2.5 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i} className="bg-zinc-500/10 p-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <Md text={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-black/10 align-top dark:border-white/10">
                {r.map((c, ci) => (
                  <td key={ci} className="p-2">
                    <Md text={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if ("ul" in b)
    return (
      <ul className="mb-2.5 list-disc pl-5">
        {b.ul.map((x, i) => (
          <li key={i} className="my-1">
            <Md text={x} />
          </li>
        ))}
      </ul>
    );
  return (
    <div className={`mb-2.5 rounded-r-lg border-l-[3px] px-3 py-2 text-sm ${NOTE[b.kind ?? ""] ?? "border-blue-600 bg-blue-600/10"}`}>
      <Md text={b.note} />
    </div>
  );
}

export default function Theory({ cards, onNext }: { cards: readonly TheoryCard[]; onNext?: () => void }) {
  return (
    <div className="grid gap-3.5">
      {cards.map((c, i) => (
        <Card key={i} className="min-w-0 p-4">
          <span
            className={`mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TAG[c.tag] ?? "bg-blue-600/10 text-blue-700 dark:text-blue-400"}`}
          >
            {c.tag}
          </span>
          <h3 className="mb-2.5 text-lg font-semibold tracking-tight">{c.title}</h3>
          {c.body.map((b, j) => (
            <BlockView key={j} b={b} />
          ))}
        </Card>
      ))}
      {onNext && (
        <div>
          <Button onClick={onNext}>Sang phần Quiz</Button>
        </div>
      )}
    </div>
  );
}
