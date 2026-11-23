"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { Lesson } from "@/lib/course/types";
import { fold, type Group } from "@/lib/learn/steps";
import { IconBook, IconChart, IconGrid, IconMenu, IconMoon, IconSearch, IconServer, IconSun } from "./icons";

export type View = "learn" | "results";
export type Theme = "light" | "dark";

type Props = {
  ip: string;
  groups: readonly Group[];
  view: View;
  onView: (v: View) => void;
  theme: Theme;
  onTheme: () => void;
  onPick: (lessonId: string) => void;
  onMenu: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};

export default function Header({ ip, groups, view, onView, theme, onTheme, onPick, onMenu, searchRef }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () =>
      groups.flatMap((g) =>
        g.lessons.map((l) => ({ l, g, hay: fold(`${l.short} ${l.title} ${l.dek} ${l.group} ${l.id}`) })),
      ),
    [groups],
  );
  const hits = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return index.filter((x) => words.every((w) => x.hay.includes(w))).slice(0, 8);
  }, [index, q]);

  const pick = (l: Lesson) => {
    onPick(l.id);
    setQ("");
    setOpen(false);
    searchRef.current?.blur();
  };

  return (
    <header className="ds-header">
      <button type="button" className="ds-iconbtn ds-only-narrow" aria-label="Mở danh sách bài" onClick={onMenu}>
        <IconMenu size={16} />
      </button>
      <div className="ds-brand">
        <span className="ds-brand__mark">$_</span>
        <span>
          Khoá học <mark>VPS Linux</mark>
        </span>
      </div>

      <nav className="ds-nav" aria-label="Điều hướng">
        <button type="button" className={`ds-nav__item ${view === "learn" ? "is-active" : ""}`} onClick={() => onView("learn")}>
          <IconBook /> Học
        </button>
        <button type="button" className={`ds-nav__item ${view === "results" ? "is-active" : ""}`} onClick={() => onView("results")}>
          <IconChart /> Kết quả
        </button>
        <Link href="/" className="ds-nav__item">
          <IconGrid /> Bảng điều khiển
        </Link>
      </nav>

      <div className="ds-header__right">
        <div
          ref={wrap}
          className="ds-search"
          onBlur={(e) => {
            if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
        >
          <IconSearch size={14} />
          <input
            ref={searchRef}
            value={q}
            placeholder="Tìm bài học, lệnh…"
            aria-label="Tìm bài học"
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter" && hits[hi]) {
                pick(hits[hi].l);
              } else if (e.key === "Escape") {
                setOpen(false);
                e.currentTarget.blur();
              }
            }}
          />
          <kbd>Ctrl K</kbd>
          {open && q.trim() && (
            <div className="ds-search__menu" role="listbox">
              {hits.length === 0 && <div className="ds-search__empty">Không có bài nào khớp “{q}”.</div>}
              {hits.map((x, i) => (
                <button
                  key={x.l.id}
                  type="button"
                  role="option"
                  aria-selected={i === hi}
                  className={`ds-search__hit ${i === hi ? "is-hi" : ""}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(x.l)}
                >
                  <i style={{ background: x.g.color }} />
                  <span className="truncate">{x.l.short}</span>
                  <small>{x.g.name}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="ds-iconbtn"
          aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
          onClick={onTheme}
        >
          {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>
        <div className="ds-chip" title="Địa chỉ VPS giả lập">
          <span className="ds-chip__icon">
            <IconServer size={13} />
          </span>
          <span>
            <small>VPS lab</small>
            {ip}
          </span>
        </div>
      </div>
    </header>
  );
}
