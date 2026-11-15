# Deploying

Everything runs on Cloudflare's free tier. You need a Cloudflare account and Node.js 20 or later.

## First time

1. **Create the database** and paste the printed `database_id` into `wrangler.jsonc`:

   ```sh
   npx wrangler d1 create journey-buddy
   ```

2. **Create the tables and load data:**

   ```sh
   npm run db:migrate:remote
   npm run db:seed:remote
   ```

3. **Set the secrets.** Use a passcode that's easy to say out loud, and a long random session secret:

   ```sh
   npx wrangler secret put USER_PASSCODE
   npx wrangler secret put SESSION_SECRET
   ```

4. **Deploy:**

   ```sh
   npm run deploy
   ```

5. **Protect the staff API with Cloudflare Access.** In Cloudflare Zero Trust, add a
   self-hosted Access application covering the path `/api/admin/` on the app's address, with a
   policy allowing the staff email addresses. Then put your team domain (for example
   `yourteam.cloudflareaccess.com`) and the application's audience (AUD) tag into `ACCESS_TEAM_DOMAIN`
   and `ACCESS_AUD` in `wrangler.jsonc`, and deploy again.

   Until this is done, the staff API refuses every request, which is the safe default.

## Updates

```sh
npm run db:migrate:remote   # only if there are new migrations
npm run deploy
```

When the caching rules in `public/sw.js` change, bump its `VERSION` so phones pick up the new version.

## Checks after deploying

- The app page loads and asks for the passcode.
- The passcode works, and the example-times warning shows while `meta.sample` is true.
- `/api/timetable` returns 401 in a private window.
- `/api/admin/me` asks you to sign in through Access, then shows your email.
