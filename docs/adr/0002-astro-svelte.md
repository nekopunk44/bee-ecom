# Astro SSR and independent Svelte admin

Status: accepted for foundation, 2026-09-22.

## Context

Public catalog pages need SEO and low JavaScript cost; operations screens need richer interaction.

## Decision

Use Astro Node SSR with Svelte 5 islands and a separate Svelte/Vite admin SPA. Share tokens and generated contracts only.

## Alternatives

One shared SPA compromises public rendering; separate duplicated contracts drift.

## Consequences

No storefront SPA router. RU/RO share one template. Foundation storefront ships zero client JavaScript. Astro session APIs are not used; auth state belongs to the API.
