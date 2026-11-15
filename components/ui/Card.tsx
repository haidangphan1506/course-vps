export default function Card({ className = "", ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={`rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900 ${className}`}
      {...props}
    />
  );
}
