// Gọi route nội bộ của dashboard (/api/api-routes/*) → gateway → Postgres. Chỉ dùng ở client component.

import type { ApiRouteResultsDto } from "@/lib/progress/contract";
import type { Catalog, Doc, Docs } from "./types";

const BASE = "/api/api-routes";

async function errorMessage(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message || `HTTP ${res.status}`;
}

/** Danh mục route từ gateway; null nếu chưa có phiên API hoặc gateway chưa có dữ liệu. */
export async function fetchCatalog(): Promise<Catalog | null> {
  try {
    const res = await fetch(`${BASE}/catalog`, { cache: "no-store" });
    if (!res.ok) return null;
    const c = (await res.json()) as Catalog;
    return Array.isArray(c?.items) ? c : null;
  } catch {
    return null;
  }
}

/** Kết quả test đã lưu; null nếu không đọc được (khi đó dùng lưu cục bộ). */
export async function fetchResults(): Promise<Docs | null> {
  try {
    const res = await fetch(`${BASE}/results`, { cache: "no-store" });
    if (!res.ok) return null;
    const rows = (await res.json()) as ApiRouteResultsDto[];
    if (!Array.isArray(rows)) return null;
    return Object.fromEntries(rows.map((r) => [r.routeId, { ...(r.doc as Doc), status: r.status } as Doc]));
  } catch {
    return null;
  }
}

export async function putResult(routeId: string, doc: Doc): Promise<void> {
  const res = await fetch(`${BASE}/results/${encodeURIComponent(routeId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: doc.status, doc }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}

const LOCAL_KEY = "rc-docs";
export function loadLocalDocs(): Docs {
  try {
    return (JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") as Docs) || {};
  } catch {
    return {};
  }
}
export function saveLocalDocs(docs: Docs) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(docs));
  } catch {
    /* hết dung lượng hoặc bị chặn: bỏ qua */
  }
}
