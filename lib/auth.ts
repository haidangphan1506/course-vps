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
