# Phase 02 — Forgot Password with OTP (Redis)

**Priority:** P1
**Status:** completed
**Effort:** 3h
**Depends on:** Phase 01 (EmailService)
**Owner files:** `BE/user-service/.../auth/*` (new endpoints), `FE/src/pages/ForgotPassword*`

## Context Links
- Scout finding: V1–V16 contain no OTP/token tables. Email field exists on `User`.
- User decision: 6-digit OTP, Redis-only (no DB), 5-min TTL.
- LoginPage already links to `/forgot-password` (FE/src/pages/LoginPage.tsx:126).

## Overview
Two-step password reset: user submits email → system emails 6-digit OTP → user submits email + OTP + new password → password updated. All state held in Redis under key `otp:{email}` with TTL 300s.

## Key Insights
- No DB schema change required (Redis only).
- Existing `RedisTemplate<String,String>` already wired in user-service (`AuthService` uses it for blacklist).
- Existing `BusinessException` pattern: `throw new BusinessException(code, errorCode, message)`.
- Generic responses prevent email enumeration (always 200 on `/forgot-password`).
- Add rate-limit counter to avoid OTP spam.

## Requirements

### Functional
- F1: `POST /api/v1/auth/forgot-password {email}` → returns 200 always (generic message). If email exists, generates 6-digit OTP, stores `otp:{email}` in Redis TTL 300s, sends email.
- F2: `POST /api/v1/auth/reset-password {email, otp, newPassword}` → validates OTP from Redis. On success: updates `user.passwordHash`, deletes `otp:{email}`, revokes all refresh tokens for user. On failure: 400 INVALID_OTP.
- F3: Rate-limit: max 5 OTP requests per email per hour (`otp:rl:{email}` counter, TTL 3600s).
- F4: OTP attempts: max 5 verification failures per OTP (`otp:attempts:{email}` counter). On 5th failure → delete OTP key, force re-request.
- F5: Both endpoints public (no JWT) → added to `api-gateway` `app.public-paths`.

### Non-Functional
- NF1: OTP = cryptographically random 6 digits (`SecureRandom.nextInt(1_000_000)`, zero-padded).
- NF2: Password validation: min 6 chars (match existing `RegisterRequest` rule).
- NF3: All files ≤ 200 lines.

## Architecture

### Data Flow

**Request OTP:**
```
FE → POST /auth/forgot-password {email}
    → AuthController.forgotPassword
    → PasswordResetService.requestOtp(email)
        ├─ check rate limit otp:rl:{email}
        ├─ if user exists:
        │   ├─ generate 6-digit OTP
        │   ├─ redis SET otp:{email} = otp, EX 300
        │   └─ emailService.sendOtp(email, otp)
        └─ ALWAYS return generic 200
```

**Reset:**
```
FE → POST /auth/reset-password {email, otp, newPassword}
    → AuthController.resetPassword
    → PasswordResetService.reset(email, otp, newPassword)
        ├─ redis GET otp:{email}
        ├─ if missing → 400 OTP_EXPIRED
        ├─ if mismatch → INCR otp:attempts:{email}; if ≥5 → DEL otp:{email}; throw 400 INVALID_OTP
        ├─ user.passwordHash = encode(newPassword); save
        ├─ refreshTokenRepository.revokeAllByUser(user)
        └─ redis DEL otp:{email}, otp:attempts:{email}
```

### Module Layout
```
user-service/.../auth/
├── controller/AuthController.java        (modified: 2 new endpoints)
├── dto/ForgotPasswordRequest.java        (new)
├── dto/ResetPasswordRequest.java         (new)
└── service/PasswordResetService.java     (new)
```

## Related Code Files

### Modify
- `BE/user-service/.../controller/AuthController.java` — add 2 endpoints.
- `BE/user-service/.../email/EmailTemplates.java` — add `otpHtml(otp)`.
- `BE/user-service/.../email/EmailService.java` — add `sendOtp(to, otp)`.
- `BE/api-gateway/src/main/resources/application.yml` — append to `app.public-paths`:
  - `/api/v1/auth/forgot-password`
  - `/api/v1/auth/reset-password`
- `FE/src/services/authService.ts` — add `forgotPassword`, `resetPassword`.
- `FE/src/App.tsx` — add `/forgot-password` route.

### Create
- `BE/user-service/.../dto/ForgotPasswordRequest.java` (`@Email` validated)
- `BE/user-service/.../dto/ResetPasswordRequest.java` (`@Email`, `@Pattern("\\d{6}")`, `@Size(min=6)` for password)
- `BE/user-service/.../service/PasswordResetService.java`
- `FE/src/pages/ForgotPasswordPage.tsx` (two-step form)

### Delete
- None.

## Implementation Steps

### Backend
1. Create `ForgotPasswordRequest` DTO: `email` (`@Email @NotBlank`).
2. Create `ResetPasswordRequest` DTO: `email`, `otp` (`@Pattern(regexp="\\d{6}")`), `newPassword` (`@Size(min=6)`).
3. Create `PasswordResetService`:
   - Inject `UserRepository`, `RefreshTokenRepository`, `PasswordEncoder`, `RedisTemplate<String,String>`, `EmailService`.
   - Constants: `OTP_PREFIX="otp:"`, `RL_PREFIX="otp:rl:"`, `ATTEMPTS_PREFIX="otp:attempts:"`, `TTL=Duration.ofMinutes(5)`, `RL_TTL=Duration.ofHours(1)`, `MAX_REQUESTS=5`, `MAX_ATTEMPTS=5`.
   - `requestOtp(email)`:
     - `Long count = redis.opsForValue().increment(RL_PREFIX+email)` — if 1 → set expire 1h.
     - If `count > MAX_REQUESTS` → log + return silently.
     - `userRepository.findByEmail(email)` — if absent → return silently.
     - `String otp = String.format("%06d", new SecureRandom().nextInt(1_000_000))`.
     - `redis.opsForValue().set(OTP_PREFIX+email, otp, TTL)`.
     - `emailService.sendOtp(email, otp)`.
   - `reset(email, otp, newPassword)`:
     - `String stored = redis.opsForValue().get(OTP_PREFIX+email)`.
     - If null → throw `BusinessException(400,"OTP_EXPIRED","OTP đã hết hạn hoặc không tồn tại")`.
     - If `!stored.equals(otp)`:
       - `Long attempts = redis.opsForValue().increment(ATTEMPTS_PREFIX+email)`.
       - If attempts == 1 → set expire 5 min.
       - If `attempts >= MAX_ATTEMPTS` → `redis.delete(OTP_PREFIX+email)`.
       - Throw `BusinessException(400,"INVALID_OTP","Mã OTP không đúng")`.
     - `User user = userRepository.findByEmail(email).orElseThrow(...NOT_FOUND)`.
     - `user.setPasswordHash(passwordEncoder.encode(newPassword))`.
     - `userRepository.save(user)`.
     - `refreshTokenRepository.revokeAllByUser(user)`.
     - `redis.delete(OTP_PREFIX+email)`; `redis.delete(ATTEMPTS_PREFIX+email)`.
4. Add to `AuthController`:
   - `POST /forgot-password` → `passwordResetService.requestOtp(req.email)` → return `ApiResponse.ok("Nếu email tồn tại, mã OTP đã được gửi", null)`.
   - `POST /reset-password` → `passwordResetService.reset(req.email, req.otp, req.newPassword)` → return `ApiResponse.ok("Đặt lại mật khẩu thành công", null)`.
5. Extend `EmailTemplates.otpHtml(otp)`: simple HTML with the OTP in a large `<div>` and 5-minute notice.
6. Extend `EmailService.sendOtp(to, otp)`: calls `sendHtml(to, "Mã OTP đặt lại mật khẩu", EmailTemplates.otpHtml(otp))`.
7. Update gateway `application.yml` `app.public-paths` (append `/api/v1/auth/forgot-password` and `/api/v1/auth/reset-password`).

### Frontend
8. `authService.ts`:
   - `forgotPassword: (email) => api.post('/auth/forgot-password', {email}).then(r=>r.data)`
   - `resetPassword: (email, otp, newPassword) => api.post('/auth/reset-password', {email, otp, newPassword}).then(r=>r.data)`
9. `ForgotPasswordPage.tsx`:
   - Step 1 form: email field → submit → on success move to step 2, store email in component state.
   - Step 2 form: OTP (6 digits) + new password + confirm password → submit → on success show "Đặt lại thành công" and link to `/login`.
   - Use `react-hook-form` + `zod` matching `LoginPage` style.
   - Show "Gửi lại OTP" button on step 2 (calls forgotPassword again).
10. `App.tsx`: add `<Route path="/forgot-password" element={<ForgotPasswordPage />} />` (lazy import).

## Todo List
- [ ] T2.1 Create `ForgotPasswordRequest` DTO
- [ ] T2.2 Create `ResetPasswordRequest` DTO
- [ ] T2.3 Create `PasswordResetService`
- [ ] T2.4 Add `otpHtml` to `EmailTemplates`
- [ ] T2.5 Add `sendOtp` to `EmailService`
- [ ] T2.6 Add `/forgot-password` and `/reset-password` to `AuthController`
- [ ] T2.7 Append both paths to api-gateway `app.public-paths`
- [ ] T2.8 Compile + run user-service unit tests
- [ ] T2.9 Add `forgotPassword` + `resetPassword` to `authService.ts`
- [ ] T2.10 Create `ForgotPasswordPage.tsx`
- [ ] T2.11 Add route in `App.tsx`
- [ ] T2.12 Manual E2E: full flow → email arrives → reset → re-login

## Success Criteria
- All endpoints return correct status codes per spec.
- Manual: request OTP → email received with 6-digit code → submit OTP + new password → can login with new password.
- Old refresh tokens revoked after reset (verify by attempting refresh → 401).
- Brute force test: 5 wrong OTPs → OTP key deleted → 6th attempt returns OTP_EXPIRED.
- Rate-limit test: 6 OTP requests in 1 hour for same email → 6th request silently skips (no email sent).
- Email enumeration test: request OTP for non-existent email → 200 with generic message (no leak).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OTP brute force | Medium | High | 5-attempt lockout per OTP + 5/hour rate-limit |
| Email enumeration | Medium | Medium | Generic 200 response regardless of email presence |
| Race: OTP requested twice quickly | Medium | Low | `SET` overwrites previous OTP key — last one wins (acceptable) |
| Reset succeeds but token revoke fails | Low | Medium | Transactional `@Transactional` on `reset()` so password update + revoke commit together |
| Redis outage breaks reset flow | Low | High | Document; falls back to error 500 (acceptable degradation) |
| OTP visible in logs | Low | High | Never log the OTP value; only log `email` and outcome |

## Security Considerations
- OTP uses `SecureRandom` (not `Math.random`).
- Constant-time comparison for OTP match — use `MessageDigest.isEqual(stored.getBytes(), otp.getBytes())` to prevent timing attacks.
- New password runs through same `PasswordEncoder` (BCrypt) as registration.
- All refresh tokens revoked after reset (force re-login on all devices).
- HTTPS assumed at gateway; nothing additional needed at service.
- Public-paths additions reviewed in code review.

## Next Steps
- Phase 03 (VNPay) is independent and can run in parallel.
- Future: 2FA login flow could reuse OTP infra (out of scope).

## Unresolved Questions
- Should OTP request rate-limit be per-IP also? Plan: per-email only for now (KISS).
- OTP delivery channel — only email? SMS deferred.
