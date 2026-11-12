"use client";

import { useEffect, useState } from "react";
import { logout } from "./login/actions";

const TABS = [
  { k: "course", label: "Khoá học VPS Linux", src: "/data/course.html" },
  { k: "tahoe", label: "Tahoe UI", src: "/data/tahoe.html" },
  { k: "api", label: "API Route Checklist", src: "/data/api.html" },
  { k: "results", label: "Kết quả khoá học", src: null },
  { k: "vps", label: "Hướng dẫn VPS", src: "/data/vps-guide.html" },
] as const;

type Key = (typeof TABS)[number]["k"];

export default function Dashboard({ results }: { results: React.ReactNode }) {
  const [active, setActive] = useState<Key>("course");
  const [opened, setOpened] = useState<Key[]>(["course"]);

  const show = (k: Key) => {
    setActive(k);
    setOpened((o) => (o.includes(k) ? o : [...o, k]));
    history.replaceState(null, "", "#" + k);
  };

  useEffect(() => {
    const h = location.hash.slice(1) as Key;
    if (TABS.some((t) => t.k === h) && h !== "course") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      show(h);
    }
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#e9edf6] dark:bg-[#11141b]">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-black/10 bg-white/80 px-5 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-[#1c202c]/80">
        <h1 className="whitespace-nowrap text-[15px] font-bold tracking-tight">Bảng điều khiển dự án</h1>
        <div role="tablist" aria-label="Dự án" className="flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-black/[.08] p-[3px] dark:bg-white/[.08]">
          {TABS.map((t) => (
            <button
              key={t.k}
              role="tab"
              aria-selected={active === t.k}
              onClick={() => show(t.k)}
              className={`cursor-pointer whitespace-nowrap rounded-lg px-3 py-1.5 text-sm outline-offset-1 focus-visible:outline-2 focus-visible:outline-blue-600 ${
                active === t.k
                  ? "bg-white font-semibold shadow dark:bg-white/15"
                  : "font-medium"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form action={logout} className="ml-auto">
          <button className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-black/[.08] dark:hover:bg-white/[.08]">Đăng xuất</button>
        </form>
      </header>
      <main className="relative min-h-0 flex-1">
        {TABS.map((t) =>
          !opened.includes(t.k) ? null : (
            <div key={t.k} hidden={active !== t.k} className="absolute inset-0">
              {t.src ? (
                <iframe title={t.label} src={t.src} className="h-full w-full border-0" />
              ) : (
                <div className="h-full overflow-auto">{results}</div>
              )}
            </div>
          ),
        )}
      </main>
    </div>
  );
}
