export type Tokens = { accessToken: string; refreshToken: string | null };

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (typeof o[k] === "string" && o[k]) return o[k] as string;
  return null;
};

/** Tách access/refresh token từ response API (envelope `{ data: {...} }`, hoặc lồng `tokens`). */
export function extractTokens(body: unknown): Tokens | null {
  const queue: unknown[] = [body];
  for (let depth = 0; queue.length && depth < 12; depth++) {
    const o = queue.shift();
    if (!o || typeof o !== "object") continue;
    const rec = o as Record<string, unknown>;
    const accessToken = pick(rec, ["accessToken", "access_token", "token"]);
    if (accessToken) return { accessToken, refreshToken: pick(rec, ["refreshToken", "refresh_token"]) };
    queue.push(rec.data, rec.tokens, rec.result);
  }
  return null;
}
