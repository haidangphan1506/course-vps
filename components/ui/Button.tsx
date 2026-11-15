const variants = {
  primary: "login-btn",
  ghost:
    "cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-black/[.08] dark:hover:bg-white/[.08]",
};

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: { variant?: keyof typeof variants } & React.ComponentProps<"button">) {
  return <button className={`${variants[variant]} ${className}`} {...props} />;
}
