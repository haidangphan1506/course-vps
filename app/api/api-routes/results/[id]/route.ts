import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getApiToken } from "@/lib/auth";
import { COOKIE, getSessionUser } from "@/lib/session";
import { apiRoutesService } from "@/services/api-routes.service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser((await cookies()).get(COOKIE)?.value);
  const token = user ? await getApiToken() : undefined;
  if (!token) return Response.json({ message: "Chưa có phiên API." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { status?: string; doc?: Record<string, unknown> } | null;
  if (!body || typeof body.status !== "string" || typeof body.doc !== "object" || body.doc === null)
    return Response.json({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
  const r = await apiRoutesService.saveResult(token, id, { status: body.status, doc: body.doc });
  return r.ok ? Response.json(r.data) : Response.json({ message: r.message }, { status: r.status ?? 502 });
}
