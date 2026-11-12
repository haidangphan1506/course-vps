"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Tên đăng nhập
        <input name="username" autoComplete="username" required autoFocus className="login-input" />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Mật khẩu
        <input name="password" type="password" autoComplete="current-password" required className="login-input" />
      </label>
      {error && (
        <p role="alert" className="rounded-[9px] bg-[var(--bad-soft)] px-3 py-2 text-[13px] text-[var(--bad)]">
          {error}
        </p>
      )}
      <button disabled={pending} className="login-btn">
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
