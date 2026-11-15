import { cookies } from "next/headers";
import { getApiToken } from "@/lib/auth";
import { COOKIE, getSessionUser } from "@/lib/session";
import { apiRoutesService } from "@/services/api-routes.service";

/** Danh mục route cho trang checklist (route nội bộ: trang chạy trong iframe và đọc bằng fetch). */
export async function GET() {
  const user = await getSessionUser((await cookies()).get(COOKIE)?.value);
  const token = user ? await getApiToken() : undefined;
  if (!token) return Response.json({ message: "Chưa có phiên API." }, { status: 401 });
  const r = await apiRoutesService.getCatalog(token);
  if (!r.ok) return Response.json({ message: r.message }, { status: r.status ?? 502 });
  if (!r.data) return Response.json({ message: "Chưa có dữ liệu danh mục route." }, { status: 404 });
  return Response.json(r.data);
}
