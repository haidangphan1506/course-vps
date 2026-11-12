import raw from "./progress.json";

type Progress = {
  labs: Record<string, boolean[]>;
  hist: { l: string; s: number; n: number; t: number }[];
  flag: Record<string, Record<string, boolean>>;
};
const D = raw as unknown as Progress;

const ORDER: [string, string, string][] = [
  ["c1", "Linux và SSH", "Nền tảng"],
  ["lb1", "Hệ thống file", "Linux căn bản"],
  ["lb1-2", "Hệ thống file (phần 2)", "Linux căn bản"],
  ["lb2", "Quyền và sở hữu", "Linux căn bản"],
  ["lb2-2", "Quyền và sở hữu (phần 2)", "Linux căn bản"],
  ["lb3", "Shell hằng ngày", "Linux căn bản"],
  ["lb3-2", "Shell hằng ngày (phần 2)", "Linux căn bản"],
  ["lb4", "Chuyển hướng và pipe", "Linux căn bản"],
  ["c5a", "Docker cơ bản", "Ứng dụng"],
  ["c2a", "Bảo mật: cổng và tường lửa", "Nền tảng"],
];

const pad = (n: number) => String(n).padStart(2, "0");

function Pill({ kind, children }: { kind: "full" | "part" | "none"; children: React.ReactNode }) {
  const cls = {
    full: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    part: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    none: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400",
  }[kind];
  return <span className={`ml-1 inline-block rounded-full px-2 text-xs font-semibold ${cls}`}>{children}</span>;
}

export default function Results() {
  const rows = ORDER.map(([id, name, group]) => {
    const runs = D.hist.filter((x) => x.l === id);
    const best = runs.reduce<(typeof runs)[number] | null>((b, x) => (!b || x.s > b.s ? x : b), null);
    const labs = D.labs[id] ?? [];
    const ld = labs.filter(Boolean).length;
    const flags = Object.values(D.flag[id] ?? {}).filter(Boolean).length;
    return { id, name, group, best, tries: runs.length, ld, lt: labs.length, flags };
  });

  const done = rows.filter((r) => r.best);
  const tQ = done.reduce((a, r) => a + r.best!.s, 0);
  const tQn = done.reduce((a, r) => a + r.best!.n, 0);
  const nDone = done.length;
  const tL = rows.reduce((a, r) => a + r.ld, 0);
  const tLn = rows.reduce((a, r) => a + r.lt, 0);

  const d = new Date(Math.max(...D.hist.map((x) => x.t)));
  const last = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const cards = [
    [`${tQ} / ${tQn}`, "Tổng điểm quiz tốt nhất"],
    [`${nDone} / ${ORDER.length}`, "Bài đã làm quiz"],
    [`${tL} / ${tLn}`, "Lab đã hoàn thành"],
    [`${Math.round((tL / tLn) * 100)}%`, "Tỷ lệ lab"],
  ];

  return (
    <div className="w-full px-5 py-4">
      <h1 className="text-lg font-semibold">Kết quả khoá học VPS Linux</h1>
      <p className="mb-4 text-sm text-zinc-500">
        Ảnh chụp lúc 08/11/2026 20:04 (giờ VN). Lần làm quiz gần nhất: {last}.
      </p>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        {cards.map(([v, l]) => (
          <div key={l} className="rounded-xl border border-black/10 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-zinc-900">
            <b className="block text-xl">{v}</b>
            <span className="text-xs text-zinc-500">{l}</span>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-500/10 text-left text-xs text-zinc-500">
              <th className="p-2.5">Bài</th>
              <th className="p-2.5 text-right">Quiz (điểm tốt nhất)</th>
              <th className="p-2.5 text-right">Số lần làm</th>
              <th className="p-2.5">Lab</th>
              <th className="p-2.5 text-right">Câu đánh dấu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-black/10 align-top dark:border-white/10">
                <td className="p-2.5">
                  <div>{r.name}</div>
                  <div className="text-xs text-zinc-500">{r.group}</div>
                </td>
                <td className="whitespace-nowrap p-2.5 text-right">
                  {r.best ? (
                    <>
                      {r.best.s} / {r.best.n}
                      <Pill kind={r.best.s === r.best.n ? "full" : "part"}>
                        {r.best.s === r.best.n ? "đạt tối đa" : "chưa tối đa"}
                      </Pill>
                    </>
                  ) : (
                    <Pill kind="none">chưa làm</Pill>
                  )}
                </td>
                <td className="p-2.5 text-right">{r.tries}</td>
                <td className="p-2.5">
                  {r.lt ? (
                    <>
                      {r.ld} / {r.lt}
                      <div className="mt-1 h-1.5 min-w-[90px] overflow-hidden rounded bg-zinc-500/20">
                        <i className="block h-full bg-blue-600 dark:bg-blue-400" style={{ width: `${Math.round((r.ld / r.lt) * 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <Pill kind="none">chưa có</Pill>
                  )}
                </td>
                <td className="p-2.5 text-right">{r.flags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Số liệu là ảnh chụp tiến độ, không tự cập nhật.
      </p>
    </div>
  );
}
