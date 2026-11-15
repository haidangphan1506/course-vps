"use server";

import { timingSafeEqual } from "node:crypto";
import { clearApiToken, clearSession, setApiToken, setSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { authService } from "@/services";

export type AuthState = { error?: string; user?: string; email?: string } | undefined;

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const user = String(formData.get("email") ?? "");
  const pass = String(formData.get("password") ?? "");
  const u = env.authUser;
  const p = env.authPassword;
  const envOk = !!u && !!p && same(user, u) && same(pass, p);
  if (!envOk) {
    const r = await authService.login(user, pass);
    if (!r.ok) return { error: r.message ?? "Sai email hoặc mật khẩu.", email: user };
    await setApiToken((r.data as { accessToken: string }).accessToken);
  } else {
    // Tài khoản cấu hình trong env không có phiên gateway.
    await clearApiToken();
  }

  await setSession(user);
  return { user };
}

export async function logout() {
  await clearSession();
  await clearApiToken();
}
