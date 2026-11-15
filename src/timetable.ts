// Builds the timetable the front end needs from D1, in the same shape the prototype's
// JOURNEY_DATA used, so the app's journey search works unchanged.

import type { Env } from "./env";

type Dir = "out" | "back";
type DayCode = "MF" | "SA" | "SU";

export interface Timetable {
  meta: { sample: boolean; note: string; updated: string; helpline: { name: string; phone: string } };
  stops: Record<string, {
    name: string; area: string; lat: number | null; lon: number | null; photo: string | null;
    landmarks: string[]; tips: string[]; safety: string[];
  }>;
  routes: Array<{
    id: string; number: string; name: string; kind: string;
    headsign: Record<Dir, string>;
    fare: { single: number; return: number };
    busy: Array<{ days: DayCode[]; from: string; to: string; note: string }>;
    patterns: Partial<Record<Dir, Array<{ stop: string; offset: number }>>>;
    trips: Array<{ dir: Dir; days: DayCode[]; times: string[] }>;
  }>;
}

interface StopRow { id: string; name: string; area: string; lat: number | null; lon: number | null; photo_id: string | null }
interface NoteRow { stop_id: string; kind: "landmark" | "tip" | "safety"; text: string }
interface RouteRow {
  id: string; number: string; name: string; kind: string; headsign_out: string; headsign_back: string;
  fare_single_pence: number; fare_return_pence: number;
}
interface RouteStopRow { route_id: string; dir: Dir; stop_id: string; offset_min: number }
interface TripRow { route_id: string; dir: Dir; days: DayCode; depart: string }
interface BusyRow { route_id: string; days: DayCode; starts: string; ends: string; note: string }

export async function loadTimetable(env: Env): Promise<Timetable> {
  const [metaRes, stopRes, noteRes, routeRes, rsRes, tripRes, busyRes] = await env.DB.batch([
    env.DB.prepare("SELECT key, value FROM meta"),
    env.DB.prepare("SELECT id, name, area, lat, lon, photo_id FROM stops ORDER BY id"),
    env.DB.prepare("SELECT stop_id, kind, text FROM stop_notes ORDER BY stop_id, kind, position"),
    env.DB.prepare("SELECT * FROM routes ORDER BY sort_order, id"),
    env.DB.prepare("SELECT route_id, dir, stop_id, offset_min FROM route_stops ORDER BY route_id, dir, position"),
    env.DB.prepare("SELECT route_id, dir, days, depart FROM trips ORDER BY route_id, dir, days, depart"),
    env.DB.prepare("SELECT route_id, days, starts, ends, note FROM busy_periods ORDER BY route_id, id"),
  ]);

  const meta = new Map((metaRes!.results as Array<{ key: string; value: string }>).map((r) => [r.key, r.value]));

  const stops: Timetable["stops"] = {};
  for (const s of stopRes!.results as unknown as StopRow[]) {
    stops[s.id] = {
      name: s.name, area: s.area, lat: s.lat, lon: s.lon,
      photo: s.photo_id ? `/api/images/${encodeURIComponent(s.photo_id)}` : null,
      landmarks: [], tips: [], safety: [],
    };
  }
  const noteField = { landmark: "landmarks", tip: "tips", safety: "safety" } as const;
  for (const n of noteRes!.results as unknown as NoteRow[]) {
    stops[n.stop_id]?.[noteField[n.kind]].push(n.text);
  }

  const routes = (routeRes!.results as unknown as RouteRow[]).map((r) => ({
    id: r.id, number: r.number, name: r.name, kind: r.kind,
    headsign: { out: r.headsign_out, back: r.headsign_back },
    fare: { single: r.fare_single_pence / 100, return: r.fare_return_pence / 100 },
    busy: [] as Timetable["routes"][number]["busy"],
    patterns: {} as Timetable["routes"][number]["patterns"],
    trips: [] as Timetable["routes"][number]["trips"],
  }));
  const byId = new Map(routes.map((r) => [r.id, r]));

  for (const rs of rsRes!.results as unknown as RouteStopRow[]) {
    const r = byId.get(rs.route_id);
    if (!r) continue;
    (r.patterns[rs.dir] ??= []).push({ stop: rs.stop_id, offset: rs.offset_min });
  }

  // Group departures by direction and day, as the front end expects.
  const dirOrder: Dir[] = ["out", "back"];
  const dayOrder: DayCode[] = ["MF", "SA", "SU"];
  const groups = new Map<string, { route: string; dir: Dir; days: DayCode; times: string[] }>();
  for (const t of tripRes!.results as unknown as TripRow[]) {
    const key = `${t.route_id}|${t.dir}|${t.days}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { route: t.route_id, dir: t.dir, days: t.days, times: [] }));
    g.times.push(t.depart);
  }
  [...groups.values()]
    .sort((a, b) => dirOrder.indexOf(a.dir) - dirOrder.indexOf(b.dir) || dayOrder.indexOf(a.days) - dayOrder.indexOf(b.days))
    .forEach((g) => byId.get(g.route)?.trips.push({ dir: g.dir, days: [g.days], times: g.times }));

  for (const b of busyRes!.results as unknown as BusyRow[]) {
    byId.get(b.route_id)?.busy.push({ days: [b.days], from: b.starts, to: b.ends, note: b.note });
  }

  return {
    meta: {
      sample: meta.get("sample") === "true",
      note: meta.get("note") ?? "",
      updated: meta.get("updated") ?? "",
      helpline: { name: meta.get("helpline_name") ?? "Translink", phone: meta.get("helpline_phone") ?? "" },
    },
    stops,
    routes,
  };
}
