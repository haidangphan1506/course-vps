"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, MAX_AGE, createToken } from "@/lib/session";

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function login(_: string | undefined, formData: FormData) {
  const user = String(formData.get("username") ?? "");
  const pass = String(formData.get("password") ?? "");
  const u = process.env.AUTH_USER;
  const p = process.env.AUTH_PASSWORD;
  if (!u || !p) return "Server chưa cấu hình AUTH_USER / AUTH_PASSWORD.";
  if (!same(user, u) || !same(pass, p)) return "Sai tên đăng nhập hoặc mật khẩu.";

  (await cookies()).set(COOKIE, await createToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
