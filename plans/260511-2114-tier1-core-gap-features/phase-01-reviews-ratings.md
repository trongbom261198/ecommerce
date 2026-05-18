# Phase 01 — Product Reviews & Ratings

## Context Links
- Owning service: `BE/product-service`
- Related: `BE/order-service` (purchase verification via Kafka), `FE/src/pages/ProductDetailPage.tsx`
- Migration: `V19__create_reviews.sql` in `BE/product-service/src/main/resources/db/migration/`

## Overview
- **Priority:** P1
- **Status:** complete
- **Effort:** 7h
- Allow authenticated users to post text + 1–5 star rating on products they purchased and received. Aggregate avg rating + total count on the product. Display reviews paginated on the product detail page.

## Key Insights
- product-service has no DB writes for reviews today — it owns products and uses Postgres + Elasticsearch.
- Purchase verification: the **simple** path is a Feign-style cross-service call to `order-service`. The **event-driven** path consumes `ORDER_DELIVERED` and stores `purchased_products(user_id, product_id)` lookup in product-service. We choose **event-driven** to avoid synchronous coupling and to allow reviewing even if order-service is briefly down.
- Avg rating is denormalised on `products` table to avoid expensive aggregation on every product list page.

## Requirements
**Functional:**
- POST `/api/v1/products/{productId}/reviews` — body: `{rating: 1-5, comment: string}`. Auth required.
- GET `/api/v1/products/{productId}/reviews?page=0&size=10&sort=newest|highest|lowest` — public.
- GET `/api/v1/products/{productId}/reviews/summary` — public; returns `{averageRating, totalReviews, distribution: {1: n, 2: n, ...}}`.
- DELETE `/api/v1/reviews/{reviewId}` — author or ADMIN only.
- One review per (user, product). PUT updates existing review.

**Non-functional:**
- Review write: < 300ms p95.
- Summary read: served from `products` table (denormalised), no live aggregation.
- Rating update propagates to Elasticsearch `ProductDocument` (add `avgRating`, `reviewCount` fields).

## Architecture

```
Order delivered (order-service)
        │
        ▼ Kafka: order.delivered (existing topic)
        │
   product-service consumer ──► purchased_products table (idempotent insert)

User POST review
        │
        ▼ ReviewService.create()
        │   1. Check purchased_products(user_id, product_id) exists → else 403
        │   2. Check no existing review by (user, product) → else conflict (or update)
        │   3. Insert into reviews
        │   4. Recompute avg + count → UPDATE products
        │   5. Push update to Elasticsearch (avgRating, reviewCount)
```

## Data Flow
- **In:** `OrderDeliveredEvent { orderId, userId, items[{productId}] }` from Kafka
- **In:** HTTP POST/PUT/DELETE review from FE
- **Out:** `ProductDocument` reindex with updated `avgRating` + `reviewCount`
- **Out:** `ReviewResponse` JSON to FE

## DB Schema (V19)

```sql
-- Eligibility lookup; populated by order.delivered consumer
CREATE TABLE purchased_products (
    user_id     UUID NOT NULL,
    product_id  UUID NOT NULL,
    first_delivered_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, product_id)
);
CREATE INDEX idx_purchased_user ON purchased_products(user_id);

CREATE TABLE reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    user_name   VARCHAR(255) NOT NULL,             -- snapshot
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, user_id)
);
CREATE INDEX idx_reviews_product ON reviews(product_id, created_at DESC);

-- Denormalised aggregates on products
ALTER TABLE products
  ADD COLUMN avg_rating   NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN review_count INTEGER       NOT NULL DEFAULT 0;
```

## Files to Create

**BE (product-service):**
- `entity/Review.java`
- `entity/PurchasedProduct.java` (composite key)
- `repository/ReviewRepository.java`
- `repository/PurchasedProductRepository.java`
- `dto/ReviewRequest.java`
- `dto/ReviewResponse.java`
- `dto/ReviewSummaryResponse.java`
- `service/ReviewService.java`
- `controller/ReviewController.java`
- `consumer/OrderDeliveredConsumer.java` (subscribes to `order.delivered`)
- `mapper/ReviewMapper.java`
- `src/main/resources/db/migration/V19__create_reviews.sql`

**FE:**
- `src/types/review.ts`
- `src/services/reviewService.ts`
- `src/components/review/ReviewSummary.tsx` (stars + distribution bar)
- `src/components/review/ReviewList.tsx` (paginated)
- `src/components/review/ReviewForm.tsx` (only shown if `canReview`)
- `src/components/review/StarRating.tsx` (reusable, controllable)
- `src/config/features.ts` (created here, reused by all phases)

## Files to Modify

**BE:**
- `BE/product-service/.../document/ProductDocument.java` — add `avgRating: Double`, `reviewCount: Integer`
- `BE/product-service/.../service/ElasticsearchSyncService.java` — include new fields in sync
- `BE/product-service/.../dto/ProductResponse.java` — expose `avgRating`, `reviewCount`
- `BE/api-gateway` route config — ensure `/api/v1/products/*/reviews/**` routes to product-service (already covered by `/api/v1/products/**`)

**FE:**
- `FE/src/pages/ProductDetailPage.tsx` — mount `<ReviewSummary>` + `<ReviewList>` + `<ReviewForm>`
- `FE/src/components/product/ProductCard.tsx` — show star + count badge
- `FE/src/types/product.ts` — add `avgRating?: number`, `reviewCount?: number`

## Implementation Steps

1. Write `V19__create_reviews.sql` + run product-service to confirm Flyway applies cleanly.
2. Build entities + repositories (`Review`, `PurchasedProduct`).
3. Implement `OrderDeliveredConsumer` — idempotent `INSERT ... ON CONFLICT DO NOTHING` for each item.
4. Implement `ReviewService.create / update / delete / list / summary` with eligibility checks.
5. Implement `ReviewService.recalculateAggregates(productId)` — single SQL `UPDATE products SET avg_rating = (SELECT AVG(rating)...)`. Call after every write.
6. Push avg/count update to Elasticsearch via existing `ElasticsearchSyncService.syncProduct(productId)`.
7. Add `ProductDocument.avgRating + reviewCount` fields → trigger one-time `POST /products/es-resync` after deploy.
8. Build `ReviewController` with 5 endpoints.
9. FE: `reviewService.ts` (axios calls), `StarRating.tsx`, then list + form + summary components.
10. Wire into `ProductDetailPage.tsx` — fetch summary + first page of reviews on mount; show form only if user is authenticated AND `canReview` flag returned by summary endpoint (BE checks `purchased_products`).
11. Add `avgRating` badge to `ProductCard.tsx`.

## Todo List

- [x] V2 migration (product-service) + apply — purchased_products, reviews, ALTER products
- [x] BE entities + repositories (Review, PurchasedProduct, PurchasedProductId)
- [x] OrderReviewEligibleConsumer — listens to new `order.review_eligible` topic
- [x] ReviewService (create / update / delete / list / summary + canReview flag)
- [x] Aggregate recalc + ES sync hook (recalculateAggregates → syncProduct)
- [x] ReviewController + DTOs (5 endpoints)
- [x] ProductDocument avgRating + reviewCount fields
- [x] FE service + types (review-service.ts, review.ts)
- [x] FE components: StarRating, ReviewSummary, ReviewList, ReviewForm
- [x] Wire into ProductDetailPage + ProductCard
- [ ] Unit tests (eligibility, aggregate)
- [ ] Manual E2E: deliver order → submit review → see on PDP
- **Note:** Used new Kafka topic `order.review_eligible` (order-service publishes on DELIVERED) instead of consuming `order.delivered` directly — OrderDeliveredEvent lacked userId/productIds. KafkaConfig consumer factory added to product-service.

## Success Criteria

- A user with a `DELIVERED` order for product P can POST a review; one without cannot (403).
- Product P's avg rating updates within 1s of review POST (verified via `GET /products/{id}` showing new avg).
- ProductCard shows star badge when `reviewCount > 0`.
- Distribution endpoint returns counts for each 1–5 star bucket.
- Duplicate POST by same user → 409 conflict.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Kafka consumer misses `order.delivered` during deploy | M | M | Idempotent insert + manual backfill script reading `orders` table cross-service (one-time admin endpoint) |
| Avg recompute race condition under concurrent writes | L | L | Recompute uses `SELECT AVG()` on every write → eventually consistent; acceptable trade-off vs row lock |
| ES `avgRating` drift from Postgres | M | L | Daily scheduled job to rebuild `ProductDocument` from Postgres (already used in `resyncAllToElasticsearch`) |
| Review spam / abuse | M | L | Out of scope v1 — defer moderation to Tier 2. YAGNI. |

## Security Considerations
- Rating must be 1–5 (DB CHECK + DTO `@Min(1) @Max(5)`).
- Comment max length 2000 chars (DTO `@Size`).
- DELETE checks `userId == review.userId OR role == ADMIN`.
- `user_name` snapshotted at review time → renaming user does not break old reviews.

## Backwards Compatibility
- New columns on `products` default to 0 → existing product reads unaffected.
- `ProductDocument` new fields are optional → old documents still indexable until next resync.

## Rollback Plan
- BE: revert via `V19__create_reviews_down.sql` (drop tables + columns).
- FE: set `FEATURES.reviews = false` → all components return null.

## Next Steps / Dependencies
- Tier 2: review images, helpful votes, moderation queue, seller replies.
