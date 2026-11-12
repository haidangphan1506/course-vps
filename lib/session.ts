export const COOKIE = "session";
export const MAX_AGE = 60 * 60 * 24 * 7;

const enc = new TextEncoder();

async function hmac(data: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createToken(user: string) {
  const payload = `${encodeURIComponent(user)}.${Date.now() + MAX_AGE * 1000}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyToken(token: string | undefined) {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const exp = Number(payload.split(".")[1]);
  if (!exp || exp < Date.now()) return false;
  const expected = await hmac(payload);
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let k = 0; k < sig.length; k++) diff |= sig.charCodeAt(k) ^ expected.charCodeAt(k);
  return diff === 0;
}
