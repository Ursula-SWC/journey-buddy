# Journey Buddy

A calm, step-by-step bus journey companion for a charity user group in Fermanagh and Tyrone.
Users plan a trip by tapping places, get a plain-language guide for each stop, and can follow
along on the bus. Built and run at no cost to the charity on Cloudflare's free tier.

> **Status:** early build. The timetable is still **example data** carried over from the prototype.
> Don't let anyone rely on the times until real Translink data and staff-checked stop details are loaded.

## How it fits together

| Part | What it is | Where |
| --- | --- | --- |
| Front end | The prototype app, now loading from the API. Plain JavaScript, no build step | `public/` |
| API | TypeScript Cloudflare Worker | `src/` |
| Database | Cloudflare D1: timetable, stop notes and stop photos (as BLOBs) | `migrations/` |
| Users | One shared passcode, typed once per phone. No accounts, no personal data | `src/auth/passcode.ts` |
| Staff | Cloudflare Access sign-in, required for `/api/admin/*` | `src/auth/access.ts` |
| Prototype | The original single-file version, kept for reference | `prototype/` |

Favourites, settings and journey history stay in each phone's browser storage and never reach the server.

More detail: [architecture](docs/architecture.md), [data model](docs/data-model.md), [deploying](docs/deploying.md).

## Run it locally

You need Node.js 20 or later.

```sh
npm install
npx wrangler login                      # once
npx wrangler d1 create journey-buddy    # once: paste the database_id into wrangler.jsonc
cp .dev.vars.example .dev.vars          # local passcode and secrets
npm run db:migrate:local
npm run db:seed:local                   # loads the example timetable
npm run dev
```

Open the address Wrangler prints (usually http://localhost:8787) and enter the passcode from `.dev.vars`.

## Useful commands

| Command | Does |
| --- | --- |
| `npm run dev` | Runs the Worker and front end locally against a local D1 |
| `npm run typecheck` | Type-checks the API |
| `npm run seed:build` | Rebuilds `seed/sample-data.sql` from `seed/sample-timetable.json` |
| `npm run db:migrate:remote` | Applies migrations to the live database |
| `npm run deploy` | Publishes the Worker and front end |

## What's next

- [ ] Import real Translink timetable data (GTFS) instead of `seed/sample-timetable.json`
- [ ] Staff screens for editing stop notes and uploading photos (the API is ready: see [architecture](docs/architecture.md#staff-api))
- [ ] Set up the Cloudflare Access application and policy for staff
- [ ] Choose the passcode and agree how staff share and change it
- [ ] Charity sign-off on stop notes before the example-data warning is removed
