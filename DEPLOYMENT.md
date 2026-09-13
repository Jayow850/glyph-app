# 🚀 GLYPH — Step-by-Step Deployment Guide

Follow these steps in order. Each step tells you exactly where to click and what to paste. Budget ~90 minutes for your first deploy.

---

## PART A — Run it on your laptop first (30 min)

**Step 1. Install the basics**
- Node.js 20+ → https://nodejs.org
- Docker Desktop → https://docker.com

**Step 2. Unzip the project and open a terminal inside the `glyph` folder**

**Step 3. Start the databases**
```bash
docker compose up -d
```
This starts PostgreSQL (port 5432) and Redis (port 6379).

**Step 4. Configure secrets**
```bash
cp .env.example .env
```
Open `.env` and set `NEXTAUTH_SECRET` — generate one with:
```bash
openssl rand -base64 32
```
Leave Google/Stripe blank for now; email+password login works without them.

**Step 5. Install, create tables, seed demo data**
```bash
npm install
npm run db:push
npm run db:seed
```
Seed gives you the Lagos Kings club and 8 accounts (password: `glyph-demo`).

**Step 6. Run it**
```bash
npm run socket   # terminal 1 — realtime server
npm run dev      # terminal 2 — the app
```
Open http://localhost:3000 → log in as `magnus_local@glyph.demo` / `glyph-demo`.

**Step 7. Smoke test (do all of these before going further)**
- [ ] Log in, open the feed, publish a text post
- [ ] Comment on your post, react with the pawn
- [ ] Open Lagos Kings → the tournament → pair Round 1
- [ ] Enter a result from two accounts (dual confirmation)
- [ ] Download the wallchart PDF

Anything that errors here: fix it locally before deploying. First boot of a system this size always surfaces a few wiring issues — read the terminal error, it names the file.

---

## PART B — Production infrastructure (30 min)

You need 4 managed services. All have free tiers.

**Step 8. Database — Neon (https://neon.tech)**
1. Sign up → Create project → name it `glyph`
2. Copy the connection string (starts `postgresql://`)
3. This becomes `DATABASE_URL` in production

**Step 9. Redis — Upstash (https://upstash.com)**
1. Create database → region closest to your users
2. Copy the `rediss://` connection string → this is `REDIS_URL`

**Step 10. Google OAuth (optional but recommended)**
1. https://console.cloud.google.com → New project `glyph`
2. APIs & Services → OAuth consent screen → External → fill app name
3. Credentials → Create → OAuth Client ID → Web application
4. Authorized redirect URI: `https://YOUR-DOMAIN/api/auth/callback/google`
5. Copy Client ID + Secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Step 11. Stripe (https://stripe.com)**
1. Create account → Developers → API keys → copy secret key → `STRIPE_SECRET_KEY`
2. Products → Add product "Glyph Pro" (e.g. $19/mo recurring) → copy the price ID → `STRIPE_PRICE_PRO`
3. Same for "Glyph Enterprise" → `STRIPE_PRICE_ENTERPRISE`
4. Webhooks → Add endpoint → `https://YOUR-DOMAIN/api/webhooks/stripe`
   → select events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
   → copy signing secret → `STRIPE_WEBHOOK_SECRET`

**Step 12. Media storage for photos/videos — Cloudflare R2 or UploadThing**
Video/photo posts need file hosting. Fastest path: https://uploadthing.com (free tier) — create app, follow their Next.js quickstart, and point the composer's upload to it. Store the returned URLs in `mediaUrls` / `videoUrl`.

---

## PART C — Deploy the app (20 min)

**Step 13. Push to GitHub**
```bash
git init && git add -A && git commit -m "Glyph v1"
gh repo create glyph --private --push   # or use github.com UI
```

**Step 14. Deploy web app — Vercel (https://vercel.com)**
1. New Project → import your `glyph` repo
2. Framework preset: Next.js (auto-detected)
3. Environment Variables → paste ALL of these:
   - `DATABASE_URL` (Neon)
   - `REDIS_URL` (Upstash)
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL` = `https://YOUR-DOMAIN`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`
4. Deploy. First build runs `prisma generate` automatically.
5. After deploy, run the schema against Neon once from your laptop:
   ```bash
   DATABASE_URL="<neon-url>" npm run db:push
   DATABASE_URL="<neon-url>" npm run db:seed   # optional demo data
   ```

**Step 15. Deploy the realtime server — Railway (https://railway.app)**
Vercel can't host long-lived Socket.io. Railway can, in 3 clicks:
1. New Project → Deploy from GitHub repo → select `glyph`
2. Settings → Start command: `npm run socket`
3. Variables → add `DATABASE_URL`, `REDIS_URL`, `SOCKET_PORT=4001`, `NEXTAUTH_URL`
4. Networking → Generate domain → note it (e.g. `glyph-socket.up.railway.app`)
5. In Vercel, add env `NEXT_PUBLIC_SOCKET_URL=https://glyph-socket.up.railway.app`

**Step 16. Custom domain**
1. Buy a domain (Namecheap/Cloudflare)
2. Vercel → Project → Domains → add `glyph.yourdomain.com` → follow the DNS instructions
3. Update `NEXTAUTH_URL` and the Google redirect URI and Stripe webhook URL to the final domain. Redeploy.

**Step 17. Go-live checklist**
- [ ] Register a fresh account on production → onboarding completes
- [ ] Create a club (POST from the UI) → you're OWNER
- [ ] Create a tournament → pair → result → standings
- [ ] Publish text + photo + video post → comment on the video
- [ ] Stripe test-mode checkout upgrades the club to Pro
- [ ] Wallchart PDF downloads
- [ ] Check Vercel + Railway logs for errors

---

## PART D — Scaling later (read when you have 1,000 users)

- Neon autoscales; add read replicas at ~10k users
- Railway: bump socket instance; Redis adapter already makes Socket.io horizontal
- Move media to Cloudflare R2 + Stream for video transcoding
- Add Vercel Analytics + Sentry (`npm i @sentry/nextjs`) on day one if you can

You now own a live, billing-enabled chess platform. Move by move. ♟
