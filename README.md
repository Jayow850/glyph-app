# ♟️ GLYPH — Where Chess People Live

Full-stack SaaS: the tournament/club backbone **plus** the complete social layer — 7 post types, video posts with threaded comments and 15s video replies, gold-pawn reactions with Elo-weighted brilliants, For You/Rising feed ranking, puzzle solving with streaks, bookmarks into study folders, follows, and community creation. Styled end-to-end in the "Board at Midnight" system (champagne gold, Fraunces serif, no pure black or white).

**Deploy:** follow `DEPLOYMENT.md` step by step — laptop first, then Neon + Upstash + Vercel + Railway.

**The operating system for the world's chess communities.** Clubs, schools, academies, and federations — tournaments, ratings, social, events, and billing in one platform.

---

## ✅ ALL PHASES BUILT — what's in this package

### Phase 1 — Engines (tested & verified)
| File | What |
|---|---|
| `prisma/schema.prisma` | 28-model production schema, fully multi-tenant |
| `lib/rating/elo.ts` | ELO: dynamic K (40/32/24/16), provisional, performance ratings |
| `lib/pairing/swiss.ts` | Swiss: no rematches, color balancing, byes, floats, backtracking |
| `lib/pairing/tiebreaks.ts` | Buchholz, Cut-1, Sonneborn-Berger, Direct, Cumulative, Wins |
| `lib/test-tournament.ts` | Full 8-player simulation — **run: `npm run test:engine`** |

### Phase 2 — Core app
- `src/lib/auth.ts` — NextAuth v5: JWT sessions, Google OAuth + credentials, ban enforcement
- `src/lib/rbac.ts` — 7-role hierarchy with multi-tenant club guards
- API: create/search clubs, join (invite codes, scholastic parent-link check), create tournaments, **pair rounds**, submit results, standings, finalize
- `src/lib/services/results.ts` — **dual-confirmation results**: both players confirm → ELO applies; conflict → auto-dispute → arbiter rules (fully audited). Offline-tolerant `clientTimestamp`.

### Phase 3 — Community
- `src/lib/realtime/socket-server.ts` — Socket.io + Redis adapter: chat rooms, DMs, typing, presence, reactions, read-only announcement channels, live tournament rooms, notification push
- API: posts feed (pinned + cursor pagination), message history + search, events with **capacity → waitlist** RSVP
- `src/lib/services/notifications.ts` — in-app + Redis push + email queue

### Phase 4 — Growth
- `src/app/club/[slug]/page.tsx` — public SEO club pages with OpenGraph metadata
- `src/lib/services/achievements.ts` — 9 achievements incl. Champion, Undefeated, Giant Slayer, auto-awarded on finalize
- `src/lib/services/rankings.ts` — Redis-cached club + global leaderboards, full player stat blocks (streaks, biggest swings)

### Phase 5 — Business
- `src/lib/stripe/billing.ts` — Free/Pro/Enterprise with **enforced tier limits** (members, tournaments/month), checkout, webhooks (paid, failed, cancelled), invoice history
- `AuditLog` on every pairing, ruling, and override

### Phase 6 — Moats
- `src/lib/pdf/wallchart.ts` — **printable pairing sheets + standings wallchart** (the paper feature no app has)
- PGN archive on result submission
- Scholastic mode: minors must link a parent account to join scholastic clubs
- PWA manifest + mobile-first bottom navigation

### Design system (tournament-hall aesthetic)
Charcoal board surfaces · ivory type · DGT felt-green accent · walnut warmth.
Signature: **scoresheet-notation rating deltas** (`+19` in mono felt-green) and board-number chips. Dark-first, reduced-motion respected, keyboard focus visible.

---

## Run it

```bash
cp .env.example .env       # fill in secrets
docker compose up -d       # Postgres + Redis
npm install
npm run db:push            # create tables
npm run db:seed            # demo club: Lagos Kings, 8 players (pw: glyph-demo)
npm run socket &           # realtime server :4001
npm run dev                # app :3000
```

Then: log in → open **Lagos Kings** → start the tournament → `POST /api/tournaments/{id}/pair` → play rounds → print the wallchart.

## Architecture rules (enforced in code)
- Every club-scoped route calls `requireRole(userId, clubId, ...)` — no cross-tenant leaks
- Ratings only change through `RatingHistory` — the graph is the source of truth
- A round cannot be paired until every result in the previous round is confirmed or ruled
- Announcement channels reject posts from non-staff at the socket layer
- Tier limits checked *before* resource creation, returning 402 with an upgrade prompt
