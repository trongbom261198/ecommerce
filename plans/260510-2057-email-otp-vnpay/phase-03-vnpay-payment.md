# Phase 03 — VNPay Payment Gateway

**Priority:** P1
**Status:** completed
**Effort:** 6h
**Depends on:** Phase 01 (EmailService — for receipts; optional)
**Owner files:** `BE/order-service/.../payment/*`, V17 migration, FE `pages/Payment*`

## Context Links
- Scout finding: only `PaymentStatus` enum + `paymentMethod` field exist on `Order`. No VNPay code.
- User decision: integrate into `order-service` (not a new service).
- Research: HMAC-SHA512 hex uppercase signature; sandbox card `9704198526191432198`.
- Existing FE checkout payment options: `COD`, `BANK_TRANSFER` — adding `VNPAY`.

## Overview
Add VNPay as a third payment method. After order creation user is redirected to VNPay's hosted page, completes payment, then VNPay sends an asynchronous IPN webhook back to our service. The IPN handler verifies signature and updates `orders.payment_status`. A separate `payments` table provides idempotency and audit.

## Key Insights
- **IPN is source of truth** for payment status (not the browser return URL).
- **Idempotency** is critical — VNPay may retry IPN calls; we must respond consistently.
- **Signature**: HMAC-SHA512 of sorted `vnp_*` params (excluding `vnp_SecureHash`), hex-encoded uppercase.
- **Public IPN endpoint** — must be reachable without JWT (added to gateway public-paths).
- **VNPay amount** is in VND × 100 (e.g., 100000 VND → `vnp_Amount = 10000000`).
- Reusing existing `Order` entity — only adding payment record + status updates.

## Requirements

### Functional
- F1: `POST /api/v1/payments/vnpay/create {orderId}` → builds VNPay payment URL with valid signature and creates a `payments` row (status `PENDING`). Returns `{ paymentUrl, vnpTxnRef }`.
- F2: `GET /api/v1/payments/vnpay/return` → consumes VNPay's redirect after user pays, verifies signature, returns a JSON status (FE may call this OR parse query params directly to display result page).
- F3: `POST /api/v1/payments/vnpay/ipn` → consumes VNPay's async webhook. Verifies signature → idempotent update of `payments.status` and `orders.payment_status`. Always responds with VNPay's required JSON `{RspCode, Message}`.
- F4: When IPN reports success → `orders.payment_status = PAID` and email receipt sent (best-effort).
- F5: FE adds VNPay option to `CheckoutPage`, navigates to `paymentUrl` after order creation if selected; new `PaymentResultPage` reads return params and shows success/fail.

### Non-Functional
- NF1: Signature verification must be constant-time.
- NF2: All amounts persisted in `BigDecimal(19,2)` matching `orders` schema.
- NF3: All files ≤ 200 lines; split helpers (`VNPaySignatureUtil`, `VNPayUrlBuilder`) if needed.
- NF4: IPN endpoint must respond < 5s (per VNPay spec).

## Architecture

### Data Flow

**Create payment:**
```
FE → POST /payments/vnpay/create {orderId}
    → PaymentController.createVNPay
    → VNPayService.createPaymentUrl(order, ipAddress)
        ├─ generate vnpTxnRef = orderNumber + "-" + timestamp
        ├─ build params map (vnp_Amount = total*100, vnp_OrderInfo, vnp_ReturnUrl, etc.)
        ├─ compute HMAC-SHA512 over sorted params
        ├─ INSERT INTO payments (order_id, vnp_txn_ref, amount, status='PENDING', ...)
        └─ return paymentUrl
    → 200 { paymentUrl, vnpTxnRef }
FE → window.location = paymentUrl
```

**IPN (server-to-server):**
```
VNPay → POST /payments/vnpay/ipn (query string params)
    → PaymentController.ipn
    → VNPayService.handleIpn(params)
        ├─ verify HMAC-SHA512 signature → if bad: return {RspCode:"97"}
        ├─ find payments WHERE vnp_txn_ref = params.vnp_TxnRef
        │   └─ if missing: return {RspCode:"01"}
        ├─ if payments.status != 'PENDING': return {RspCode:"02"} (already processed)
        ├─ if amount mismatch: return {RspCode:"04"}
        ├─ if vnp_ResponseCode == "00":
        │   ├─ payments.status = 'PAID'; persist
        │   ├─ orders.payment_status = PAID; persist (state-machine event optional)
        │   └─ emailService.sendPaymentReceipt(...) [best-effort]
        ├─ else: payments.status = 'FAILED'; orders.payment_status = FAILED
        └─ return {RspCode:"00", Message:"Confirm Success"}
```

**Return URL (browser):**
```
VNPay → 302 redirect → http://fe-host/payment-result?vnp_*=...
FE → PaymentResultPage reads query params
    → optionally calls GET /payments/vnpay/return?... for verify display
    → shows success/fail UI; navigates to /orders/:id
```

### Module Layout
```
order-service/.../payment/
├── controller/PaymentController.java        # 3 endpoints
├── service/VNPayService.java                # core logic
├── service/VNPaySignatureUtil.java          # HMAC-SHA512 + verify
├── service/VNPayUrlBuilder.java             # param map + URL build
├── config/VNPayProperties.java              # @ConfigurationProperties
├── entity/Payment.java                      # JPA mapping for payments table
├── entity/PaymentRecordStatus.java          # enum: PENDING, PAID, FAILED
├── repository/PaymentRepository.java
├── dto/CreatePaymentRequest.java            # {orderId}
├── dto/CreatePaymentResponse.java           # {paymentUrl, vnpTxnRef}
└── dto/IpnResponse.java                     # {RspCode, Message}
```

### V17 Migration

Path: `BE/user-service/src/main/resources/db/migration/V17__create_payments.sql`
(per project convention — ALL Flyway migrations live in user-service module)

```sql
CREATE TABLE payments (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID          NOT NULL REFERENCES orders(id),
    vnp_txn_ref     VARCHAR(100)  NOT NULL UNIQUE,
    amount          DECIMAL(19,2) NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    vnp_response_code VARCHAR(10),
    vnp_transaction_no VARCHAR(50),
    vnp_bank_code   VARCHAR(20),
    vnp_pay_date    VARCHAR(20),
    raw_response    JSONB,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id    ON payments(order_id);
CREATE INDEX idx_payments_vnp_txn_ref ON payments(vnp_txn_ref);
CREATE INDEX idx_payments_status      ON payments(status);
```

### Configuration (`order-service/application.yml`)
```yaml
vnpay:
  tmn-code: ${VNPAY_TMN_CODE:}
  hash-secret: ${VNPAY_HASH_SECRET:}
  pay-url: ${VNPAY_PAY_URL:https://sandbox.vnpayment.vn/paymentv2/vpcpay.html}
  return-url: ${VNPAY_RETURN_URL:http://localhost:5173/payment-result}
  ipn-url: ${VNPAY_IPN_URL:http://localhost:8080/api/v1/payments/vnpay/ipn}
  version: "2.1.0"
  command: "pay"
  curr-code: "VND"
  locale: "vn"
```

### Gateway Routes & Public Paths

`api-gateway/application.yml`:
- Add route:
  ```yaml
  - id: payment-service
    uri: http://localhost:8083
    predicates:
      - Path=/api/v1/payments/**
  ```
- Append to `app.public-paths`:
  - `/api/v1/payments/vnpay/ipn`
  - `/api/v1/payments/vnpay/return`

(Note: `/payments/vnpay/create` requires JWT — only authenticated user creates payment.)

## Related Code Files

### Modify
- `BE/order-service/src/main/resources/application.yml` — add `vnpay:` block.
- `BE/api-gateway/src/main/resources/application.yml` — add route + public paths.
- `FE/src/pages/CheckoutPage.tsx` — add `VNPAY` option to payment radio + post-checkout redirect.
- `FE/src/App.tsx` — add `/payment-result` route.

### Create

**Backend:**
- `BE/user-service/src/main/resources/db/migration/V17__create_payments.sql`
- `BE/order-service/.../payment/config/VNPayProperties.java`
- `BE/order-service/.../payment/entity/Payment.java`
- `BE/order-service/.../payment/entity/PaymentRecordStatus.java`
- `BE/order-service/.../payment/repository/PaymentRepository.java`
- `BE/order-service/.../payment/dto/CreatePaymentRequest.java`
- `BE/order-service/.../payment/dto/CreatePaymentResponse.java`
- `BE/order-service/.../payment/dto/IpnResponse.java`
- `BE/order-service/.../payment/service/VNPaySignatureUtil.java`
- `BE/order-service/.../payment/service/VNPayUrlBuilder.java`
- `BE/order-service/.../payment/service/VNPayService.java`
- `BE/order-service/.../payment/controller/PaymentController.java`

**Frontend:**
- `FE/src/services/paymentService.ts`
- `FE/src/pages/PaymentResultPage.tsx`

### Delete
- None.

## Implementation Steps

### Backend

1. **V17 migration** — create file with the SQL above. Run user-service to apply (or `mvn -pl user-service flyway:migrate`).
2. **`VNPayProperties`** — `@ConfigurationProperties(prefix="vnpay")` holding fields above.
3. **`Payment` entity** — JPA `@Table("payments")`, fields matching V17. Use `@JdbcTypeCode(SqlTypes.JSON)` for `raw_response`.
4. **`PaymentRecordStatus`** enum: `PENDING, PAID, FAILED`.
5. **`PaymentRepository`** — `JpaRepository<Payment,UUID>`; `Optional<Payment> findByVnpTxnRef(String)`.
6. **`VNPaySignatureUtil`**:
   - `String hmacSHA512(String key, String data)` — using `javax.crypto.Mac`, hex-encode uppercase.
   - `String buildSignData(Map<String,String> params)` — sort keys ascending, URL-encode values (`URLEncoder.encode(v, US_ASCII)`), join `k=v&...` (per VNPay spec — excludes `vnp_SecureHash` and `vnp_SecureHashType`).
   - `boolean verify(Map<String,String> params, String secret)` — extract `vnp_SecureHash`, rebuild signature, compare with `MessageDigest.isEqual`.
7. **`VNPayUrlBuilder`**:
   - `String build(Order order, String vnpTxnRef, String clientIp, VNPayProperties props)`:
     - Build `TreeMap<String,String>` with: `vnp_Version`, `vnp_Command`, `vnp_TmnCode`, `vnp_Amount` (= `totalAmount*100` toBigInteger), `vnp_CurrCode="VND"`, `vnp_TxnRef`, `vnp_OrderInfo="Thanh toan don hang " + orderNumber`, `vnp_OrderType="other"`, `vnp_Locale="vn"`, `vnp_ReturnUrl`, `vnp_IpAddr=clientIp`, `vnp_CreateDate` (yyyyMMddHHmmss in Asia/Ho_Chi_Minh), `vnp_ExpireDate` (+15 min).
     - Compute signature; append `vnp_SecureHash`.
     - Return `payUrl + "?" + queryString`.
8. **`VNPayService`**:
   - `createPaymentUrl(UUID orderId, String userIdHeader, String clientIp)`:
     - Load `Order`; verify `order.userId == userIdHeader`. Status must be `PENDING`/`AWAITING_PAYMENT`.
     - Generate `vnpTxnRef = order.orderNumber + "-" + System.currentTimeMillis()`.
     - Persist new `Payment` row (status PENDING).
     - Return `{ paymentUrl: builder.build(...), vnpTxnRef }`.
   - `handleReturn(Map<String,String> params)` — verify signature, return DTO with `success` bool + `message`.
   - `handleIpn(Map<String,String> params)`:
     - If `!signatureUtil.verify(params, props.hashSecret)` → return `{RspCode:"97", Message:"Invalid Signature"}`.
     - `Payment p = paymentRepository.findByVnpTxnRef(params.get("vnp_TxnRef")).orElse(null)`.
     - If null → `{RspCode:"01", Message:"Order Not Found"}`.
     - If `p.status != PENDING` → `{RspCode:"02", Message:"Order already confirmed"}` (idempotency).
     - Compare amount: if `params.vnp_Amount != p.amount*100` → `{RspCode:"04", Message:"Invalid Amount"}`.
     - Set `p.vnpResponseCode`, `p.vnpTransactionNo`, `p.vnpBankCode`, `p.vnpPayDate`, `p.rawResponse=params`.
     - If `params.vnp_ResponseCode.equals("00") && params.vnp_TransactionStatus.equals("00")`:
       - `p.status = PAID`; load order → `order.paymentStatus = PaymentStatus.PAID`; save both.
       - Best-effort `emailService.sendPaymentReceipt(...)` (try/catch).
     - Else: `p.status = FAILED`; `order.paymentStatus = PaymentStatus.FAILED`.
     - Return `{RspCode:"00", Message:"Confirm Success"}`.
9. **`PaymentController`**:
   - `POST /api/v1/payments/vnpay/create` → reads `X-User-Id` header → calls `createPaymentUrl`. Annotate `@RequestBody @Valid CreatePaymentRequest`. Read client IP via `request.getHeader("X-Forwarded-For")` fallback `request.getRemoteAddr()`.
   - `GET /api/v1/payments/vnpay/return` → `@RequestParam Map<String,String> params` → `handleReturn`.
   - `POST /api/v1/payments/vnpay/ipn` → same param binding → `handleIpn`. Always returns 200 with `IpnResponse` JSON.
10. **Update gateway** `application.yml` (route + public-paths).

### Frontend

11. **`paymentService.ts`**:
    - `createVNPay: (orderId) => api.post('/payments/vnpay/create', {orderId}).then(r=>r.data)`
12. **`CheckoutPage.tsx`**:
    - Extend `paymentMethod` enum to include `VNPAY`.
    - Add radio option "Thanh toán qua VNPay".
    - In `checkoutMutation.onSuccess`: if `paymentMethod === 'VNPAY'` → call `paymentService.createVNPay(order.id)` → `window.location.href = res.data.paymentUrl`. Else keep existing navigate.
13. **`PaymentResultPage.tsx`**:
    - Read `useSearchParams()` → `vnp_ResponseCode`, `vnp_TxnRef`.
    - If `vnp_ResponseCode === '00'` show success card with order link; else show failure with retry link.
    - Optionally call `/payments/vnpay/return` for server-side verification and richer message.
14. **`App.tsx`** — add `<Route path="/payment-result" element={<PaymentResultPage />} />`.

## Todo List
- [ ] T3.1 Create V17 migration and apply
- [ ] T3.2 Create `VNPayProperties`
- [ ] T3.3 Create `Payment` entity + `PaymentRecordStatus` enum
- [ ] T3.4 Create `PaymentRepository`
- [ ] T3.5 Create DTOs (`CreatePaymentRequest`, `CreatePaymentResponse`, `IpnResponse`)
- [ ] T3.6 Create `VNPaySignatureUtil` with unit tests against a known VNPay sample
- [ ] T3.7 Create `VNPayUrlBuilder`
- [ ] T3.8 Create `VNPayService`
- [ ] T3.9 Create `PaymentController`
- [ ] T3.10 Add `vnpay:` config block to order-service `application.yml`
- [ ] T3.11 Add gateway route + public paths
- [ ] T3.12 Compile order-service + gateway; run tests
- [ ] T3.13 Create `paymentService.ts`
- [ ] T3.14 Update `CheckoutPage.tsx` (VNPAY option + redirect)
- [ ] T3.15 Create `PaymentResultPage.tsx`
- [ ] T3.16 Add `/payment-result` route to `App.tsx`
- [ ] T3.17 Sandbox E2E with card 9704198526191432198 → verify `orders.payment_status=PAID`
- [ ] T3.18 Negative E2E: cancel on VNPay → IPN/return shows FAILED, status not flipped to PAID

## Success Criteria
- V17 migration applies cleanly.
- Sandbox payment success: `orders.payment_status` flips PENDING→PAID via IPN; `payments.status` = PAID; receipt email sent (best-effort).
- Sandbox payment fail (cancel/wrong OTP): `orders.payment_status` stays PENDING or moves to FAILED; `payments.status` = FAILED.
- Replay test: invoke IPN twice with same `vnp_TxnRef` → second call returns `{RspCode:"02"}` and does NOT mutate state.
- Tampered signature: IPN returns `{RspCode:"97"}` and does NOT mutate state.
- Amount mismatch: IPN returns `{RspCode:"04"}`.
- Existing COD/BANK_TRANSFER flows unchanged.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Signature mismatch (encoding, sort order) | High | High | Unit test `VNPaySignatureUtil` with known VNPay test vector; also `URLEncoder.encode(v, "US-ASCII")` per spec |
| IPN replay | Medium | High | `vnp_TxnRef` unique constraint + status-check guard before update |
| Race: IPN and return URL update at same time | Low | Medium | Idempotency check (`status != PENDING` short-circuit) covers it |
| `vnp_Amount` precision (×100 cast) | Medium | High | Use `order.totalAmount.multiply(BigDecimal.valueOf(100)).toBigInteger().toString()` |
| Public IPN endpoint abused | Medium | Medium | Signature check is the gate; rate-limit at gateway later (out of scope) |
| Migration V17 number already taken | Low | High | Glob check before commit; rename to next free V if needed |
| Order status state-machine rejects PAID transition | Medium | High | Confirm `OrderState` allows the change OR update via dedicated `payment_status` field only (preferred — separate from `status`) |
| Client IP behind proxy | Medium | Low | Read `X-Forwarded-For` first; fallback `getRemoteAddr()` |
| Wrong return URL host in different envs | Medium | Medium | Configurable via `VNPAY_RETURN_URL` env var |

## Security Considerations
- Hash secret only in env. Never logged.
- Constant-time signature comparison (`MessageDigest.isEqual`).
- IPN endpoint validates signature BEFORE any DB read of sensitive data.
- `payments.raw_response` JSONB stores full callback for forensics — but redact `vnp_SecureHash` before persisting.
- All amount math in `BigDecimal` — never `double`.
- Authorization on `create`: verify `order.userId == X-User-Id`. Reject otherwise (`UnauthorizedException`).
- IPN logged at INFO with `vnp_TxnRef` + outcome (no secret, no signature).

## Backwards Compatibility
- No changes to `orders` schema. Only new `payments` table.
- Existing `paymentMethod` values (`COD`, `BANK_TRANSFER`) still accepted; `VNPAY` is additive.
- Existing endpoints untouched.

## Rollback
1. Disable VNPAY radio in FE (single-line change).
2. Drop `payments` table (`DROP TABLE payments;`) — no data loss for orders.
3. Revert gateway public-paths additions.
4. Order rows already with `payment_status=PAID` from VNPay remain valid (settled COD-equivalent).

## Next Steps
- Wire payment-receipt email in `EmailTemplates` (depends on Phase 01 — already done).
- Future: add admin payments list view (out of scope).
- Future: refund flow via VNPay refund API (out of scope).

## Unresolved Questions
- Sandbox `VNPAY_TMN_CODE` and `VNPAY_HASH_SECRET` — need stakeholder to provide.
- Should we transition `Order.status` (state machine) on PAID, or only `paymentStatus`? Plan: only `paymentStatus`. Confirm with order state-machine owner.
- Refund support — deferred.
