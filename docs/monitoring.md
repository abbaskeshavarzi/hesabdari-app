# Priority 4 — Production Monitoring

## Current architecture

The application is deployed as a Next.js static export on GitHub Pages. Therefore there is no persistent Next.js server runtime in production.

Monitoring is intentionally split into:

1. Browser/runtime error capture
   - React error boundary
   - window `error`
   - unhandled promise rejection
2. Supabase request monitoring
   - authentication HTTP failures
   - RPC failures
   - database REST failures
   - network failures
   - request duration
3. Structured event format
   - timestamp
   - severity
   - event name
   - request/correlation id
   - route
   - category
   - status/duration metadata
4. Optional external transport
   - `NEXT_PUBLIC_MONITORING_ENDPOINT`
   - disabled by default
   - must be an HTTPS endpoint
   - must accept JSON events
   - no credential is stored in the frontend

## Privacy rules

Monitoring never intentionally records:

- passwords
- access tokens
- refresh tokens
- Authorization headers
- service-role keys
- database passwords
- connection strings
- API keys

URLs are reduced to pathname-only values before reporting, so query parameters are not sent.

User identity, email addresses, organization names, invoice contents, amounts, descriptions and other financial/PII fields are not part of the monitoring payload.

## Financial operations

The existing financial UI continues to use the existing RPCs and error-message handling. Priority 4 does not change financial calculations or transaction logic.

RPC/database HTTP failures are observed centrally by the Supabase client transport. This includes invoice, payment, expense and inventory RPC failures when Supabase returns a non-2xx response.

## Authentication

Authentication failures are observable through:

- Supabase auth request HTTP failures
- session-check failures
- authentication state changes

The monitoring layer does not record credentials or session/token values.

## Alerting

### Available immediately

- GitHub Actions failure notifications remain the deployment/CI alert mechanism.
- Supabase's own dashboard/logging facilities remain the source for database and Auth service-side diagnostics.

### External alerting

Repeated RPC failures, abuse-rate alerts, database threshold alerts and centralized incident notifications require an external monitoring backend.

The repository now supports an optional structured-event endpoint, but no external provider is connected in Priority 4 because that requires choosing a provider and configuring its project/endpoint.

A suitable next integration must provide:

- browser JavaScript error tracking
- source-map/release correlation
- issue grouping
- alert rules
- HTTPS ingestion
- data scrubbing
- retention controls
- access controls
- optional email/Slack-style notifications

Sentry is one example of a provider that supports project environments, event retrieval and alert-oriented project configuration; provider selection is intentionally left as a deployment decision. citeturn0search5turn0search11

## Supabase monitoring

The application cannot safely reproduce Supabase's server-side database/Auth logs in the browser. Those logs remain in the Supabase project dashboard and should be reviewed there for:

- Postgres/database errors
- Auth failures and suspicious authentication activity
- API errors
- RPC failures

No service-role key is added to the application to access these logs.

## Deployment failures

CI and GitHub Pages deployment remain GitHub Actions workflows. The existing workflows already run dependency audit, unit tests, lint, type checking, build verification and static-route smoke tests before/alongside deployment.

No new deployment credential or secret is introduced by Priority 4.

## Rollback

Priority 4 has no database migration and does not alter financial RPCs, tables or RLS policies. The code changes can therefore be reverted independently from database state.
