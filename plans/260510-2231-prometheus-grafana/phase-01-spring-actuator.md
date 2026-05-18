# Phase 01 — Spring Actuator + Micrometer Prometheus Registry

## Context Links
- [plan.md](./plan.md)
- pom.xml structure: `BE/pom.xml` (parent), `BE/{service}/pom.xml` (child)
- Existing yml refs: `BE/api-gateway/src/main/resources/application.yml`, `BE/order-service/src/main/resources/application.yml`

## Overview
- Priority: P2 (blocking phases 2 & 3)
- Status: pending
- Add `spring-boot-starter-actuator` to 3 services missing it; add `micrometer-registry-prometheus` to all 7; standardize `management:` block in every `application.yml` to expose `prometheus,health,info,metrics`.

## Key Insights
- Spring Boot 3.3 ships micrometer 1.13.x — `micrometer-registry-prometheus` artifact (not the new `micrometer-registry-prometheus-simpleclient`). Plan uses the standard one to avoid breaking change risk.
- Actuator + registry on classpath auto-creates `/actuator/prometheus` endpoint; it must still be exposed via `management.endpoints.web.exposure.include`.
- Spring Cloud Gateway is reactive — actuator endpoints work via WebFlux, no special config needed.
- `management.metrics.tags.application=${spring.application.name}` ensures multi-service metrics carry a service label (Grafana variable filter).

## Requirements

### Functional
- Each service exposes `GET /actuator/prometheus` returning text/plain metrics.
- Each service exposes `GET /actuator/health` (already common, just standardize).
- Metrics carry `application=<service-name>` tag.

### Non-functional
- No new ports — actuator served on the same `server.port`.
- Negligible CPU/mem overhead (<5MB heap, <1% CPU per service).

## Architecture

### Data flow per service
```
HTTP request ─► Spring MVC/WebFlux ─► Micrometer Timer (auto via spring-boot-actuator)
                                       │
                                       ▼
                                 PrometheusMeterRegistry
                                       │
                                       ▼
                              GET /actuator/prometheus  (text/plain)
```

### Dependency injection
Add to **every** service pom.xml (idempotent — Maven dedupes):
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```
`micrometer-registry-prometheus` version is managed by `spring-boot-dependencies` BOM — do NOT pin a version.

## Related Code Files

### To MODIFY (pom.xml — add deps)
- `BE/inventory-service/pom.xml` (add actuator + prometheus registry)
- `BE/fulfillment-service/pom.xml` (add actuator + prometheus registry)
- `BE/delivery-service/pom.xml` (add actuator + prometheus registry)
- `BE/api-gateway/pom.xml` (add prometheus registry only — actuator present)
- `BE/user-service/pom.xml` (add prometheus registry only)
- `BE/order-service/pom.xml` (add prometheus registry only)
- `BE/product-service/pom.xml` (add prometheus registry only)

### To MODIFY (application.yml — add/extend management block)
- `BE/api-gateway/src/main/resources/application.yml` (extend existing block)
- `BE/user-service/src/main/resources/application.yml` (add new block)
- `BE/order-service/src/main/resources/application.yml` (extend existing block)
- `BE/product-service/src/main/resources/application.yml` (extend existing block)
- `BE/inventory-service/src/main/resources/application.yml` (add new block)
- `BE/fulfillment-service/src/main/resources/application.yml` (add new block)
- `BE/delivery-service/src/main/resources/application.yml` (add new block)

### To CREATE
- None.

### To DELETE
- None.

## Implementation Steps

1. **Add dependencies** to the 3 services missing actuator (inventory, fulfillment, delivery): both `spring-boot-starter-actuator` and `micrometer-registry-prometheus` blocks.

2. **Add prometheus registry only** to the 4 services that already have actuator (api-gateway, user, order, product).

3. **Standardize management block** in all 7 `application.yml` files. Use exactly:
   ```yaml
   management:
     endpoints:
       web:
         exposure:
           include: health,info,metrics,prometheus
     endpoint:
       health:
         show-details: when-authorized
         probes:
           enabled: true
       prometheus:
         enabled: true
     metrics:
       tags:
         application: ${spring.application.name}
       distribution:
         percentiles-histogram:
           http.server.requests: true
     prometheus:
       metrics:
         export:
           enabled: true
   ```
   For `api-gateway` and `order-service` (existing block), REPLACE the existing `management:` section with the standardized one above.

4. **Compile check** — from `BE/`:
   ```powershell
   .\mvnw.cmd -pl inventory-service,fulfillment-service,delivery-service,api-gateway,user-service,order-service,product-service compile
   ```
   (or `mvn compile` if wrapper absent). MUST succeed for all 7 modules.

5. **Smoke test (manual, one service at a time)**:
   ```powershell
   # Start one service, e.g. user-service on 8081
   curl http://localhost:8081/actuator/prometheus | Select-String "jvm_memory_used_bytes"
   ```
   Expected: at least one matching line containing `application="user-service"`.

6. **Verify all 7** services expose the endpoint by repeating step 5 for each port (8080–8086).

## Todo List

- [ ] Add `spring-boot-starter-actuator` + `micrometer-registry-prometheus` to inventory-service/pom.xml
- [ ] Add `spring-boot-starter-actuator` + `micrometer-registry-prometheus` to fulfillment-service/pom.xml
- [ ] Add `spring-boot-starter-actuator` + `micrometer-registry-prometheus` to delivery-service/pom.xml
- [ ] Add `micrometer-registry-prometheus` to api-gateway/pom.xml
- [ ] Add `micrometer-registry-prometheus` to user-service/pom.xml
- [ ] Add `micrometer-registry-prometheus` to order-service/pom.xml
- [ ] Add `micrometer-registry-prometheus` to product-service/pom.xml
- [ ] Apply standardized `management:` block to all 7 application.yml files
- [ ] `mvn compile` passes for all 7 modules
- [ ] `/actuator/prometheus` returns metrics on all 7 ports (8080-8086)
- [ ] Confirm `application=<service>` tag present on output

## Success Criteria
- All 7 modules compile cleanly.
- All 7 endpoints return HTTP 200 with `Content-Type: text/plain; version=0.0.4` (or similar).
- Sample query `jvm_memory_used_bytes{application="user-service"}` returns at least one series.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Duplicate `management:` blocks (yaml has 2 roots) cause boot failure | Low | High | Search each file for existing `management:` first; replace, not append |
| Actuator exposes sensitive info (env, configprops) by default | Low | Med | Only `health,info,metrics,prometheus` exposed; no `env`, `beans`, `heapdump` |
| API Gateway WebFlux + actuator subtle conflict | Low | Med | api-gateway already has actuator; only adding registry — no behavior change |
| Order-service WebSocket endpoint metrics noisy | Med | Low | Acceptable in dev; can filter via `management.metrics.enable.<name>=false` later |
| `prometheus` endpoint not enabled when registry on classpath but config missing | Low | High | Explicit `management.endpoint.prometheus.enabled=true` in standardized block |

## Security Considerations
- `/actuator/health` set to `show-details: when-authorized` — anonymous gets only UP/DOWN, not subsystem detail.
- `/actuator/prometheus` is unauthenticated; api-gateway already lists `/actuator/**` in `app.public-paths`. Acceptable for dev/single-VM. **Production hardening (out of scope):** restrict via firewall, basic-auth, or move to a `management.server.port` only bound to internal network.
- No secrets in metric labels (Spring auto-generated metrics are safe; do not add custom tags from request bodies).

## Next Steps
- Phase 2 (`phase-02-docker-monitoring-stack.md`) — depends on these endpoints being live.
- Future enhancement (out of scope here): add custom business metrics (`@Timed`, `Counter`) for order placements, inventory reservations.
