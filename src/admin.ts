// Staff-only API. Every handler here runs after getStaff() has confirmed a Cloudflare Access sign-in.
// Timetable times come from the seed/import script; staff edit the human parts: stop notes and photos.

import type { Env } from "./env";
import type { Staff } from "./auth/access";
import { error, json, readJson } from "./http";

const MAX_NOTES = 10;
const MAX_NOTE_LEN = 200;

interface StopUpdate {
  name?: unknown;
  area?: unknown;
  photoId?: unknown;
  landmarks?: unknown;
  tips?: unknown;
  safety?: unknown;
}

/** GET /api/admin/me */
export const whoAmI = (staff: Staff): Response => json({ email: staff.email });

function noteList(value: unknown, label: string): string[] | string {
  if (!Array.isArray(value)) return `${label} must be a list of sentences.`;
  const notes = value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  if (notes.length > MAX_NOTES) return `Keep ${label} to ${MAX_NOTES} or fewer.`;
  if (notes.some((n) => n.length > MAX_NOTE_LEN)) return `Each of the ${label} should be under ${MAX_NOTE_LEN} characters.`;
  return notes;
}

/**
 * PUT /api/admin/stops/:id
 * Body (all optional): { name, area, photoId (string or null), landmarks: [], tips: [], safety: [] }
 * Note lists replace what's there.
 */
export async function updateStop(request: Request, env: Env, stopId: string): Promise<Response> {
  const body = await readJson<StopUpdate>(request);
  if (!body) return error(400, "Send the changes as JSON.");

  const exists = await env.DB.prepare("SELECT 1 FROM stops WHERE id = ?").bind(stopId).first();
  if (!exists) return error(404, "Stop not found");

  const statements: D1PreparedStatement[] = [];
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const field of ["name", "area"] as const) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) return error(400, `${field} must be some text.`);
    sets.push(`${field} = ?`);
    values.push((body[field] as string).trim().slice(0, 120));
  }
  if (body.photoId !== undefined) {
    if (body.photoId !== null && typeof body.photoId !== "string") return error(400, "photoId must be an image id or null.");
    if (typeof body.photoId === "string") {
      const img = await env.DB.prepare("SELECT 1 FROM images WHERE id = ?").bind(body.photoId).first();
      if (!img) return error(400, "That photo hasn't been uploaded.");
    }
    sets.push("photo_id = ?");
    values.push(body.photoId);
  }
  if (sets.length) {
    statements.push(
      env.DB.prepare(`UPDATE stops SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
        .bind(...values, stopId),
    );
  }

  const kinds = [["landmarks", "landmark"], ["tips", "tip"], ["safety", "safety"]] as const;
  for (const [field, kind] of kinds) {
    if (body[field] === undefined) continue;
    const notes = noteList(body[field], field);
    if (typeof notes === "string") return error(400, notes);
    statements.push(env.DB.prepare("DELETE FROM stop_notes WHERE stop_id = ? AND kind = ?").bind(stopId, kind));
    notes.forEach((text, i) =>
      statements.push(env.DB.prepare("INSERT INTO stop_notes (stop_id, kind, position, text) VALUES (?, ?, ?, ?)").bind(stopId, kind, i, text)));
  }

  if (!statements.length) return error(400, "Nothing to change.");
  await env.DB.batch(statements); // a batch runs as one transaction
  return json({ ok: true });
}
