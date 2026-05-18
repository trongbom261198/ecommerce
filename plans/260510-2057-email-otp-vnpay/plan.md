---
title: "Email Infrastructure + Forgot Password OTP + VNPay Payment"
description: "Three coupled features: Gmail SMTP foundation, Redis-backed OTP password reset, and VNPay payment gateway with IPN webhook"
status: completed
priority: P1
effort: 12h
branch: main
tags: [email, otp, vnpay, payment, auth, infrastructure]
created: 2026-05-10
completed: 2026-05-10
---

# Plan: Email + Forgot Password OTP + VNPay

## Goal
Add three production-grade features to the e-commerce platform:
1. Shared email infrastructure (Gmail SMTP) reused across services.
2. Forgot-password flow using 6-digit OTP stored in Redis (no DB table).
3. VNPay payment gateway integrated into order-service with IPN webhook.

## Phase Sequencing & Dependencies

| # | Phase | Depends On | Effort | File Owner |
|---|-------|-----------|--------|------------|
| 01 | Email Infrastructure | none | 3h | user-service + order-service `email/*` |
| 02 | Forgot Password OTP | Phase 01 | 3h | user-service `auth/*`, FE `pages/ForgotPassword*` |
| 03 | VNPay Payment Gateway | Phase 01 | 6h | order-service `payment/*`, V17 migration, FE `pages/Payment*` |

**Critical path:** Phase 01 must complete before 02 or 03 since both depend on `EmailService`.
Phase 02 and 03 can run in **parallel** after 01 completes — they touch disjoint modules.

## Phase Status

| Phase | Status | File |
|-------|--------|------|
| 01 — Email Infrastructure | completed | [phase-01-email-infrastructure.md](./phase-01-email-infrastructure.md) |
| 02 — Forgot Password OTP | completed | [phase-02-forgot-password-otp.md](./phase-02-forgot-password-otp.md) |
| 03 — VNPay Payment | completed | [phase-03-vnpay-payment.md](./phase-03-vnpay-payment.md) |

## Cross-cutting Decisions

- **Gmail SMTP** with App Password, port 587 STARTTLS. Env vars: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`.
- **Email content** = plain Java string templates (no Thymeleaf — KISS).
- **OTP storage** = Redis only (`otp:{email}` TTL 300s). No DB table.
- **VNPay payment record** = new `payments` table (V17) for idempotency + audit.
- **Migrations** all live in `BE/user-service/src/main/resources/db/migration/` (project convention).
- **Email send is async + non-blocking** — failures must NOT break business flow (catch + log).
- **Public IPN endpoint** added to `api-gateway` `app.public-paths` so VNPay can callback without JWT.

## Global Risks

| Risk | Phase | Mitigation |
|------|-------|------------|
| Gmail App Password leaked in repo | 01 | Env vars only, never in `application.yml` defaults |
| Email outage breaks register/order flows | 01 | `@Async` + try/catch; log error, don't throw |
| OTP brute force | 02 | Rate-limit `forgot-password` per email (Redis counter, max 5/hour); OTP attempt counter |
| OTP enumeration via timing | 02 | Always return generic success message regardless of email existence |
| VNPay IPN replay | 03 | Idempotency on `vnp_TxnRef` in `payments` table; status check before update |
| VNPay signature spoofing | 03 | Strict HMAC-SHA512 verify on ALL params except `vnp_SecureHash` |
| IPN race with return URL | 03 | IPN is source of truth; return URL only navigates user; both check current status |
| Migration V17 collision with concurrent work | 03 | Reserve V17 now; check `V17` doesn't already exist before commit |

## Backwards Compatibility

- Phase 01: New dependency only. No existing API changes. Failure is graceful.
- Phase 02: New endpoints only. Login/register/refresh untouched.
- Phase 03: New `payments` table + new endpoints. Existing `Order.paymentStatus` & `paymentMethod` reused (no schema change to `orders`). `BANK_TRANSFER` and `COD` still work.

## Test Matrix

| Layer | Phase 01 | Phase 02 | Phase 03 |
|-------|----------|----------|----------|
| Unit | EmailService send/format | OTP generate, validate, expire | Signature build/verify, URL build |
| Integration | Mock SMTP server (GreenMail) | Redis test container, full forgot-password flow | IPN webhook with valid/invalid signatures |
| Manual / E2E | Send real test email | Full FE flow: request → email → reset | Sandbox: 9704198526191432198 |

## Rollback Plan

| Phase | Rollback |
|-------|----------|
| 01 | Remove `spring-boot-starter-mail` deps + `EmailService` files. No data impact. |
| 02 | Remove forgot-password endpoints + FE pages. Redis keys self-expire. No schema change. |
| 03 | Drop `payments` table (`DROP TABLE payments`). Revert FE checkout to COD/BANK_TRANSFER only. Disable IPN public path. |

## Success Criteria

- All 3 phases marked `completed` with tests green.
- Manual smoke: register sends welcome email; forgot-password OTP arrives in inbox; VNPay sandbox payment updates `orders.payment_status = PAID`.
- No regressions: existing login/register/checkout/cart flows unaffected.
- `docs/project-changelog.md` updated.

## Unresolved Questions

- VNPay `vnp_TmnCode` and `vnp_HashSecret` — assume provided via env at deploy; confirm sandbox credentials with stakeholder.
- Email FROM display name — using "E-Commerce" placeholder; confirm brand name.
- Should welcome email be blocking on register? Plan = async fire-and-forget. Confirm OK.
