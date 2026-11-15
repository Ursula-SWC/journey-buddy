# Data model

Schema: [`migrations/0001_initial.sql`](../migrations/0001_initial.sql). Add changes as new
numbered files in `migrations/`; never edit one that has already been applied.

| Table | Holds |
| --- | --- |
| `meta` | App-wide values: `sample` (true while using example data), `note`, `updated`, `helpline_name`, `helpline_phone` |
| `stops` | Each bus stop: name, area, position, and an optional `photo_id` |
| `stop_notes` | Plain-language notes per stop, in order: `landmark`, `tip` or `safety` |
| `routes` | Each bus route: number, name, the destination shown on the bus each way, fares in pence |
| `route_stops` | The stops a route calls at in each direction, with minutes from the first stop |
| `trips` | One row per departure from the first stop: direction, day type and time |
| `busy_periods` | Times a route is usually crowded, with a short note |
| `images` | Stop photos as BLOBs, with content type and alt text |

Day types are `MF` (Monday to Friday), `SA` (Saturday) and `SU` (Sunday). Times are 24-hour `HH:MM`.

Arrival times aren't stored: each stop's time is the trip's departure plus that stop's
`offset_min`. That matches how the prototype searched for journeys and keeps ~100 trips small.

## Loading timetable data

`seed/sample-timetable.json` is the prototype's example data. `scripts/build-seed.mjs` turns a
file in that shape into `seed/sample-data.sql`, which clears and reloads the timetable tables
(it leaves photos alone):

```sh
npm run seed:build
npm run db:seed:local     # or db:seed:remote
```

Reloading the timetable replaces stop notes too. Once staff start editing notes through the
staff API, the real Translink import should update times only and leave notes and photos alone.
