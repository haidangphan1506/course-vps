import { cookies } from "next/headers";
import { getApiToken } from "@/lib/auth";
import { COOKIE, getSessionUser } from "@/lib/session";
import { apiRoutesService } from "@/services/api-routes.service";

/** Route nội bộ cho trang checklist (chạy trong iframe, không gọi trực tiếp được server action). */
export async function GET() {
  const user = await getSessionUser((await cookies()).get(COOKIE)?.value);
  const token = user ? await getApiToken() : undefined;
  if (!token) return Response.json({ message: "Chưa có phiên API." }, { status: 401 });
  const r = await apiRoutesService.getResults(token);
  return r.ok ? Response.json(r.data) : Response.json({ message: r.message }, { status: r.status ?? 502 });
}
