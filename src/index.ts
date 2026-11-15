// Journey Buddy Worker: serves the front end from public/ and the API under /api.
//
//   Public                      POST /api/session          passcode -> session cookie
//                               DELETE /api/session        forget this phone
//   Users (passcode) or staff   GET  /api/timetable        stops, routes and times
//                               GET  /api/images/:id       a stop photo
//   Staff (Cloudflare Access)   GET  /api/admin/me
//                               POST /api/admin/images     upload a photo
//                               DELETE /api/admin/images/:id
//                               PUT  /api/admin/stops/:id  edit stop name, notes, photo

import type { Env } from "./env";
import { error, json } from "./http";
import { endSession, hasUserSession, startSession } from "./auth/passcode";
import { getStaff } from "./auth/access";
import { loadTimetable } from "./timetable";
import { deleteImage, serveImage, uploadImage } from "./images";
import { updateStop, whoAmI } from "./admin";

const ID = "([A-Za-z0-9_-]{1,64})";
const route = (pattern: string) => new RegExp(`^${pattern}$`);
const ROUTES = {
  image: route(`/api/images/${ID}`),
  adminImage: route(`/api/admin/images/${ID}`),
  adminStop: route(`/api/admin/stops/${ID}`),
};

async function handleApi(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;
  let m: RegExpMatchArray | null;

  if (pathname === "/api/session") {
    if (method === "POST") return startSession(request, env);
    if (method === "DELETE") return endSession();
    return error(405, "Method not allowed");
  }

  if (pathname.startsWith("/api/admin/")) {
    const staff = await getStaff(request, env);
    if (!staff) return error(403, "Staff sign-in required.");
    if (pathname === "/api/admin/me" && method === "GET") return whoAmI(staff);
    if (pathname === "/api/admin/images" && method === "POST") return uploadImage(request, env);
    if ((m = pathname.match(ROUTES.adminImage)) && method === "DELETE") return deleteImage(env, m[1]!);
    if ((m = pathname.match(ROUTES.adminStop)) && method === "PUT") return updateStop(request, env, m[1]!);
    return error(404, "Not found");
  }

  // Everything else needs the shared passcode (or a staff sign-in).
  const allowed = (await hasUserSession(request, env)) || (await getStaff(request, env)) !== null;
  if (!allowed) return error(401, "Passcode needed.");

  if (pathname === "/api/timetable" && method === "GET") {
    return json(await loadTimetable(env), { headers: { "cache-control": "private, no-cache" } });
  }
  if ((m = pathname.match(ROUTES.image)) && method === "GET") return serveImage(env, m[1]!);

  return error(404, "Not found");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (e) {
        console.error("API error", e);
        return error(500, "Something went wrong. Please try again.");
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
