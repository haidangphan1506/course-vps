export default function Field({ label, ...input }: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium">
      {label}
      <input required className="login-input" {...input} />
    </label>
  );
}
