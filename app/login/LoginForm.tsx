"use client";

import Link from "next/link";
import { useActionState } from "react";
import Button from "@/components/ui/Button";
import Field from "@/components/auth/Field";
import FormError from "@/components/auth/FormError";
import { useAuthRedirect } from "@/lib/useAuthRedirect";
import { login } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  useAuthRedirect(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.email} autoFocus />
      <Field label="Mật khẩu" name="password" type="password" autoComplete="current-password" />
      <FormError message={state?.error} />
      <Button disabled={pending}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
      <p className="text-center text-[13px] text-[var(--mute)]">
        Chưa có tài khoản?{" "}
        <Link href="/register" className="font-medium text-[var(--accent)] hover:underline">
          Đăng ký
        </Link>
      </p>
    </form>
  );
}
