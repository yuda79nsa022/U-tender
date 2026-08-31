# U-Tender

Drawings in. Offers out. A request-for-quote marketplace connecting building
owners with contractors, gated by an admin-reviewed document verification step.

## What's actually built vs. what's scaffolded

Being upfront about this so you know what you're getting:

**Fully wired to Supabase (real queries, real RLS):**
- Database schema (`supabase/schema.sql`) — every table, enum, index, and
  Row Level Security policy described in our design conversation.
- Auth + role/verification-based route protection (`src/middleware.ts`).
- **Pass 1 — Auth:** signup (with role selection, seeds the contractor's
  document checklist automatically), login, logout, and a root page that
  routes each logged-in user straight to their role's home.
- **Pass 2 — Owner flow:** dashboard listing projects with live offer counts
  (`src/app/owner/dashboard`), new-project form with real drawing upload to
  Storage (`src/app/owner/projects/new`), and a project detail page showing
  offers ranked by price with an approve action that awards the project and
  rejects the rest in one transaction-safe pass (`src/app/owner/projects/[id]`).
- **Pass 3 — Contractor flow:** open project feed with the subscription
  paywall (locked overlay on drawings/offers until subscribed, but titles
  and deadlines stay visible) at `src/app/contractor/feed`; submit/edit/
  withdraw offer at `src/app/contractor/projects/[id]/offer`, which reuses
  the same deadline-tied signed URLs as the owner's view; and a subscribe
  page at `src/app/contractor/subscribe`.
- Contractor verification flow: upload documents, track status, submit for
  review (`src/app/contractor/verify`).
- Admin document requirements manager: add, toggle required/optional,
  remove (`src/app/admin/requirements`).
- **Pass 4 — Admin review + ratings:** application review queue at
  `src/app/admin/review`, where an admin approves or rejects each submitted
  document individually — a single rejected document immediately flips the
  contractor's status to "changes requested" with the admin's note attached,
  no separate step needed. The overall "Approve contractor" action is
  guarded server-side: it's rejected if any required document isn't
  approved yet, not just disabled in the UI. Also added the owner's
  post-award rating flow (`src/app/owner/projects/[id]`, `rating-input.tsx`)
  — the contractor's public `avg_rating`/`review_count` are recomputed from
  every review on each submission rather than incremented, so they can
  never drift out of sync.
- **Contractor management (admin):** `src/app/admin/contractors` lists
  every contractor regardless of status; `src/app/admin/contractors/[id]`
  lets an admin edit company details, override verification status
  directly, suspend/reactivate (blocks feed + drawings + offers access via
  RLS, not just page routing — see below), and permanently delete an
  account (blocked if the contractor has reviews on record, to protect
  reputation history; suspend instead in that case). Deletion requires
  typing the company name to confirm and uses a service-role client
  (`src/lib/supabase/admin.ts`) to remove the actual auth user, which
  cascades through their data via the FK constraints in the schema.
- Also filled a gap from Pass 1: `/contractor/status` was referenced by
  redirects everywhere (middleware, the verify-submission flow) but the
  page itself was never built — it now exists for real, and also renders a
  distinct "Account suspended" state.
- **Tightened Row Level Security while building this:** the original
  `offers` policy was a single `FOR ALL USING (contractor_id = auth.uid())`,
  which — because of how Postgres treats `FOR ALL` policies with no
  separate `WITH CHECK` — let *any* authenticated contractor insert an
  offer regardless of approval, subscription, or (now) suspension status.
  The app's Server Actions already guarded against this, but RLS itself
  didn't, meaning a suspended contractor calling the Supabase API directly
  with their own session token could have bypassed the app entirely. Split
  into separate select/insert/update policies with real `WITH CHECK`
  clauses. **If you already ran the original schema.sql, run
  `supabase/migrations/002_add_contractor_suspension.sql`** to pick up the
  `is_suspended` column and these corrected policies.

**Scaffolded but not yet built out:** nothing structural — all five planned
passes are complete. Remaining gaps are noted individually below.

- **Pass 5 — Billing + notifications:**
  - Real Stripe Checkout (`src/app/contractor/subscribe/actions.ts`) and a
    webhook (`src/app/api/webhooks/stripe/route.ts`) that keeps
    `subscription_status` in sync with Stripe going forward — checkout
    completion, renewals, payment failures, and cancellations all flow
    through the same handler via `customer.subscription.updated/deleted`.
    A Billing Portal link lets subscribed contractors manage or cancel.
  - **This retires the `devActivateSubscription` stub from Pass 3.** It's
    been deleted, not just deprecated — the subscribe page now always goes
    through real Stripe Checkout.
  - Email notifications via Resend (`src/lib/email.ts`): owner gets
    notified on a new offer, contractor gets notified on approval/
    rejection, owner gets a reminder when a project's deadline is under 24
    hours away. Every send is wrapped so a failed email never blocks the
    underlying action (a bid still submits even if Resend is down).
  - The deadline reminder needs an external scheduler to actually fire —
    see `src/app/api/cron/deadline-reminders/route.ts` and the Cron section
    below.
  - **Found and fixed while building this:** the initial scaffold had
    created an `api/webhooks/stripe` folder at the repo root instead of
    under `src/app` — Next.js would never have routed to it. Removed and
    rebuilt in the correct location.

**Known gaps, not part of the original 5 passes:**
- No automated tests.
- Email templates are inline HTML strings, not a proper template system —
  fine for 3 emails, worth revisiting if the notification set grows.
- The "from" address in `src/lib/email.ts` is a placeholder
  (`notifications@u-tender.example`) — replace with your verified Resend
  sending domain before going live, or Resend will reject the sends.

**Post-Pass-5 addition — zip folder upload/download for drawings:**
- Owners can now upload a `.zip` in the drawings picker (both at project
  creation and via "Add drawings" on an existing project's page) — it's
  transparently extracted server-side into one `project_drawings` row per
  file inside it (`src/lib/zip.ts`, `src/lib/drawings.ts`), skipping
  directory entries and OS junk like `__MACOSX/` and `.DS_Store`. Plain
  files still work exactly as before.
- Contractors (and owners) can download every drawing on a project as one
  `.zip` via `GET /api/projects/[id]/drawings-zip`. That route deliberately
  reuses the normal session-based Supabase client rather than the
  service-role client, so Row Level Security does the authorization —
  whatever a user is allowed to see on the project's page is exactly what
  they're allowed to include in the zip, with no separate permission logic
  to keep in sync.
- **Found and fixed while building this:** neither storage bucket had any
  `storage.objects` Row Level Security policies. Supabase enables RLS on
  that table by default, so without explicit policies, every upload and
  download built in Passes 2 through 4 — and the drawing links owners and
  contractors have been clicking on — would have been silently denied
  outside of a service-role context. This had gone unnoticed because nothing
  earlier actually exercised storage against a real Supabase project.
  Fixed in `schema.sql`; **if you already ran the schema on a live project,
  run `supabase/migrations/004_add_storage_rls_policies.sql`.**
- Raised the Server Action body size limit from 25MB to 50MB
  (`next.config.js`) to accommodate zipped folders of drawings — adjust
  further if your projects routinely have larger drawing sets.

## Setup

**If you have Docker installed, this is the easiest path** — it replaces
both "install Node.js" and "create a cloud Supabase account" with fully
local, offline equivalents:

1. **Install the Supabase CLI** (needs Docker running):
   ```
   npm install -g supabase
   ```
   (This one command still needs Node.js/npm just to install the CLI tool
   itself — but everything it manages after that runs inside Docker.)
2. **Start a local Supabase stack:**
   ```
   supabase init
   supabase start
   ```
   This pulls and runs ~10 Docker containers (Postgres, Auth, Storage,
   Studio, etc.) automatically. When it finishes, it prints an API URL,
   an `anon` key, and a `service_role` key — copy these for the next step.
3. **Run the schema:** open the local Studio UI it printed a link to
   (usually `http://localhost:54323`), go to the SQL editor, paste in
   `supabase/schema.sql`, and run it — same as you would on the cloud
   dashboard, just pointed at your own machine instead.
4. **Create the two storage buckets** (`contractor-documents`,
   `project-drawings`, both private) in that same local Studio UI, under
   Storage.
5. **Set up `.env.local`** using the URL/keys `supabase start` printed.
6. **Run the app itself** — two options:
   - **With Docker too:** `docker compose up` (uses the included
     `Dockerfile`/`docker-compose.yml`). If Supabase is also in Docker,
     use `http://host.docker.internal:54321` instead of `localhost` for
     `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` — inside a container,
     "localhost" means the container itself, not your machine.
   - **Without Docker:** `npm install && npm run dev` as usual — nothing
     wrong with mixing a Dockerized backend with a normally-run frontend.
7. **Stop everything** later with `supabase stop` (and `docker compose down`
   if you used that too). `supabase start` again picks up where you left
   off — your local data persists between sessions.

**If you'd rather use a cloud Supabase project instead of a fully local
one** (simpler if Docker feels like one extra thing to manage, and it's
still free to start):

1. **Create a Supabase project** at supabase.com.
2. **Run the schema:** paste the contents of `supabase/schema.sql` into the
   Supabase SQL editor and run it.
3. **Create two private storage buckets** in Supabase Storage — `contractor-documents` and `project-drawings`. Both must be private, not public.
4. **Copy env vars:**
   ```
   cp .env.example .env.local
   ```
   Fill in the Supabase URL/keys from your project's Settings > API. The
   `SUPABASE_SERVICE_ROLE_KEY` is required for Pass 4's admin account
   deletion — it's a highly privileged key that bypasses RLS entirely.
   Never expose it in client-side code or commit it; it's only ever read
   inside `src/lib/supabase/admin.ts`, used from Server Actions.
5. **Install and run:**
   ```
   npm install
   npm run dev
   ```
6. **Create your first admin:** sign up normally, then in the Supabase table
   editor change that user's `role` in the `profiles` table to `admin`.
   There's no self-serve admin signup by design.
7. **Set up Stripe:**
   - In the Stripe dashboard, create one product ("U-Tender Contractor
     Access") with two recurring prices — monthly and annual — and put
     their price IDs in `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` /
     `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`.
   - For local testing, install the [Stripe CLI](https://stripe.com/docs/stripe-cli)
     and run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
     — it prints a webhook signing secret, put that in
     `STRIPE_WEBHOOK_SECRET`.
   - In production, add a webhook endpoint in the Stripe dashboard pointing
     at `https://yourdomain.com/api/webhooks/stripe`, listening for
     `checkout.session.completed`, `customer.subscription.updated`, and
     `customer.subscription.deleted`.
8. **Set up Resend:** create an account at resend.com, verify a sending
   domain (or use their sandbox address for testing), put the API key in
   `RESEND_API_KEY`, and update the `FROM` address in `src/lib/email.ts`.
9. **Set up the deadline reminder cron:** generate a random string for
   `CRON_SECRET`. On Vercel, `vercel.json` already schedules it hourly and
   Vercel sends the secret automatically. On any other host, point your own
   scheduler (cron, a GitHub Actions workflow, Supabase's `pg_cron`) at
   `GET /api/cron/deadline-reminders` with header
   `Authorization: Bearer <CRON_SECRET>`.

## Why these tech choices

- **Next.js App Router** — Server Components mean pages fetch data directly
  from Supabase server-side, no separate API layer to maintain for basic CRUD.
- **Supabase** — Postgres + Auth + Storage in one place, and Row Level
  Security means the database itself enforces "a contractor can only see
  their own documents" rather than relying on every route to remember to
  check.
- **Server Actions over API routes** — for straightforward mutations
  (upload a doc, add a requirement) they cut out a layer of boilerplate.
  Worth revisiting if the app grows a public API surface later.

## Notes for whoever picks this up next

- Drawing links use Supabase Storage **signed URLs whose expiry is tied to
  the project's bid deadline** (`src/lib/storage.ts`), not a flat short
  window — a contractor should be able to keep reviewing a drawing for the
  entire time the owner said bidding is open. Floored at 1 hour (so an
  already-closed project's drawings still load when reviewed later) and
  capped at 90 days (a sanity guard against a mistaken far-future deadline).
- Document/drawing uploads go to **private** Storage buckets — never make
  these public. Serve them via signed URLs generated server-side.
- `removeRequirement` soft-deletes (sets `is_active = false`) rather than
  hard-deleting, so a removed requirement doesn't wipe out the audit trail
  of contractors who already submitted against it.
- Add an `expires_on` reminder job before this goes to production — licenses
  expire and nothing currently re-flags an approved document once it does.
