export interface Env {
  /** The D1 database holding the timetable and stop photos. */
  DB: D1Database;
  /** Static files from public/ (the front end). */
  ASSETS: Fetcher;

  /** Shared passcode charity users type once on their phone. Secret. */
  USER_PASSCODE: string;
  /** Long random string used to sign the session cookie. Secret. */
  SESSION_SECRET: string;

  /** Cloudflare Access team domain, e.g. "yourteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN: string;
  /** Audience (AUD) tag of the Cloudflare Access application protecting /api/admin. */
  ACCESS_AUD: string;

  /** Local development only: treat requests to localhost as this staff member. */
  DEV_STAFF_EMAIL?: string;
}
