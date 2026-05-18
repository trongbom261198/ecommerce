# Phase 05 — Google OAuth2 Login

## Context Links
- Owning service: `BE/user-service`
- Gateway: `BE/api-gateway` (must allow OAuth2 callback path unauthenticated)
- Migration: `V22__add_oauth_providers.sql` in `BE/user-service/.../db/migration/`
- Existing: `AuthController`, `AuthService`, `JwtService`, `User` entity (already has email + role + JWT issuance)

## Overview
- **Priority:** P2
- **Status:** complete
- **Effort:** 8h (largest — touches security + flow)
- "Continue with Google" button on login + register pages. On callback, server creates user if new (provider=GOOGLE), then issues the same JWT (access + refresh) that password login uses. Frontend receives tokens via redirect and proceeds as logged-in.

## Key Insights
- Spring Boot has first-class `spring-boot-starter-oauth2-client`. We use it in **user-service** (not gateway) because user-service already owns auth and JWT issuance.
- Flow: FE → user-service `/oauth2/authorization/google` → Google → user-service `/login/oauth2/code/google` (callback) → user-service generates JWT + redirects to FE with tokens in URL fragment.
- The **callback URL must be reachable end-to-end**, meaning gateway must forward `/oauth2/**` and `/login/oauth2/**` to user-service without JWT auth filter (these are pre-auth endpoints).
- Email collision rule: if a user with same email exists as PASSWORD, we link the Google identity to the same user (one user = many auth providers).
- Pass tokens to FE via redirect with **URL fragment** (`#access=...&refresh=...`) — fragments are NOT sent to server, safer than query params. FE reads on mount, hydrates authStore, immediately `replaceState` to clean URL.

## Requirements
**Functional:**
- GET `/oauth2/authorization/google` — Spring kicks off OAuth2 dance
- GET `/login/oauth2/code/google` — callback handler issues JWT + redirects to FE
- POST `/api/v1/auth/oauth/exchange` — fallback REST endpoint accepting `{idToken}` from FE-side Google SDK (optional, only if redirect flow has issues)
- New user: row inserted with `provider=GOOGLE`, `provider_subject=google_sub`, `email`, `full_name`, `password_hash=NULL`, `email_verified=true`
- Existing email user (PASSWORD): row updated to add `provider=GOOGLE` linkage (separate `user_identities` table — see schema)

**Non-functional:**
- CSRF protection via state param (handled by Spring oauth2-client)
- ID token signature verified (Spring does this)
- Refresh token revocable same as password flow (existing `RefreshToken` entity)

## Architecture

```
FE LoginPage
  │ user clicks "Continue with Google"
  │ window.location = "http://localhost:8080/oauth2/authorization/google"
  ▼
Gateway routes /oauth2/** → user-service:8081 (no JWT filter on this path)
  ▼
user-service Spring OAuth2 client redirects to:
  accounts.google.com/o/oauth2/auth?client_id=...&redirect_uri=http://localhost:8080/login/oauth2/code/google&state=...
  ▼
User authenticates with Google
  ▼
Google → GET /login/oauth2/code/google?code=...&state=...
  ▼
Gateway forwards → user-service (still pre-auth)
  ▼
Spring exchanges code for ID token, verifies sig, surfaces OAuth2User
  ▼
OAuth2LoginSuccessHandler.onAuthenticationSuccess(request, response, auth):
   1. extract email, sub, name from OAuth2User
   2. find user by user_identities(provider=GOOGLE, provider_subject=sub)
      → if found: load user
      → else find user by email
           → if found: link (insert user_identities row)
           → else: create user (provider=GOOGLE, email_verified=true)
   3. issue access + refresh JWT (reuse AuthService.issueTokens(user))
   4. redirect to FE: http://localhost:5173/oauth/callback#access=...&refresh=...&exp=...
  ▼
FE /oauth/callback page reads fragment → authStore.setTokens() → navigate("/")
```

## DB Schema (V22)

```sql
-- Multi-provider identity link
CREATE TABLE user_identities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          VARCHAR(20) NOT NULL,                    -- 'GOOGLE', 'PASSWORD'
    provider_subject  VARCHAR(255) NOT NULL,                   -- google 'sub' or email for PASSWORD
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_subject)
);
CREATE INDEX idx_user_identities_user ON user_identities(user_id);

-- Existing password users get a PASSWORD identity backfilled
INSERT INTO user_identities (user_id, provider, provider_subject)
SELECT id, 'PASSWORD', email FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM user_identities ui WHERE ui.user_id = users.id AND ui.provider = 'PASSWORD'
);

-- Password optional now
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

> `users` table did not declare `password_hash NOT NULL` in V1 explicitly (entity uses `@Column` without nullable=false on the column attribute). Verify before applying the `DROP NOT NULL` — keep idempotent.

## Files to Create

**BE (user-service):**
- `oauth/entity/UserIdentity.java`
- `oauth/entity/AuthProvider.java` (enum: GOOGLE, PASSWORD)
- `oauth/repository/UserIdentityRepository.java`
- `oauth/service/OAuth2UserLinkService.java` (find-or-link-or-create)
- `oauth/handler/OAuth2LoginSuccessHandler.java`
- `oauth/handler/OAuth2LoginFailureHandler.java` (redirect to FE with `?error=...`)
- `oauth/config/OAuth2ClientProperties.java` (optional, for clarity)
- `db/migration/V22__add_oauth_providers.sql`

**FE:**
- `src/pages/OAuthCallbackPage.tsx`
- `src/components/auth/GoogleLoginButton.tsx`

## Files to Modify

**BE:**
- `BE/user-service/pom.xml` — add `spring-boot-starter-oauth2-client`
- `BE/user-service/src/main/resources/application.yml` — add `spring.security.oauth2.client.registration.google.*` (clientId, clientSecret, scope=openid,profile,email, redirect-uri)
- `BE/user-service/.../config/SecurityConfig.java` — enable `.oauth2Login(o -> o.successHandler(...).failureHandler(...))`; permit `/oauth2/**`, `/login/oauth2/**`
- `BE/user-service/.../service/AuthService.java` — extract `issueTokens(User)` method (currently inline in login flow); reused by success handler
- `BE/user-service/.../entity/User.java` — `passwordHash` nullable (already nullable column-wise; verify entity annotation)
- `BE/api-gateway/.../config/RouteConfig.java` or equivalent — route `/oauth2/**` and `/login/oauth2/**` to user-service; ensure JWT filter skips these paths

**FE:**
- `FE/src/App.tsx` — add `/oauth/callback` route → `OAuthCallbackPage`
- `FE/src/pages/LoginPage.tsx` — mount `<GoogleLoginButton>`
- `FE/src/pages/RegisterPage.tsx` — mount `<GoogleLoginButton>`
- `FE/src/store/authStore.ts` — accept tokens from URL fragment via new `setTokens(access, refresh)` method (may already exist)

## Implementation Steps

1. V22 migration — write + apply + verify backfill.
2. Entity + enum + repository.
3. Add Maven dep `spring-boot-starter-oauth2-client` to user-service.
4. `application.yml`:
   ```yaml
   spring:
     security:
       oauth2:
         client:
           registration:
             google:
               client-id: ${GOOGLE_CLIENT_ID}
               client-secret: ${GOOGLE_CLIENT_SECRET}
               scope: [openid, profile, email]
               redirect-uri: "${OAUTH2_REDIRECT_URI:http://localhost:8080/login/oauth2/code/google}"
   app:
     oauth2:
       fe-redirect-base: ${FE_OAUTH_REDIRECT:http://localhost:5173/oauth/callback}
   ```
5. `SecurityConfig` — add OAuth2 chain, permit `/oauth2/**` and `/login/oauth2/**`, register handlers.
6. `OAuth2LoginSuccessHandler`:
   - Cast `Authentication.getPrincipal()` → `OAuth2User`
   - Extract email, sub, name, picture
   - Call `OAuth2UserLinkService.findOrCreate(provider=GOOGLE, sub, email, name)`
   - Issue tokens via `AuthService.issueTokens(user)` → `(accessToken, refreshToken, expiresIn)`
   - `response.sendRedirect(feRedirectBase + "#access=" + access + "&refresh=" + refresh + "&exp=" + expiresIn)`
7. `OAuth2LoginFailureHandler` → redirect `feRedirectBase + "?error=oauth_failed"`
8. Gateway: confirm `/oauth2/**` and `/login/oauth2/**` are routed and bypass JWT filter.
9. FE `GoogleLoginButton.tsx` — simple anchor `href={GATEWAY_URL + "/oauth2/authorization/google"}` with Google branding.
10. FE `OAuthCallbackPage`:
    - `useEffect` parse `window.location.hash` → `URLSearchParams`
    - if `access` & `refresh`: `authStore.setTokens(access, refresh)`; `history.replaceState(null, "", "/oauth/callback")`; `navigate("/")`
    - if `?error=`: show toast + redirect to `/login`
11. Add `<GoogleLoginButton>` to LoginPage + RegisterPage.
12. Manual E2E with Google test credentials.
13. Document required Google Cloud Console redirect URI: `http://localhost:8080/login/oauth2/code/google` (dev) and prod equivalent.

## Todo List

- [x] V19 migration (user-service) — user_identities table + PASSWORD backfill + password_hash nullable
- [x] BE entity + enum + repository (UserIdentity, AuthProvider, UserIdentityRepository)
- [x] Maven dep + application.yml (spring-boot-starter-oauth2-client, GOOGLE_CLIENT_ID/SECRET env vars)
- [x] OAuth2UserLinkService (findOrCreate: lookup by sub → email → create)
- [x] OAuth2LoginSuccessHandler + FailureHandler
- [x] SecurityConfig wiring (oauth2Login, permit /oauth2/**, /login/oauth2/**)
- [x] AuthService.issueTokens(user) extracted as public method
- [x] Gateway routes + bypass JWT for /oauth2/** and /login/oauth2/**
- [x] FE OAuthCallbackPage (hash fragment → loginWithTokens → navigate "/")
- [x] FE GoogleLoginButton (anchor href → gateway /oauth2/authorization/google)
- [x] LoginPage integration (GoogleLoginButton + divider — already done by previous agent)
- [x] RegisterPage integration (GoogleLoginButton + divider)
- [x] App.tsx — /oauth/callback route added
- [x] authStore.loginWithTokens (decodes JWT payload, sets user + tokens)
- [ ] Google Cloud Console setup (manual): create OAuth2 client, set redirect URI `http://localhost:8080/login/oauth2/code/google`
- [ ] Manual E2E
- [ ] Unit test: OAuth2UserLinkService find/link/create matrix
- **Note:** Migration renamed V22→V19 to match user-service actual sequence (V1–V18 existed).

## Success Criteria

- New user: click Google → consent → land back on home, navbar shows email; users table has new row with `password_hash IS NULL`, user_identities has GOOGLE row.
- Existing password user with same email: click Google → linked → user_identities now has both PASSWORD and GOOGLE rows for same user_id.
- Failure (user denies consent): redirect to `/login?error=oauth_failed` with visible toast.
- Refresh token works same as password flow.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tokens in URL fragment leaked via referer | L | M | Fragment never sent in Referer header; immediate `replaceState` clears history; HTTPS-only in prod |
| Email collision lets attacker hijack PASSWORD account | M | H | Only link if Google `email_verified == true` in ID token claims; require explicit account link UX for unverified emails (defer to Tier 2; v1 = require verified email) |
| Gateway JWT filter blocks /oauth2/** | M | H | Explicit allow-list in gateway config; smoke test before launch |
| CSRF on OAuth callback | L | H | Spring oauth2-client state param handles this — do not disable |
| Refresh token reuse across providers | L | L | RefreshToken entity unchanged; tied to user_id, provider-agnostic |
| Google clientId/Secret leak | L | H | Use env vars; never commit; docker-compose `.env` (gitignored) |
| Failure redirect loops | L | L | Failure handler always sends to `/login?error=...`, never re-attempts |

## Security Considerations
- **MUST** verify `email_verified == true` claim before linking to existing email.
- Client secret stored as env var only.
- Redirect URI hardcoded in Google Console — prevents arbitrary redirect attacks.
- Refresh token rotation already implemented (existing flow) — reuse unchanged.
- State param (CSRF protection) handled automatically by Spring oauth2-client.
- Use `openid` scope explicitly to receive ID token with verified email.

## Backwards Compatibility
- `password_hash` now nullable — existing users with password unaffected (column still has value).
- `user_identities` backfill ensures existing users have PASSWORD identity row → uniform queries going forward.
- Password login flow untouched.
- `/api/v1/auth/login` continues to work for password users; OAuth users get same JWT shape.

## Rollback Plan
- BE: disable `.oauth2Login()` in SecurityConfig; drop `user_identities` (keep backfill rolled back); restore `password_hash NOT NULL` only if no NULL rows exist.
- FE: `FEATURES.googleOAuth = false` → hide button; remove `/oauth/callback` route.
- Existing password users: zero impact.

## Next Steps / Dependencies
- Tier 2: Facebook/Apple providers (reuse `user_identities`), explicit "Link account" UX in profile, force-verify email for new Google sign-ups with mismatched email domain.

## External Setup Checklist
- [ ] Create OAuth2 client in Google Cloud Console
- [ ] Set Authorized redirect URI: `http://localhost:8080/login/oauth2/code/google` (dev), prod URL
- [ ] Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `BE/.env` (gitignored)
- [ ] Set `FE_OAUTH_REDIRECT` and `OAUTH2_REDIRECT_URI` in docker-compose env
