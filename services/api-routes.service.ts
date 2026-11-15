import type { ApiCatalogDto, ApiRouteResultsDto } from "@/lib/progress/contract";
import { request } from "./request";

/** Kết quả check của tab API Route Checklist, lưu qua gateway → tutor-service → Postgres. */
export const apiRoutesService = {
  /** Danh mục route theo module (cùng hình dạng dữ liệu của trang checklist). */
  getCatalog: (token: string) =>
    request<ApiCatalogDto | null>({
      method: "get",
      url: "/api-routes/catalog",
      headers: { Authorization: `Bearer ${token}` },
    }),
  getResults: (token: string) =>
    request<ApiRouteResultsDto[]>({
      method: "get",
      url: "/api-routes/results",
      headers: { Authorization: `Bearer ${token}` },
    }),
  saveResult: (token: string, routeId: string, body: { status: string; doc: Record<string, unknown> }) =>
    request<ApiRouteResultsDto>({
      method: "put",
      url: `/api-routes/results/${encodeURIComponent(routeId)}`,
      data: body,
      headers: { Authorization: `Bearer ${token}` },
    }),
};
