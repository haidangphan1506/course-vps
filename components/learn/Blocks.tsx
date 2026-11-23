"use client";

import { useState } from "react";
import type { Block } from "@/lib/course/types";
import type { NoteBlock } from "@/lib/learn/steps";
import { IconSpark } from "./icons";

/** Markdown rút gọn: `code` và **đậm**. Không dùng innerHTML. */
export function Md({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, i) => {
        if (p.length > 2 && p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
        if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
        return p;
      })}
    </>
  );
}

const NOTE_LABEL: Record<string, string> = { tip: "Mẹo", warn: "Lưu ý", err: "Lỗi hay gặp" };

export function Note({ note, label }: { note: NoteBlock; label?: string }) {
  const kind = note.kind && note.kind in NOTE_LABEL ? note.kind : "info";
  return (
    <div className={`ds-note ds-note--${kind}`}>
      <span className="ds-note__icon">
        <IconSpark size={13} />
      </span>
      <div className="min-w-0">
        <div className="ds-label">{label ?? NOTE_LABEL[kind] ?? "Ghi chú"}</div>
        <div className="ds-note__text">
          <Md text={note.note} />
        </div>
      </div>
    </div>
  );
}

function Code({ lines, cap }: { lines: string[]; cap?: string }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <figure className="ds-code">
      <pre>{text}</pre>
      <button type="button" className="ds-code__copy" onClick={copy}>
        {copied ? "Đã chép" : "Chép"}
      </button>
      {cap && (
        <figcaption>
          <Md text={cap} />
        </figcaption>
      )}
    </figure>
  );
}

export function BlockView({ b }: { b: Block }) {
  if (typeof b === "string")
    return (
      <p className="ds-p">
        <Md text={b} />
      </p>
    );
  if ("pre" in b) return <Code lines={b.pre} cap={b.cap} />;
  if ("tbl" in b) {
    const [head, ...rows] = b.tbl;
    return (
      <div className="ds-table">
        <table>
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i}>
                  <Md text={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>
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
      <ul className="ds-ul">
        {b.ul.map((x, i) => (
          <li key={i}>
            <Md text={x} />
          </li>
        ))}
      </ul>
    );
  return <Note note={b} />;
}
