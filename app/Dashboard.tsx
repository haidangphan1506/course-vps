"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import { clearUser } from "@/store/authSlice";
import { useAppDispatch } from "@/store/hooks";
import { getParam, setParams } from "@/lib/url-state";
import { logout } from "./login/actions";

const TABS = [
  { key: "course", label: "Khoá học VPS Linux", src: null },
  { key: "tahoe", label: "Tahoe UI", src: "/data/tahoe.html" },
  { key: "api", label: "API Route Checklist", src: null },
  { key: "results", label: "Kết quả khoá học", src: null },
  { key: "vps", label: "Hướng dẫn VPS", src: "/data/vps-guide.html" },
] as const;

type Key = (typeof TABS)[number]["key"];

export default function Dashboard({ panels }: { panels: Partial<Record<Key, React.ReactNode>> }) {
  const [active, setActive] = useState<Key>("course");
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onLogout = () =>
    startTransition(async () => {
      await logout();
      dispatch(clearUser());
      router.replace("/login");
    });
  const [opened, setOpened] = useState<Key[]>(["course"]);

  const show = (k: Key) => {
    setActive(k);
    setOpened((o) => (o.includes(k) ? o : [...o, k]));
    setParams({ tab: k === "course" ? null : k });
  };

  useEffect(() => {
    // ?tab=… (ưu tiên) hoặc #… (link cũ)
    const h = (getParam("tab") ?? location.hash.slice(1)) as Key;
    if (TABS.some((t) => t.key === h) && h !== "course") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      show(h);
    }
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-clip bg-[#e9edf6] dark:bg-[#11141b]">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-black/10 bg-white/80 px-5 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-[#1c202c]/80">
        <h1 className="whitespace-nowrap text-[15px] font-bold tracking-tight">Bảng điều khiển dự án</h1>
        <Tabs variant="pill" label="Dự án" items={TABS} value={active} onChange={show} />
        <Button variant="ghost" className="ml-auto" disabled={pending} onClick={onLogout}>
          Đăng xuất
        </Button>
      </header>
      <main className="relative min-h-0 flex-1">
        {TABS.map((t) =>
          !opened.includes(t.key) ? null : (
            <div key={t.key} hidden={active !== t.key} className="absolute inset-0">
              {t.src ? (
                <iframe
                  title={t.label}
                  src={t.src}
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="h-full overflow-auto">{panels[t.key]}</div>
              )}
            </div>
          ),
        )}
      </main>
    </div>
  );
}
