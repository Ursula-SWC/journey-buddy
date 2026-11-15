// Shared-passcode sessions for charity users.
// Users type the passcode once; the phone then keeps a signed cookie for 90 days.
// The cookie holds only an expiry time and a signature: no names, no user records.

import type { Env } from "../env";
import { error, json, readJson } from "../http";

const COOKIE = "jb_session";
const SESSION_DAYS = 90;
const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const toB64Url = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64Url = (s: string): Uint8Array<ArrayBuffer> => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/** Compares two strings without leaking where they differ, by comparing their HMACs. */
async function sameSecret(a: string, b: string, secret: string): Promise<boolean> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(a));
  return crypto.subtle.verify("HMAC", key, sig, encoder.encode(b));
}

async function makeToken(env: Env, expires: number): Promise<string> {
  const payload = `v1.${expires}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), encoder.encode(payload));
  return `${payload}.${toB64Url(sig)}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** True if the request carries a valid, unexpired user session cookie. */
export async function hasUserSession(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) return false;
  const token = readCookie(request, COOKIE);
  if (!token) return false;
  const [version, expiresRaw, sig] = token.split(".");
  if (version !== "v1" || !expiresRaw || !sig) return false;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(env.SESSION_SECRET), fromB64Url(sig), encoder.encode(`v1.${expiresRaw}`));
  } catch {
    return false;
  }
}

/** POST /api/session  { "passcode": "..." } */
export async function startSession(request: Request, env: Env): Promise<Response> {
  if (!env.USER_PASSCODE || !env.SESSION_SECRET) return error(500, "The app isn't set up yet. Ask staff to set the passcode.");
  const body = await readJson<{ passcode?: unknown }>(request);
  const given = typeof body?.passcode === "string" ? body.passcode.trim() : "";
  // A short pause on every attempt slows down anyone trying to guess the passcode.
  await new Promise((r) => setTimeout(r, 400));
  if (!given || !(await sameSecret(given.toLowerCase(), env.USER_PASSCODE.trim().toLowerCase(), env.SESSION_SECRET))) {
    return error(401, "That passcode didn't work. Check with staff and try again.");
  }
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const token = await makeToken(env, Math.floor(Date.now() / 1000) + maxAge);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, {
    headers: { "set-cookie": `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}` },
  });
}

/** DELETE /api/session: forget the passcode on this phone. */
export function endSession(): Response {
  return json({ ok: true }, { headers: { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` } });
}
