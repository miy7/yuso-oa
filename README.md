# YUSO MATCHA

Next.js 16 starter for a Thai matcha ordering site and admin dashboard. The current UI is a production-oriented shell with typed Prisma models, server validation boundaries, and the admin polling behavior ready for database wiring.

## Setup
1. Copy `.env.example` to `.env.development.local` and set `DATABASE_URL` plus LINE credentials. `DATABASE_URL` should be the PostgreSQL connection string supplied by your existing PostgreSQL provider; keep it server-only and never commit it.
2. Run `npx prisma generate`.
3. For a new development database, review the schema and run `npx prisma migrate dev --name init`. For an existing/production database, create and review a migration first, then apply only reviewed migrations with `npx prisma migrate deploy`. These commands do not reset the database.
4. Start with `npm run dev`.

## Safe product seed
Set `SEED_PRODUCTS_JSON` to an approved JSON array containing real prices in satang, then run `npm run db:seed`. The script creates missing categories/products and skips an existing product with the same category and Thai name; it never overwrites an existing price. Do not use invented prices in production.

## First admin account
There is no public admin registration route and no default password. After `DATABASE_URL` is configured, create the first account from a secure shell with temporary environment variables: `ADMIN_EMAIL='owner@example.com' ADMIN_NAME='Owner' ADMIN_PASSWORD='use-a-unique-12-character-password' npm run admin:bootstrap`. The command refuses to overwrite an existing email. Rotate credentials by creating a new owner account through the same controlled process, confirming login, then disabling the old account through a reviewed database operation; never place credentials in source control or `NEXT_PUBLIC_*` variables.

## LINE configuration
Create a LINE Login channel and a LIFF app using the deployed HTTPS URL as the endpoint and callback URL. Set the public LIFF ID only in `NEXT_PUBLIC_LIFF_ID`; keep channel secrets and Messaging API tokens server-only. Configure the Messaging API webhook to `/api/line/webhook`, verify the raw-body `X-Line-Signature`, and process event IDs idempotently. Location events should be correlated with a hashed, order-specific token rather than only the LINE user ID.

## Production
Build with `npm run build`, run `npm start` behind Nginx with HTTPS, and use a process manager such as systemd. Run a lightweight database-backed outbox worker for LINE notifications with bounded retries. Apply migrations with `npx prisma migrate deploy`.

## Still required
PostgreSQL, LINE Login/LIFF configuration, Official Account webhook credentials, secure admin authentication/session wiring, payment slip storage, and the real product seed data must be configured before accepting orders. The UI does not claim those external integrations are active.
