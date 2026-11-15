import { AxiosError, type AxiosRequestConfig } from "axios";
import { http } from "@/config/axios";
import { env } from "@/lib/env";

export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status?: number; message?: string };

/** Gateway bọc mọi response trong `{ statusCode, message, data, ... }` (ResponseInterceptor). */
function unwrap<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** Gọi API và chuẩn hoá kết quả/lỗi, không ném exception. */
export async function request<T = unknown>(config: AxiosRequestConfig): Promise<ApiResult<T>> {
  if (!env.apiUrl) return { ok: false, message: "Server chưa cấu hình API_URL." };
  try {
    const res = await http.request<T>(config);
    if (process.env.NODE_ENV !== "production") console.log("[api]", config.method, config.url, res.status);
    return { ok: true, data: unwrap<T>(res.data) };
  } catch (e) {
    if (e instanceof AxiosError) {
      if (e.response) {
        const body = e.response.data as
          | { message?: string; errors?: { message?: string }[] }
          | undefined;
        const message = body?.errors?.[0]?.message ?? body?.message;
        return { ok: false, status: e.response.status, message };
      }
      return { ok: false, message: "Không kết nối được tới API." };
    }
    throw e;
  }
}
