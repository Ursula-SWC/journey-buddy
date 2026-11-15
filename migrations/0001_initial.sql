-- Journey Buddy: initial schema.
-- Holds the timetable (stops, routes, trips) and stop photos. There is no per-user data:
-- favourites, settings and journey history stay on each person's phone.
-- D1 enforces foreign keys by default.

-- Key/value settings shown in the app (helpline, sample-data flag, last updated).
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Photos live in D1 as BLOBs (no R2, so no storage bill).
-- D1 caps the size of a single row, so images are resized before upload;
-- the API rejects anything over 1.9 MB and the CHECK below is a backstop.
CREATE TABLE images (
  id           TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes        BLOB NOT NULL CHECK (length(bytes) BETWEEN 1 AND 1900000),
  alt          TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE stops (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  area       TEXT NOT NULL DEFAULT '',
  lat        REAL,
  lon        REAL,
  photo_id   TEXT REFERENCES images (id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Plain-language notes staff write for each stop, shown in the journey guide.
CREATE TABLE stop_notes (
  stop_id  TEXT    NOT NULL REFERENCES stops (id) ON DELETE CASCADE,
  kind     TEXT    NOT NULL CHECK (kind IN ('landmark', 'tip', 'safety')),
  position INTEGER NOT NULL,
  text     TEXT    NOT NULL,
  PRIMARY KEY (stop_id, kind, position)
);

CREATE TABLE routes (
  id                TEXT PRIMARY KEY,
  number            TEXT NOT NULL,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT '',
  headsign_out      TEXT NOT NULL,
  headsign_back     TEXT NOT NULL,
  fare_single_pence INTEGER NOT NULL CHECK (fare_single_pence >= 0),
  fare_return_pence INTEGER NOT NULL CHECK (fare_return_pence >= 0),
  sort_order        INTEGER NOT NULL DEFAULT 0
);

-- The stops a route calls at, in order, with minutes from the first stop.
CREATE TABLE route_stops (
  route_id   TEXT    NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
  dir        TEXT    NOT NULL CHECK (dir IN ('out', 'back')),
  position   INTEGER NOT NULL,
  stop_id    TEXT    NOT NULL REFERENCES stops (id),
  offset_min INTEGER NOT NULL CHECK (offset_min >= 0),
  PRIMARY KEY (route_id, dir, position)
);

-- One row per departure from the first stop. days: MF = Mon-Fri, SA = Saturday, SU = Sunday.
CREATE TABLE trips (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
  dir      TEXT NOT NULL CHECK (dir IN ('out', 'back')),
  days     TEXT NOT NULL CHECK (days IN ('MF', 'SA', 'SU')),
  depart   TEXT NOT NULL CHECK (depart GLOB '[0-2][0-9]:[0-5][0-9]')
);
CREATE INDEX trips_by_route ON trips (route_id, dir, days, depart);

-- Times a route is usually crowded, so users can choose a quieter bus.
CREATE TABLE busy_periods (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL REFERENCES routes (id) ON DELETE CASCADE,
  days     TEXT NOT NULL CHECK (days IN ('MF', 'SA', 'SU')),
  starts   TEXT NOT NULL CHECK (starts GLOB '[0-2][0-9]:[0-5][0-9]'),
  ends     TEXT NOT NULL CHECK (ends GLOB '[0-2][0-9]:[0-5][0-9]'),
  note     TEXT NOT NULL
);
