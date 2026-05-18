# Phase 01 — Email Infrastructure

**Priority:** P1
**Status:** completed
**Effort:** 3h
**Blocks:** Phase 02, Phase 03
**Owner files:** `BE/user-service/.../email/*`, `BE/order-service/.../email/*`

## Context Links
- Scout finding: no Spring Mail config exists anywhere in the codebase.
- User decision: Gmail SMTP, App Password, port 587 STARTTLS, plain Java string templates (no Thymeleaf).
- Triggers needed: order confirmed, order shipped, user registered.

## Overview
Provide a thin reusable `EmailService` in **both** `user-service` and `order-service`. Same code shape in both modules (acceptable duplication — common module would require a Spring auto-config which violates KISS at this scale; ~40 LOC each side).

## Key Insights
- Spring Boot `JavaMailSender` is auto-configured from `spring.mail.*` properties.
- `MimeMessageHelper` handles HTML body + UTF-8 + `From`/`To`/`Subject`.
- Sending must be `@Async` so SMTP latency doesn't block HTTP request threads.
- Failure must NOT abort the calling business operation — log + swallow.

## Requirements

### Functional
- F1: `EmailService.sendHtml(to, subject, htmlBody)` sends an HTML email.
- F2: Welcome email fires on user registration (user-service).
- F3: Order confirmation email fires when order is placed (order-service, on `Order` save with status `PENDING`).
- F4: Order shipped email fires when shipment status transitions to SHIPPED (order-service).
- F5: All sends are async; SMTP failure logs WARN but does not throw.

### Non-Functional
- NF1: SMTP credentials only via env vars; never committed to YAML defaults.
- NF2: Connection timeout 10s, send timeout 10s.
- NF3: Each `EmailService` file ≤ 100 lines.

## Architecture

### Data Flow
```
[Controller / Service] → EmailService.sendHtml() → JavaMailSender → Gmail SMTP
                                       ↓ (failure)
                                    log.warn (no exception propagation)
```

### Module Layout (per service)
```
.../email/
├── EmailService.java         # send + async + try/catch
├── EmailTemplates.java       # static String builders (welcome, orderConfirmed, orderShipped)
└── MailProperties.java       # @ConfigurationProperties(prefix="app.mail") - holds 'from'
```

### Configuration (added to BOTH services' `application.yml`)
```yaml
spring:
  mail:
    host: ${MAIL_HOST:smtp.gmail.com}
    port: ${MAIL_PORT:587}
    username: ${MAIL_USERNAME:}
    password: ${MAIL_PASSWORD:}
    properties:
      mail:
        smtp:
          auth: true
          starttls:
            enable: true
          connectiontimeout: 10000
          timeout: 10000
          writetimeout: 10000

app:
  mail:
    from: ${MAIL_FROM:noreply@ecommerce.local}
    from-name: ${MAIL_FROM_NAME:E-Commerce}
    enabled: ${MAIL_ENABLED:true}
```

## Related Code Files

### Modify
- `BE/user-service/pom.xml` — add `spring-boot-starter-mail`.
- `BE/order-service/pom.xml` — add `spring-boot-starter-mail`.
- `BE/user-service/src/main/resources/application.yml` — add `spring.mail.*` + `app.mail.*`.
- `BE/order-service/src/main/resources/application.yml` — add `spring.mail.*` + `app.mail.*`.
- `BE/user-service/.../UserServiceApplication.java` — add `@EnableAsync`.
- `BE/order-service/.../OrderServiceApplication.java` — add `@EnableAsync`.
- `BE/user-service/.../service/AuthService.java` — invoke `emailService.sendWelcome()` after `userRepository.save(user)` in `register()`.
- `BE/order-service/.../service/OrderService.java` — invoke `emailService.sendOrderConfirmation()` after order persisted.
- `BE/order-service/.../service/ShipmentService.java` (or equivalent) — invoke `emailService.sendOrderShipped()` on SHIPPED transition.

### Create
- `BE/user-service/src/main/java/com/ecommerce/userservice/email/EmailService.java`
- `BE/user-service/src/main/java/com/ecommerce/userservice/email/EmailTemplates.java`
- `BE/user-service/src/main/java/com/ecommerce/userservice/email/MailProperties.java`
- `BE/order-service/src/main/java/com/ecommerce/orderservice/email/EmailService.java`
- `BE/order-service/src/main/java/com/ecommerce/orderservice/email/EmailTemplates.java`
- `BE/order-service/src/main/java/com/ecommerce/orderservice/email/MailProperties.java`

### Delete
- None.

## Implementation Steps

1. Add `spring-boot-starter-mail` dependency to both `pom.xml`s.
2. Create `MailProperties` (`@ConfigurationProperties(prefix="app.mail")`) holding `from`, `fromName`, `enabled` in each service.
3. Create `EmailTemplates` with static methods:
   - `welcomeHtml(fullName)` — "Chào {name}, chào mừng bạn đến với E-Commerce..."
   - `orderConfirmedHtml(orderNumber, totalAmount)` — order summary
   - `orderShippedHtml(orderNumber, trackingNumber)` — shipping notice
4. Create `EmailService`:
   - Inject `JavaMailSender`, `MailProperties`.
   - `@Async` `sendHtml(String to, String subject, String html)` method.
   - If `!properties.enabled` → return silently (lets local dev skip).
   - Build `MimeMessage` via `MimeMessageHelper(msg, true, "UTF-8")`, `setFrom(from, fromName)`, `setTo`, `setSubject`, `setText(html, true)`.
   - Wrap in `try/catch (Exception)` → `log.warn("email send failed: {}", e.getMessage())`. Never throw.
   - Convenience methods: `sendWelcome(to, name)`, `sendOrderConfirmation(to, orderNumber, total)`, `sendOrderShipped(to, orderNumber, tracking)`.
5. Add `@EnableAsync` on each `*Application` main class.
6. Wire calls:
   - `AuthService.register()` → after `userRepository.save(user)` call `emailService.sendWelcome(user.getEmail(), user.getFullName())`.
   - `OrderService.checkout()` (or wherever order persists) → fetch user email via header `X-User-Email` (already injected by gateway) and call `emailService.sendOrderConfirmation(...)`.
   - Shipment SHIPPED transition → `emailService.sendOrderShipped(...)`.
7. Document env vars in `docs/project-changelog.md` and a `.env.example` if one exists.

## Todo List
- [ ] T1.1 Add `spring-boot-starter-mail` to user-service `pom.xml`
- [ ] T1.2 Add `spring-boot-starter-mail` to order-service `pom.xml`
- [ ] T1.3 Update `application.yml` for both services (mail config block)
- [ ] T1.4 Create `MailProperties` in user-service
- [ ] T1.5 Create `MailProperties` in order-service
- [ ] T1.6 Create `EmailTemplates` in user-service
- [ ] T1.7 Create `EmailTemplates` in order-service
- [ ] T1.8 Create `EmailService` in user-service
- [ ] T1.9 Create `EmailService` in order-service
- [ ] T1.10 Add `@EnableAsync` to both `*Application` classes
- [ ] T1.11 Wire `sendWelcome` in `AuthService.register`
- [ ] T1.12 Wire `sendOrderConfirmation` in `OrderService` checkout path
- [ ] T1.13 Wire `sendOrderShipped` in shipment SHIPPED transition
- [ ] T1.14 Compile both services (`mvn -pl user-service -am compile`, same for order-service)
- [ ] T1.15 Manual test: register a new user with a real Gmail address — verify inbox

## Success Criteria
- Both services compile clean.
- `mvn -pl user-service test` passes; same for order-service.
- Manual: registering a user delivers welcome email within 30s.
- Manual: SMTP wrong-password scenario logs WARN but registration still succeeds (graceful failure verified).
- No SMTP credentials in any committed file.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gmail rate-limit (500/day free) | Medium | Medium | Document; production should use SES/SendGrid later (out of scope) |
| Async errors silently swallowed | Medium | Low | Always `log.warn` with full exception message + recipient |
| App Password committed | Low | High | Code review checklist; CI grep for "MAIL_PASSWORD:" with non-empty default |
| Email blocks request thread | Low | Medium | `@Async` + `@EnableAsync` enforced via test |
| Template HTML rendering quirks across clients | Low | Low | Plain `<table>`-free single-column layout; inline styles only |

## Security Considerations
- Use Gmail App Password (not real password). Never commit.
- `From` address is the Gmail account; `Reply-To` not set (KISS).
- HTML body must escape user-controlled values (full name, order number) — use `org.apache.commons.text.StringEscapeUtils` or a simple `.replace("<","&lt;")` helper in `EmailTemplates`.
- No file attachments supported (KISS, attack-surface reduction).

## Next Steps
- Phase 02 reuses `EmailService.sendHtml` for OTP delivery.
- Phase 03 reuses order-service `EmailService` for payment receipts (optional stretch).

## Unresolved Questions
- Welcome email blocking? Plan: async, fire-and-forget. Confirm.
- Brand "from name" — using "E-Commerce" placeholder.
