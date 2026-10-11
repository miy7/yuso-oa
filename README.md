# YUSO MATCHA

Next.js 16 starter for a Thai matcha ordering site and admin dashboard. The current UI is a production-oriented shell with typed Prisma models, server validation boundaries, and the admin polling behavior ready for database wiring.

## Setup
1. Copy `.env.example` to `.env.development.local` and set `DATABASE_URL` plus LINE credentials.
2. Run `npx prisma generate` and `npx prisma migrate dev --name init`.
3. Start with `npm run dev`.

## LINE configuration
Create a LINE Login channel and a LIFF app using the deployed HTTPS URL as the endpoint and callback URL. Set the public LIFF ID only in `NEXT_PUBLIC_LIFF_ID`; keep channel secrets and Messaging API tokens server-only. Configure the Messaging API webhook to `/api/line/webhook`, verify the raw-body `X-Line-Signature`, and process event IDs idempotently. Location events should be correlated with a hashed, order-specific token rather than only the LINE user ID.

## Production
Build with `npm run build`, run `npm start` behind Nginx with HTTPS, and use a process manager such as systemd. Run a lightweight database-backed outbox worker for LINE notifications with bounded retries. Apply migrations with `npx prisma migrate deploy`.

## Still required
PostgreSQL, LINE Login/LIFF configuration, Official Account webhook credentials, secure admin authentication/session wiring, payment slip storage, and the real product seed data must be configured before accepting orders. The UI does not claim those external integrations are active.
