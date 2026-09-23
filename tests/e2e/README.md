# Phase 2 — Real Two-Tenant Security E2E

These tests authenticate through the real /login UI with two pre-created Supabase Auth users and then use their real session JWT for PostgREST/RPC requests. Supabase Auth JWTs are the authorization input used by RLS.

Required environment variables:
- E2E_BASE_URL
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- E2E_USER_A_EMAIL
- E2E_USER_A_PASSWORD
- E2E_USER_B_EMAIL
- E2E_USER_B_PASSWORD

The two users must belong to different organizations. The test does not create users, organizations, invoices, payments, expenses, inventory rows, or journal entries.

The only write attempts are negative customer INSERT requests using random UUIDs and unique markers. A secure configuration must reject both attempts with an authorization/constraint response. If either succeeds, the test fails immediately as a critical finding and does not silently delete the unauthorized row.

Do not commit passwords, access tokens, Playwright auth state, screenshots, or traces containing sensitive information.
