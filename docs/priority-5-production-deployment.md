# Priority 5 — Production Deployment Policy

## Current deployment model

The application is a Next.js 16 Pages Router application using `output: 'export'`. The browser talks directly to Supabase using the public Supabase URL and anon key. GitHub Actions builds the static `out/` directory and publishes it with GitHub Pages.

## Environment separation

The target model is:

- Development: local `.env.local`
- Staging: separate Supabase project and GitHub environment
- Production: production Supabase project and protected GitHub environment

The current repository does not yet contain a real staging deployment. Do not reuse production Supabase credentials for staging.

The Supabase URL and anon key are public client configuration values, but they still must be separated by environment so a staging build cannot accidentally point at production data.

## Secrets

Never put a Supabase service-role key, database password, JWT secret, or other private credential in frontend code or `NEXT_PUBLIC_*` variables.

Production Actions credentials should be stored in GitHub Actions Secrets/Environment Secrets. CI verification uses non-production placeholders.

## GitHub Pages limitation

GitHub Pages is a static host. It can serve this exported application and supports custom domains and HTTPS, but it does not provide a Next.js server runtime/API route layer.

Because GitHub Pages does not provide application-controlled HTTP response headers, headers such as HSTS, X-Content-Type-Options, Permissions-Policy, and a robust response-header CSP cannot be fully enforced from this repository while remaining on GitHub Pages.

Do not add fake `_headers` files and assume they are active on GitHub Pages.

## Deployment gate

Production deployment must run only after:

1. dependency audit
2. frontend secret guard
3. unit tests
4. lint/security gate
5. type check
6. production build verification
7. static route smoke tests

The deployment workflow now enforces this ordering.

## Rollback

GitHub Pages deployment history is tied to workflow deployments. Operational rollback should redeploy a previously verified commit. A future production hosting migration should additionally provide immutable deployment/version identifiers and a one-step rollback target.

## Migration trigger

Move the frontend from GitHub Pages to a Next.js-capable host before adding server-side features such as:

- Next.js API routes
- server-side authentication/session handling
- server-side secret usage
- webhooks
- server-side PDF generation
- background jobs
- server-side request validation
- application-controlled security response headers

A Next.js-capable host can also provide separate preview/staging and production deployments with environment-specific variables.

## Priority 5 scope

This document records deployment architecture and the current migration boundary. It does not change accounting business logic or database schema.
