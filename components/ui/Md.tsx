/** Markdown rút gọn: `code` và **đậm**. Không dùng innerHTML. */
export default function Md({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith("`") && p.endsWith("`"))
          return (
            <code key={i} className="rounded bg-zinc-500/15 px-1.5 py-px font-mono text-[.88em] [overflow-wrap:anywhere]">
              {p.slice(1, -1)}
            </code>
          );
        if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
        return p;
      })}
    </>
  );
}
