"use client";

import Link from "next/link";
import { useActionState } from "react";
import Button from "@/components/ui/Button";
import Field from "@/components/auth/Field";
import FormError from "@/components/auth/FormError";
import { useAuthRedirect } from "@/lib/useAuthRedirect";
import { register } from "./actions";

export default function RegisterForm() {
  const [state, action, pending] = useActionState(register, undefined);
  useAuthRedirect(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Họ" name="lastName" autoComplete="family-name" autoFocus />
        <Field label="Tên" name="firstName" autoComplete="given-name" />
      </div>
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.email} />
      <Field label="Mật khẩu" name="password" type="password" autoComplete="new-password" minLength={8} />
      <Field label="Nhập lại mật khẩu" name="confirm" type="password" autoComplete="new-password" minLength={8} />
      <FormError message={state?.error} />
      <Button disabled={pending}>
        {pending ? "Đang tạo tài khoản…" : "Đăng ký"}
      </Button>
      <p className="text-center text-[13px] text-[var(--mute)]">
        Đã có tài khoản?{" "}
        <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
          Đăng nhập
        </Link>
      </p>
    </form>
  );
}
