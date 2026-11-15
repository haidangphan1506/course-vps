"use server";

import type { AuthState } from "@/app/login/actions";
import { setApiToken, setSession } from "@/lib/auth";
import { authService } from "@/services";

export async function register(_: AuthState, formData: FormData): Promise<AuthState> {
  const user = String(formData.get("email") ?? "").trim().toLowerCase();
  const pass = String(formData.get("password") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) || user.length > 254)
    return { error: "Email không hợp lệ.", email: user };
  if (!firstName || !lastName) return { error: "Vui lòng nhập họ và tên.", email: user };
  if (pass.length < 8) return { error: "Mật khẩu tối thiểu 8 ký tự.", email: user };
  if (pass !== confirm) return { error: "Mật khẩu nhập lại không khớp.", email: user };
  const r = await authService.register({ email: user, password: pass, firstName, lastName });
  if (!r.ok) return { error: r.message ?? "Đăng ký thất bại.", email: user };
  const accessToken = (r.data as { accessToken?: string } | undefined)?.accessToken;
  if (accessToken) await setApiToken(accessToken);

  await setSession(user);
  return { user };
}
