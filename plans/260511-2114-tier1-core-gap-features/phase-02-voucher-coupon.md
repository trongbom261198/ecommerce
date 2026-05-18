# Phase 02 — Voucher / Coupon System

## Context Links
- Owning service: `BE/order-service`
- Migration: `V20__create_vouchers.sql` in `BE/user-service/.../db/migration/` **OR** order-service local migrations folder (order-service uses same Flyway baseline — see note below)
- FE touch: `FE/src/pages/CheckoutPage.tsx`, `FE/src/pages/CartPage.tsx`

> **Flyway location note:** The repo currently centralises migrations in `BE/user-service/src/main/resources/db/migration/`. To keep ownership clean, put voucher tables there as `V20__create_vouchers.sql` (sequential after V18). All services share one Postgres DB so this works.

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 6h
- Admin creates discount codes (percent or fixed amount) with constraints: min order amount, max discount cap (for percent), expiry window, usage limit (global + per-user). Customer enters code at checkout → server validates → discount applied → persisted on order.

## Key Insights
- Voucher belongs in **order-service** because it's applied at checkout, not on product browsing.
- Must be re-validated server-side at order creation (FE preview only). Never trust client-side discount.
- `usage_count` increments **only on successful order creation** — inside the checkout transaction → no race with concurrent checkouts under standard read-committed isolation (use `UPDATE ... WHERE usage_count < usage_limit` with affected-rows check).
- Flash sale items are already discounted — decision: voucher applies on top (cumulative). Discount calc base = `subtotal AFTER flash sale prices`.

## Requirements
**Functional:**
- POST `/api/v1/admin/vouchers` (ADMIN) — create
- GET `/api/v1/admin/vouchers?page&size` (ADMIN) — list with usage stats
- PUT `/api/v1/admin/vouchers/{id}` (ADMIN) — update (cannot reduce `usage_limit` below `usage_count`)
- DELETE `/api/v1/admin/vouchers/{id}` (ADMIN) — soft delete (set `active=false`)
- POST `/api/v1/vouchers/validate` — body `{code, subtotal}` → returns `{discount, finalTotal, valid, reason?}`
- Checkout body extended with optional `voucherCode` → server re-validates and stores result.

**Non-functional:**
- Validation latency < 100ms (single indexed lookup).
- No double-apply: per-user `voucher_redemptions(user_id, voucher_id)` unique constraint.

## Architecture

```
Admin creates code "SAVE10"  ──► vouchers table

User enters code at checkout (FE preview)
     │  POST /vouchers/validate
     ▼  VoucherService.validate(code, subtotal, userId)
     │   1. SELECT voucher WHERE code = ? AND active = true
     │   2. Check expiry, min_order, usage_limit, per_user usage
     │   3. Compute discount (percent vs fixed, apply max cap)
     │   4. Return preview (NO state change)

User clicks Place Order
     │  POST /orders { voucherCode, ... }
     ▼  OrderService.checkout (TX)
     │   1. Re-validate voucher (same logic)
     │   2. Subtract discount from total
     │   3. UPDATE vouchers SET usage_count = usage_count + 1
     │      WHERE id = ? AND usage_count < usage_limit
     │      → if 0 rows → throw ConflictException("Voucher exhausted")
     │   4. INSERT voucher_redemptions (user_id, voucher_id, order_id)
     │   5. Persist order.voucher_code, order.discount_amount
```

## Data Flow
- **In:** Admin POST/PUT voucher; user POST validate; user POST checkout w/ voucherCode
- **Persisted:** `vouchers`, `voucher_redemptions`; `orders.voucher_code`, `orders.discount_amount`
- **Out:** Preview discount; final order with `discountAmount`, `voucherCode`

## DB Schema (V20)

```sql
CREATE TYPE voucher_type AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE vouchers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(40) NOT NULL UNIQUE,
    description     VARCHAR(255),
    type            voucher_type NOT NULL,
    value           NUMERIC(12,2) NOT NULL,        -- 10 = 10% or 10000 VND
    min_order       NUMERIC(12,2) NOT NULL DEFAULT 0,
    max_discount    NUMERIC(12,2),                  -- nullable; cap for PERCENT
    usage_limit     INTEGER NOT NULL DEFAULT 0,    -- 0 = unlimited
    usage_count     INTEGER NOT NULL DEFAULT 0,
    per_user_limit  INTEGER NOT NULL DEFAULT 1,    -- 0 = unlimited
    valid_from      TIMESTAMP NOT NULL,
    valid_until     TIMESTAMP NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vouchers_code_active ON vouchers(code) WHERE active = true;

CREATE TABLE voucher_redemptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id  UUID NOT NULL REFERENCES vouchers(id),
    user_id     UUID NOT NULL,
    order_id    UUID NOT NULL,
    discount    NUMERIC(12,2) NOT NULL,
    redeemed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_redemptions_user_voucher ON voucher_redemptions(user_id, voucher_id);

ALTER TABLE orders
  ADD COLUMN voucher_code     VARCHAR(40),
  ADD COLUMN discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0;
```

## Files to Create

**BE (order-service):**
- `voucher/entity/Voucher.java`
- `voucher/entity/VoucherType.java` (enum)
- `voucher/entity/VoucherRedemption.java`
- `voucher/repository/VoucherRepository.java`
- `voucher/repository/VoucherRedemptionRepository.java`
- `voucher/dto/VoucherRequest.java`
- `voucher/dto/VoucherResponse.java`
- `voucher/dto/VoucherValidateRequest.java`
- `voucher/dto/VoucherValidateResponse.java`
- `voucher/service/VoucherService.java`
- `voucher/controller/AdminVoucherController.java`
- `voucher/controller/VoucherController.java`
- `voucher/mapper/VoucherMapper.java`
- `db/migration/V20__create_vouchers.sql` (in user-service path — shared DB)

**FE:**
- `src/types/voucher.ts`
- `src/services/voucher-service.ts`
- `src/components/voucher/VoucherInput.tsx` (input + apply button + status line)
- `src/pages/admin/AdminVouchersPage.tsx` (table + create modal)

## Files to Modify

**BE:**
- `BE/order-service/.../dto/CheckoutRequest.java` — add `String voucherCode`
- `BE/order-service/.../dto/OrderResponse.java` — add `String voucherCode`, `BigDecimal discountAmount`
- `BE/order-service/.../service/OrderService.java` — integrate voucher in `checkout()` transaction
- `BE/order-service/.../entity/Order.java` — add `voucherCode`, `discountAmount`
- `BE/order-service/.../email/EmailTemplates.java` — show discount line in order confirmation
- `BE/api-gateway` route config — add `/api/v1/vouchers/**` and `/api/v1/admin/vouchers/**` (covered by existing `/api/v1/orders` host already pointing to order-service? Verify; if gateway routes by service prefix, add new routes)

**FE:**
- `FE/src/pages/CheckoutPage.tsx` — mount `<VoucherInput>`, recompute totals
- `FE/src/pages/CartPage.tsx` — optional voucher preview
- `FE/src/services/orderService.ts` — `checkout()` accepts `voucherCode`
- `FE/src/pages/admin/...` — register `AdminVouchersPage` route

## Implementation Steps

1. `V20__create_vouchers.sql` → apply via user-service (Flyway baseline).
2. Entity + repository + DTOs.
3. `VoucherService.validate(code, subtotal, userId)` — pure read-only validation.
4. `VoucherService.redeem(voucher, userId, orderId, finalDiscount)` — atomic update + insert redemption row.
5. `AdminVoucherController` — CRUD with role check.
6. `VoucherController.validate` — public endpoint requiring user (X-User-Id header).
7. Modify `OrderService.checkout`:
   - After computing subtotal (with flash sale prices), if `voucherCode` present → `validate()` again, subtract discount, then inside same TX `redeem()`.
   - Persist `voucher_code` + `discount_amount` on `Order` entity.
8. FE service + types.
9. `VoucherInput.tsx` — debounced apply on blur or button click; show error or success line.
10. Plug into CheckoutPage between subtotal and shipping; update final total math.
11. Admin page: table with code, type, value, usage_count/usage_limit, dates, active toggle; create modal.
12. Tests: validation matrix (expired, exhausted, min-order-not-met, per-user-exceeded, percent-cap).

## Todo List

- [ ] V20 migration
- [ ] BE entities, repositories, DTOs
- [ ] VoucherService.validate
- [ ] VoucherService.redeem (atomic)
- [ ] Admin + public controllers
- [ ] OrderService.checkout integration
- [ ] Order entity + DTO + email template
- [ ] FE service + types
- [ ] VoucherInput component
- [ ] Checkout integration + total recalc
- [ ] Admin vouchers page
- [ ] Unit tests for validation matrix
- [ ] Manual E2E: create code → apply at checkout → verify order persists discount

## Success Criteria

- Admin creates `SAVE10` (10%, min 100k, cap 50k, limit 100).
- User enters `SAVE10` on a 200k cart → sees `-20,000 VND` line, total `180,000`.
- After 100 redemptions, user 101 sees "Mã đã hết lượt".
- Same user re-applying same code (per_user_limit=1) on second order → "Bạn đã dùng mã này".
- Order detail page shows discount line + voucher code.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Concurrent redemptions exceed usage_limit | M | H | `UPDATE ... WHERE usage_count < usage_limit` with row count check — atomic at DB level |
| FE-computed total diverges from BE | M | M | BE is source of truth; FE always shows BE-returned `finalTotal` after validate |
| Admin reduces usage_limit below current count | L | L | Reject in PUT handler if `newLimit < usage_count` |
| Voucher applies to non-eligible items (future scope) | N/A | N/A | Out of scope v1 — code applies to whole order. YAGNI. |
| Flash sale + voucher stacking abuse | M | M | Documented: voucher applies after flash sale price → max combined discount surfaced in cart UI |

## Security Considerations
- Admin endpoints check `X-User-Role == ADMIN`.
- Validate endpoint requires `X-User-Id` (rate-limit if abuse seen).
- Code stored as-is (no hashing — codes are public-ish marketing assets).
- Validation never reveals "this code exists but you can't use it" beyond minimal reason codes.

## Backwards Compatibility
- New `orders.voucher_code` + `discount_amount` columns default to NULL/0 → old orders unaffected.
- Old checkout requests without `voucherCode` still work (field is optional).

## Rollback Plan
- BE: drop tables, drop new columns on `orders`.
- FE: hide `VoucherInput` via `FEATURES.vouchers = false`.

## Next Steps / Dependencies
- Tier 2: category-scoped vouchers, first-order-only, free-shipping vouchers, voucher hub UI for users.
