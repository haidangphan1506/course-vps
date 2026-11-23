"use client";

import { useState } from "react";
import { done, total } from "@/lib/course/progress";
import type { Group } from "@/lib/learn/steps";
import type { CourseState } from "@/store/courseSlice";
import { IconCheckCircle, IconChevron, IconCircle, IconFolder, IconHalfCircle } from "./icons";

type Props = {
  groups: readonly Group[];
  cur: string;
  p: CourseState;
  open: boolean;
  onPick: (lessonId: string) => void;
  onResults: () => void;
};

export default function Sidebar({ groups, cur, p, open, onPick, onResults }: Props) {
  const curGroup = groups.find((g) => g.lessons.some((l) => l.id === cur))?.name;
  // Mặc định chỉ mở nhóm chứa bài đang học; người dùng tự mở/đóng các nhóm khác.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (name: string) => toggled[name] ?? name === curGroup;

  const all = groups.flatMap((g) => g.lessons);
  const sumDone = all.reduce((a, l) => a + done(l, p), 0);
  const sumTotal = all.reduce((a, l) => a + total(l), 0);
  const lessonsDone = all.filter((l) => done(l, p) === total(l)).length;
  const pct = sumTotal ? Math.round((sumDone / sumTotal) * 100) : 0;

  return (
    <aside className={`ds-side ${open ? "is-open" : ""}`} aria-label="Danh sách bài học">
      <div className="ds-side__head">
        <IconFolder color="var(--ink)" size={17} />
        <b>Khoá học</b>
        <small>{all.length} bài</small>
      </div>

      <div className="ds-tree">
        {groups.map((g) => {
          const opened = isOpen(g.name);
          const gDone = g.lessons.filter((l) => done(l, p) === total(l)).length;
          return (
            <div key={g.name} className="ds-tree__group">
              <button
                type="button"
                className="ds-tree__folder"
                aria-expanded={opened}
                onClick={() => setToggled((t) => ({ ...t, [g.name]: !opened }))}
              >
                <IconChevron size={12} className={`ds-tree__chev ${opened ? "is-open" : ""}`} />
                <IconFolder color={g.color} open={opened} />
                <span className="truncate">
                  {g.num}. {g.name}
                </span>
                <small>
                  {gDone}/{g.lessons.length}
                </small>
              </button>
              {opened && (
                <ul className="ds-tree__list">
                  {g.lessons.map((l) => {
                    const d = done(l, p);
                    const t = total(l);
                    const Icon = d === t ? IconCheckCircle : d > 0 ? IconHalfCircle : IconCircle;
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          className={`ds-tree__item ${l.id === cur ? "is-active" : ""} ${d === t ? "is-done" : ""}`}
                          aria-current={l.id === cur ? "page" : undefined}
                          title={`${l.title} · ${d}/${t}`}
                          onClick={() => onPick(l.id)}
                        >
                          <Icon size={13} />
                          <span className="truncate">{l.short}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="ds-progress" onClick={onResults}>
        <span className="ds-label">Tiến độ</span>
        <span className="ds-progress__num">
          {lessonsDone} / {all.length} bài · {pct}%
        </span>
        <IconChevron size={12} />
        <span className="ds-progress__bar">
          <i style={{ width: `${pct}%` }} />
        </span>
      </button>
    </aside>
  );
}
