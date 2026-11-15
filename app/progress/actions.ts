"use server";

import type { ApiResult } from "@/services";
import { cookies } from "next/headers";
import { getApiToken } from "@/lib/auth";
import { COOKIE, getSessionUser } from "@/lib/session";
import type { ProgressSnapshot, ResultsSummary } from "@/lib/progress/contract";
import { progressService } from "@/services/progress.service";

const NO_API_SESSION = "Tài khoản này chưa có phiên API. Hãy đăng nhập lại bằng tài khoản hệ thống.";

/** Lấy token gateway của user đang đăng nhập; null nếu chưa đăng nhập hoặc không có phiên API. */
async function apiToken(): Promise<string | null> {
  const user = await getSessionUser((await cookies()).get(COOKIE)?.value);
  if (!user) return null;
  return (await getApiToken()) ?? null;
}

/** UI gọi action này → service → gateway → tutor-service → Postgres. */
export async function syncProgress(snapshot: ProgressSnapshot): Promise<ApiResult<ResultsSummary>> {
  const token = await apiToken();
  if (!token) return { ok: false, message: NO_API_SESSION };
  return progressService.syncProgress(token, snapshot);
}

export async function fetchResults(): Promise<ApiResult<ResultsSummary>> {
  const token = await apiToken();
  if (!token) return { ok: false, message: NO_API_SESSION };
  return progressService.getResults(token);
}
