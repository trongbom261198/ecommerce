# Phase 03 — Persistent Wishlist

## Context Links
- Owning service: `BE/user-service`
- Migration: `V21__create_wishlists.sql` in `BE/user-service/src/main/resources/db/migration/`
- FE: heart UI already exists in `FE/src/components/product/ProductCard.tsx` (currently local state only — needs verification & wiring)

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 3h
- Authenticated users can save products to a wishlist; persists across devices. Anonymous users get localStorage-only fallback; on login, merge local → server.

## Key Insights
- Smallest phase — pure CRUD on `(user_id, product_id)` pairs.
- SKU-level wishlist is YAGNI — users save products, not variants. If needed later, add `sku_id` column nullable.
- Merge-on-login is the only nuance — pull local items into server before clearing local store.

## Requirements
**Functional:**
- POST `/api/v1/wishlist` — body `{productId}` → 201
- DELETE `/api/v1/wishlist/{productId}` → 204
- GET `/api/v1/wishlist?page&size` — paginated list with hydrated product summaries
- GET `/api/v1/wishlist/ids` — lightweight: just product ID list (for heart-state on product cards)
- POST `/api/v1/wishlist/merge` — body `{productIds: UUID[]}` → batch upsert (on login)

**Non-functional:**
- `/wishlist/ids` returns in <100ms (single indexed query).
- Hydrated list joins to product-service via batch HTTP call (or store snapshot — see decision below).

**Decision:** For hydrated list, user-service does an internal HTTP call to `product-service` `GET /products?ids=a,b,c` (new bulk endpoint needed in phase 4 anyway or add small endpoint here). Alternative: snapshot product name + price + image into `wishlists` row. **Chosen:** live fetch — wishlist isn't high-traffic, stale snapshot is worse UX than 1 extra hop.

## Architecture

```
FE (logged in)
  │ POST /wishlist {productId}
  ▼ WishlistService.add(userId, productId)  →  wishlists table (UPSERT)

FE (anon)
  │ saves to localStorage["wishlist"] = [productId, ...]
  │
  ▼ on login (authStore.login success):
       wishlistService.merge(localIds) → server upserts → clear local

FE state (Zustand wishlistStore)
  - holds Set<productId>
  - hydrate on mount if isAuthenticated → GET /wishlist/ids
  - mirror to localStorage when anon
```

## DB Schema (V21)

```sql
CREATE TABLE wishlists (
    user_id     UUID NOT NULL,
    product_id  UUID NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, product_id)
);
CREATE INDEX idx_wishlists_user ON wishlists(user_id, created_at DESC);
```

No FK to `products` (lives in product-service write path through same DB — but per project convention we keep service tables self-contained for ownership clarity).

## Files to Create

**BE (user-service):**
- `wishlist/entity/Wishlist.java` (with `@IdClass` composite key)
- `wishlist/entity/WishlistId.java`
- `wishlist/repository/WishlistRepository.java`
- `wishlist/dto/WishlistAddRequest.java`
- `wishlist/dto/WishlistMergeRequest.java`
- `wishlist/dto/WishlistItemResponse.java` (hydrated)
- `wishlist/service/WishlistService.java`
- `wishlist/service/ProductLookupClient.java` (HTTP client to product-service)
- `wishlist/controller/WishlistController.java`
- `db/migration/V21__create_wishlists.sql`

**FE:**
- `src/store/wishlist-store.ts` (Zustand)
- `src/services/wishlist-service.ts`
- `src/hooks/use-wishlist.ts` (hydrate + sync helpers)
- `src/pages/WishlistPage.tsx`

## Files to Modify

**BE:**
- `BE/api-gateway` route config — add `/api/v1/wishlist/**` → user-service
- `BE/user-service/.../config/SecurityConfig.java` — already JWT-protected globally; verify

**FE:**
- `FE/src/components/product/ProductCard.tsx` — connect heart click → `useWishlist().toggle(productId)`
- `FE/src/store/authStore.ts` — call `wishlistStore.mergeAndHydrate()` after successful login
- `FE/src/components/layout/Navbar.tsx` — add heart icon → link to `/wishlist`
- `FE/src/App.tsx` — add `/wishlist` route

## Implementation Steps

1. V21 migration.
2. Entity + composite ID + repository.
3. `WishlistService.add / remove / list / ids / merge`.
4. `ProductLookupClient` — `RestClient` (Spring 6) call to `http://product-service:8082/api/v1/products?ids=...`. If endpoint doesn't accept multi-id today, loop or add bulk endpoint to product-service (one method on existing ProductController).
5. `WishlistController` — 5 endpoints all requiring `X-User-Id`.
6. FE Zustand store: `{ids: Set<string>, isHydrated, add, remove, toggle, mergeAndHydrate, clear}`. Persist to localStorage when anon.
7. `useWishlist()` hook — exposes `isInWishlist(id)` + actions; on mount checks auth state.
8. Hook into `authStore.login` success → `wishlistStore.mergeAndHydrate()`.
9. Hook into `authStore.logout` → keep local mirror; do not clear.
10. Wire `ProductCard` heart → toggle. Solid heart if in wishlist.
11. `WishlistPage` — grid of `ProductCard` with remove button.
12. Add navbar heart with count badge.

## Todo List

- [ ] V21 migration
- [ ] BE entity + repository
- [ ] WishlistService + ProductLookupClient
- [ ] WishlistController (5 endpoints)
- [ ] Bulk product lookup in product-service (if not present)
- [ ] Gateway route
- [ ] FE Zustand store + persistence
- [ ] FE service + hook
- [ ] Merge-on-login wiring in authStore
- [ ] ProductCard heart wiring
- [ ] Navbar heart + count
- [ ] WishlistPage
- [ ] Manual E2E: anon save → login → see merged → reload device 2 → see same items

## Success Criteria

- Anon user saves product A → reloads tab → heart still red (localStorage).
- Anon user logs in → server now has product A in wishlist.
- Login on second device → same wishlist shown.
- Wishlist page lists products with thumbnail + price + remove.
- Heart icon in navbar shows count.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stale product info in wishlist (renamed/deleted) | M | L | Live fetch via ProductLookupClient — if product 404, skip in response |
| Merge spams server with deleted/invalid IDs | L | L | BE filter — only insert IDs that exist (skip silently) |
| ProductLookupClient timeout slows wishlist page | L | M | 1s timeout, fail open (show ID-only list with placeholder) |
| Inter-service call adds latency in hot path | L | L | Only `/wishlist` (full list) calls product-service; `/wishlist/ids` doesn't |

## Security Considerations
- All endpoints require `X-User-Id`.
- DELETE only removes own rows (`WHERE user_id = ? AND product_id = ?`).
- Merge accepts max 200 IDs per call (DTO `@Size(max=200)`).

## Backwards Compatibility
- New table — no migration of existing data needed.
- FE heart UI continues working in anon mode unchanged.

## Rollback Plan
- BE: drop `wishlists` table.
- FE: `FEATURES.wishlist = false` → heart hidden in ProductCard, route 404.

## Next Steps / Dependencies
- Tier 2: SKU-level wishlist, wishlist sharing, "back-in-stock" notifications.
