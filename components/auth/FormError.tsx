export default function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[9px] bg-[var(--bad-soft)] px-3 py-2 text-[13px] text-[var(--bad)]">
      {message}
    </p>
  );
}
