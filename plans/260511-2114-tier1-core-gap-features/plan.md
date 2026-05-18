---
title: "Tier 1 Core Gap Features"
description: "Reviews, Vouchers, Wishlist, Search Autocomplete, Google OAuth2 — close core gap vs Shopee/Lazada/Tiki"
status: in-progress
priority: P1
effort: 28h
branch: main
tags: [reviews, vouchers, wishlist, search, oauth2, tier1]
created: 2026-05-11
---

# Tier 1 — Core Gap Features

Five customer-facing gaps that drive drop-off versus Shopee/Lazada/Tiki. Each phase is self-contained and shippable independently.

## Phases

| # | Phase | Owner Service | DB | Effort | Status |
|---|-------|---------------|----|--------|--------|
| 1 | [Reviews & Ratings](phase-01-reviews-ratings.md) | product-service | V2 (product-svc) | 7h | **complete** |
| 2 | [Voucher / Coupon](phase-02-voucher-coupon.md) | order-service | V20 | 6h | pending |
| 3 | [Persistent Wishlist](phase-03-persistent-wishlist.md) | user-service | V21 | 3h | pending |
| 4 | [Search Autocomplete](phase-04-search-autocomplete.md) | product-service | none (ES only) | 4h | **complete** |
| 5 | [Google OAuth2](phase-05-google-oauth2.md) | user-service | V19 (user-svc) | 8h | **complete** |

## Dependency Graph

```
Phase 1 (Reviews) ─── needs Kafka topic ORDER_DELIVERED (already exists)
Phase 2 (Voucher) ── independent
Phase 3 (Wishlist) ─ independent
Phase 4 (Search) ── independent (ProductDocument already indexed)
Phase 5 (OAuth2) ── independent; touches User entity (V22 adds provider columns)
```

All five phases are **parallelisable** — no inter-phase blockers. File ownership is fully disjoint.

## File Ownership Matrix

| Phase | Owns (no overlap) |
|-------|------------------|
| 1 | `BE/product-service/.../review/**`, `FE/src/components/review/**`, `V19__create_reviews.sql` |
| 2 | `BE/order-service/.../voucher/**`, `FE/src/components/voucher/**`, `V20__create_vouchers.sql` |
| 3 | `BE/user-service/.../wishlist/**`, `FE/src/store/wishlistStore.ts`, `V21__create_wishlists.sql` |
| 4 | `BE/product-service/.../service/ProductSuggestService.java`, `FE/src/components/layout/SearchBox.tsx` (extend) |
| 5 | `BE/user-service/.../oauth/**`, `BE/api-gateway/.../OAuth2RedirectFilter.java` (new), `V22__add_oauth_providers.sql` |

Files touched by **multiple phases** (must be sequenced):
- `FE/src/services/api.ts` — append new service objects (each phase adds a separate export, no conflict)
- `BE/common/.../KafkaTopics.java` — phase 1 adds `REVIEW_SUBMITTED` (optional)
- `FE/src/App.tsx` route table — phase 1 adds `/reviews/...`, phase 5 adds `/oauth/callback` (sequential merge)

## Cross-Cutting Decisions

1. **JWT propagation:** All new authenticated endpoints rely on existing `X-User-Id` / `X-User-Role` headers injected by the API gateway. No new gateway filter needed except phase 5 (OAuth2 callback).
2. **Error format:** All endpoints reuse `ApiResponse<T>` + existing exception classes (`NotFoundException`, `ConflictException`, `BusinessException`).
3. **DB ownership:** Each phase writes Flyway migrations in the **owning service's** `db/migration/` directory. Reviews → product-service, Vouchers → order-service, Wishlist → user-service, OAuth → user-service.
4. **No new infra:** Reuses existing Postgres, Redis, Kafka, Elasticsearch, MinIO. Zero new docker-compose services.
5. **YAGNI:** No review moderation, no voucher stacking, no shared-wishlist features, no OAuth providers beyond Google in v1.

## Test Matrix (high level)

| Layer | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|-------|---------|---------|---------|---------|---------|
| Unit | rating aggregation | voucher calculation | wishlist add/remove | ES query builder | OAuth state CSRF |
| Integration | review creation + purchase verification | checkout with voucher | wishlist CRUD endpoints | suggest endpoint | OAuth callback → JWT |
| E2E (manual) | submit + display | apply + see discount | sync on login | type in search → suggestions | click Google → logged in |

## Rollback Plan

Each phase is independently revertable:
- BE: remove controller + service + revert Flyway migration (write down-migration script)
- FE: hide UI behind feature flag in `FE/src/config/features.ts` (create on phase 1)

## Success Criteria (observable)

- Phase 1: User who bought order in `DELIVERED` state can POST a review; product page shows avg star + count + paginated reviews.
- Phase 2: Admin creates code "SAVE10"; user enters it at checkout, sees discount line, order persists `discount_amount` and `voucher_code`.
- Phase 3: User clicks heart on product card while logged in; reloads page on another tab; heart still red. Logout clears local mirror.
- Phase 4: User types 2+ chars in search box; dropdown shows top 8 product suggestions in <200ms.
- Phase 5: User clicks "Continue with Google"; lands back on home with valid JWT and a user row (provider=GOOGLE).

## Feature Flag Setup (created in phase 1, reused by all phases)

`FE/src/config/features.ts`:
```ts
export const FEATURES = {
  reviews: true,
  vouchers: true,
  wishlist: true,
  searchAutocomplete: true,
  googleOAuth: true,
} as const;
```

Allows partial rollout: set any flag to `false` to hide UI without redeploying BE.
