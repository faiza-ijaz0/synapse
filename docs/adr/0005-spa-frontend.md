# ADR-0005: Client-rendered React SPA built with Vite

Status: Accepted · 2026-10-28

## Decision

React 19 + Vite 8 SPA. Vite proxies `/api` in development. In production mode,
Express serves the built assets from the same origin. Tailwind 4, shadcn/ui
(components copied into the repo, Radix underneath), TanStack Query for server
state, React Hook Form + Zod for forms, Recharts for charts, and Motion only
where it aids comprehension.

## Rationale

A local tool has no SEO or edge-rendering needs. Serving from the same origin
keeps cookies `SameSite=Strict` and avoids CORS complexity.

## Alternatives

Next.js or other SSR frameworks: they add a server runtime with no benefit here,
and blur the API boundary that this project wants to demonstrate.
