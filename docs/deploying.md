# Deploying

Journey Buddy runs live on Cloudflare's free tier. Once deployed, it has a public address like
`https://journey-buddy.<your-subdomain>.workers.dev` that works on any phone. `localhost` is
only for testing on your own computer with `npm run dev`.

You need a Cloudflare account and Node.js 20 or later.

## First time: put it live

1. **Sign in to Cloudflare from your computer:**

   ```sh
   npm install
   npx wrangler login
   ```

2. **Create the database** and paste the printed `database_id` into `wrangler.jsonc`, then commit
   that change. (The id isn't a secret; it's useless without your Cloudflare login.)

   ```sh
   npx wrangler d1 create journey-buddy
   ```

3. **Create the tables and load the example timetable:**

   ```sh
   npm run db:migrate:remote
   npm run db:seed:remote
   ```

4. **Deploy.** Wrangler prints the app's public address at the end.

   ```sh
   npm run deploy
   ```

5. **Set the passcode and session secret.** Use a passcode that's easy to say out loud, and a long
   random session secret. These stay set across later deploys.

   ```sh
   npx wrangler secret put USER_PASSCODE
   npx wrangler secret put SESSION_SECRET
   ```

6. **Protect the staff API with Cloudflare Access.** In Cloudflare Zero Trust, add a self-hosted
   Access application covering the path `/api/admin/` on the app's address, with a policy allowing
   the staff email addresses. Then put your team domain (for example `yourteam.cloudflareaccess.com`)
   and the application's audience (AUD) tag into `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in
   `wrangler.jsonc`, and deploy again.

   Until this is done, the staff API refuses every request, which is the safe default.

## Automatic deploys from GitHub

`.github/workflows/deploy.yml` deploys on every push to `main`: it type-checks the code, applies any
new database migrations, and deploys. It never reloads the seed data, so stop notes and photos
staff have added are safe. You can also run it by hand from the repo's **Actions** tab.

To turn it on, add two repository secrets on GitHub (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token. Start from the "Edit Cloudflare Workers" template and add **D1: Edit** permission. |
| `CLOUDFLARE_ACCOUNT_ID` | Shown on the Workers overview page in the Cloudflare dashboard. |

The workflow stops with a clear message if the secrets or the `database_id` are missing.

## Manual updates

If you'd rather deploy from your computer:

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
