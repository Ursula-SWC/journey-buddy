// Staff sign-in through Cloudflare Access.
// Access sits in front of /api/admin/* and adds a signed JWT to each request
// (the Cf-Access-Jwt-Assertion header). We still verify that JWT here, so the
// admin API stays closed even if the Access policy is ever misconfigured.

import type { Env } from "../env";
import { isLocalhost } from "../http";

export interface Staff {
  email: string;
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

let cachedKeys: { domain: string; fetchedAt: number; keys: Jwk[] } | null = null;
const KEY_CACHE_MS = 60 * 60 * 1000;

async function accessKeys(domain: string, forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && cachedKeys && cachedKeys.domain === domain && Date.now() - cachedKeys.fetchedAt < KEY_CACHE_MS) {
    return cachedKeys.keys;
  }
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Could not fetch Access keys (${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  cachedKeys = { domain, fetchedAt: Date.now(), keys: body.keys ?? [] };
  return cachedKeys.keys;
}

const b64urlBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const b64urlJson = <T>(s: string): T => JSON.parse(new TextDecoder().decode(b64urlBytes(s))) as T;

/** Returns the signed-in staff member, or null if the request isn't from staff. */
export async function getStaff(request: Request, env: Env): Promise<Staff | null> {
  // Local development: `wrangler dev` has no Access in front of it.
  if (env.DEV_STAFF_EMAIL && isLocalhost(request)) return { email: env.DEV_STAFF_EMAIL };

  const token = request.headers.get("cf-access-jwt-assertion");
  const domain = env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!token || !domain || !env.ACCESS_AUD) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  try {
    const header = b64urlJson<{ alg?: string; kid?: string }>(headerB64);
    if (header.alg !== "RS256" || !header.kid) return null;

    let jwk = (await accessKeys(domain)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await accessKeys(domain, true)).find((k) => k.kid === header.kid); // keys rotate
    if (!jwk) return null;

    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, b64urlBytes(sigB64), new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return null;

    const claims = b64urlJson<{ aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string }>(payloadB64);
    const now = Date.now() / 1000;
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(env.ACCESS_AUD)) return null;
    if (claims.iss !== `https://${domain}`) return null;
    if (typeof claims.exp !== "number" || claims.exp < now) return null;
    if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;
    if (!claims.email) return null;

    return { email: claims.email };
  } catch {
    return null;
  }
}
