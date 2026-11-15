import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { COOKIE, MAX_AGE, createToken } from "@/lib/session";

export async function setSession(user: string) {
  (await cookies()).set(COOKIE, await createToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

// Access token của gateway, lưu httpOnly để service phía server gắn Bearer khi gọi API.
const API_TOKEN_COOKIE = "api_token";

export async function setApiToken(token: string) {
  (await cookies()).set(API_TOKEN_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getApiToken(): Promise<string | undefined> {
  return (await cookies()).get(API_TOKEN_COOKIE)?.value;
}

export async function clearApiToken() {
  (await cookies()).delete(API_TOKEN_COOKIE);
}
