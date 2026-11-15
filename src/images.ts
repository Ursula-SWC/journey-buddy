// Stop photos, stored as BLOBs in D1.

import type { Env } from "./env";
import { error, json } from "./http";

export const MAX_IMAGE_BYTES = 1_900_000;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ImageRow { content_type: string; bytes: ArrayBuffer | Uint8Array | number[] }

/** GET /api/images/:id */
export async function serveImage(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT content_type, bytes FROM images WHERE id = ?").bind(id).first<ImageRow>();
  if (!row) return error(404, "Photo not found");
  // D1 returns BLOBs as an array of numbers.
  const bytes = new Uint8Array(row.bytes as ArrayLike<number> | ArrayBuffer);
  return new Response(bytes, {
    headers: {
      "content-type": row.content_type,
      // Image ids never change content, so phones can keep them (and use them offline).
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * POST /api/admin/images?alt=Photo%20of%20the%20stop
 * Body: the raw image bytes, with Content-Type image/jpeg, image/png or image/webp.
 * Resize photos before upload (about 1600px on the long side is plenty for a phone).
 */
export async function uploadImage(request: Request, env: Env): Promise<Response> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED.has(type)) return error(415, "Upload a JPEG, PNG or WebP image.");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_IMAGE_BYTES) return error(413, "That photo is too big. Resize it to under 1.9 MB and try again.");

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return error(400, "The upload was empty.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) return error(413, "That photo is too big. Resize it to under 1.9 MB and try again.");
  if (!looksLike(type, bytes)) return error(415, "That file doesn't look like the image type it says it is.");

  const alt = (new URL(request.url).searchParams.get("alt") ?? "").slice(0, 300);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO images (id, content_type, bytes, alt) VALUES (?, ?, ?, ?)").bind(id, type, bytes, alt).run();
  return json({ id, url: `/api/images/${id}`, bytes: bytes.byteLength }, { status: 201 });
}

/** DELETE /api/admin/images/:id  (stops using it fall back to "photo coming soon") */
export async function deleteImage(env: Env, id: string): Promise<Response> {
  const res = await env.DB.prepare("DELETE FROM images WHERE id = ?").bind(id).run();
  return res.meta.changes ? json({ ok: true }) : error(404, "Photo not found");
}

function looksLike(type: string, b: Uint8Array): boolean {
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === "image/webp") {
    const tag = (i: number) => String.fromCharCode(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0);
    return tag(0) === "RIFF" && tag(8) === "WEBP";
  }
  return false;
}
