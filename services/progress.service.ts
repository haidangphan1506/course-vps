import type { ProgressSnapshot, ResultsSummary } from "@/lib/progress/contract";
import { request } from "./request";

/**
 * Service kết quả khoá học. Gọi gateway (RMQ → tutor-service → Postgres).
 * Chỉ chạy ở server (gọi từ server action), token lấy từ cookie httpOnly.
 */
export const progressService = {
  /** Kết quả học tập và lịch sử test của user đang đăng nhập. */
  getResults: (token: string) =>
    request<ResultsSummary>({
      method: "get",
      url: "/course-progress/results",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Đẩy tiến độ lên gateway; server lưu vào Postgres và trả về bản tổng hợp mới. */
  syncProgress: (token: string, snapshot: ProgressSnapshot) =>
    request<ResultsSummary>({
      method: "put",
      url: "/course-progress/sync",
      data: snapshot,
      headers: { Authorization: `Bearer ${token}` },
    }),
};
