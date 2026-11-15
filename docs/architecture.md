# Architecture

## One Worker, one database

```
Phone (charity user)            Staff browser
   │ shared passcode               │ Cloudflare Access sign-in
   ▼                               ▼
┌──────────────────────── Cloudflare Worker: journey-buddy ────────────────────────┐
│  public/  static front end (index.html, sw.js)                                   │
│  /api/*   TypeScript API (src/)                                                  │
└───────────────────────────────────────┬──────────────────────────────────────────┘
                                        ▼
                         D1 database: journey-buddy
                 timetable · stop notes · stop photos (BLOBs)
```

A single Worker serves the static front end and the API, so there is one thing to deploy and
everything stays on Cloudflare's free tier. There is no R2 bucket: photos are stored in D1.

## Who can do what

| Who | How they get in | Can |
| --- | --- | --- |
| Anyone | Nothing | Load the app page and the passcode screen |
| Charity users | Shared passcode, then a signed cookie for 90 days | Read the timetable and stop photos |
| Staff | Cloudflare Access (email sign-in) | Everything users can, plus the staff API |

The passcode is checked case-insensitively, with a short delay on every attempt to slow guessing.
The session cookie holds only an expiry time and a signature, never anything about the person.
Changing `SESSION_SECRET` signs every phone out; changing `USER_PASSCODE` only affects new sign-ins.

Staff requests are checked twice: Cloudflare Access blocks them at the edge, and the Worker
verifies the Access JWT itself (signature, audience, issuer, expiry), so a misconfigured
Access policy can't open the staff API. For local development only, `DEV_STAFF_EMAIL` in
`.dev.vars` treats requests to `localhost` as staff.

## API

| Method | Path | Who | Does |
| --- | --- | --- | --- |
| POST | `/api/session` | anyone | `{ "passcode": "…" }` → sets the session cookie |
| DELETE | `/api/session` | anyone | Signs this phone out |
| GET | `/api/timetable` | users, staff | Stops, routes and times, in the shape the front end uses |
| GET | `/api/images/:id` | users, staff | A stop photo |

### Staff API

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/admin/me` | Shows who you're signed in as |
| POST | `/api/admin/images?alt=…` | Upload a photo. Body is the raw JPEG/PNG/WebP, under 1.9 MB. Returns its `id` |
| DELETE | `/api/admin/images/:id` | Delete a photo. Stops using it go back to "photo coming soon" |
| PUT | `/api/admin/stops/:id` | Edit a stop: `name`, `area`, `photoId`, `landmarks`, `tips`, `safety` (lists replace what's there) |

Timetable times aren't edited by hand: they come from the import (see [data model](data-model.md)).

## Front end

`public/index.html` is the prototype with three changes: it loads `/api/timetable` instead of
inline data, it shows a passcode screen when the API answers 401, and it registers
`public/sw.js` so the app and the last timetable work with no signal. Stop photos are cached
on the phone the first time they're seen.

## Images in D1

D1 limits the size of a single row, so photos must be resized before upload. About 1600 px on
the long side as a JPEG at quality ~80 is usually 200–400 KB, which keeps ~400 photos well
within D1's free storage. The API rejects uploads over 1.9 MB. Check Cloudflare's current D1
limits before changing that number.
