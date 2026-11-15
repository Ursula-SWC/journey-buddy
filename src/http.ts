export const json = (body: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
};

export const error = (status: number, message: string): Response => json({ error: message }, { status });

/** Reads a JSON body, returning null instead of throwing on bad input. */
export async function readJson<T>(request: Request): Promise<T | null> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return null;
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const isLocalhost = (request: Request): boolean => {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};
